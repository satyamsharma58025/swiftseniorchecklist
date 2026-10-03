import fs from "node:fs";
import path from "node:path";
import { runInNewContext } from "node:vm";

import { describe, expect, it, vi } from "vitest";

const source = fs.readFileSync(path.join(process.cwd(), "integrations/google-form/FormBridge.gs"), "utf8");
const functionNames = [
  "classifyAppStatus_",
  "retryDelayMs_",
  "deadLetterPayload_",
  "postToApp_",
  "notifyN8n_",
  "savePending_",
  "deliverPayload_",
  "retryPending_",
];
const declarations = functionNames.map((name) => {
  const declaration = source.match(new RegExp(`function ${name}\\([\\s\\S]*?\\n\\}`))?.[0];
  if (!declaration) {
    throw new Error(`Could not locate ${name} in FormBridge.gs`);
  }
  return declaration;
});

function makeHarness(options: {
  properties?: Record<string, string>;
  fetch?: ReturnType<typeof vi.fn>;
} = {}) {
  const values = new Map(Object.entries(options.properties ?? {}));
  const setProperty = vi.fn((key: string, value: string) => values.set(key, value));
  const deleteProperty = vi.fn((key: string) => values.delete(key));
  const fetch = options.fetch ?? vi.fn();
  const context = {
    PropertiesService: {
      getScriptProperties: () => ({
        getProperties: () => Object.fromEntries(values),
        setProperty,
        deleteProperty,
      }),
    },
    UrlFetchApp: { fetch },
    Logger: { log: vi.fn() },
    console: { error: vi.fn() },
    prop_: (key: string) => values.get(key) ?? "",
  };
  const exposed = functionNames.join(", ");
  const functions = runInNewContext(`${declarations.join("\n")}\n({ ${exposed} })`, context) as Record<string, (...args: unknown[]) => unknown>;
  return { functions, values, fetch, setProperty, deleteProperty, context };
}

function httpResponse(status: number, body = "") {
  return { getResponseCode: () => status, getContentText: () => body };
}

const payload = { responseId: "response-1", date: "2026-10-03", doneRaw: [], remarksRaw: "" };

describe("FormBridge direct app intake", () => {
  it("posts the payload to the app with the x-cron-secret header", () => {
    const fetch = vi.fn().mockReturnValue(httpResponse(200, '{"ok":true}'));
    const { functions } = makeHarness({
      properties: { APP_BASE_URL: "https://checklist.example/", APP_SECRET: "test-secret" },
      fetch,
    });

    const result = functions.postToApp_(payload) as { kind: string; status: number };

    expect(result).toMatchObject({ kind: "success", status: 200 });
    expect(fetch).toHaveBeenCalledWith("https://checklist.example/api/integrations/form/submit", expect.objectContaining({
      method: "post",
      headers: { "x-cron-secret": "test-secret" },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true,
    }));
  });

  it.each([
    [400, "dead_letter"],
    [404, "dead_letter"],
    [401, "configuration_error"],
    [429, "retry"],
    [503, "retry"],
  ])("classifies HTTP %i as %s", (status, kind) => {
    const { functions } = makeHarness();
    expect(functions.classifyAppStatus_(status)).toBe(kind);
  });

  it("uses exponential backoff capped at 75 minutes", () => {
    const { functions } = makeHarness();
    expect(functions.retryDelayMs_(1)).toBe(15 * 60 * 1000);
    expect(functions.retryDelayMs_(2)).toBe(30 * 60 * 1000);
    expect(functions.retryDelayMs_(3)).toBe(60 * 60 * 1000);
    expect(functions.retryDelayMs_(4)).toBe(75 * 60 * 1000);
    expect(functions.retryDelayMs_(20)).toBe(75 * 60 * 1000);
  });

  it("does not let a failed optional n8n notification undo accepted app intake", () => {
    const fetch = vi.fn()
      .mockReturnValueOnce(httpResponse(200, '{"ok":true}'))
      .mockReturnValueOnce(httpResponse(503, "n8n unavailable"));
    const { functions, values } = makeHarness({
      properties: {
        APP_BASE_URL: "https://checklist.example",
        APP_SECRET: "test-secret",
        N8N_WEBHOOK_URL: "https://n8n.example/webhook/form",
        N8N_WEBHOOK_SECRET: "optional-secret",
      },
      fetch,
    });

    functions.deliverPayload_(payload);

    expect(fetch).toHaveBeenCalledTimes(2);
    expect(values.has("PENDING_response-1")).toBe(false);
    expect(values.has("DEAD_LETTER_response-1")).toBe(false);
  });

  it("normalizes and replays a legacy employee-suffixed pending date once", () => {
    const legacyPayload = { ...payload, responseId: "response-legacy", date: "2026-10-03_Yogesh_Tomar" };
    const fetch = vi.fn().mockReturnValue(httpResponse(200, '{"ok":true}'));
    const { functions, values, context } = makeHarness({
      properties: {
        APP_BASE_URL: "https://checklist.example",
        APP_SECRET: "test-secret",
        "PENDING_response-legacy": JSON.stringify(legacyPayload),
      },
      fetch,
    });

    functions.retryPending_();
    functions.retryPending_();

    expect(fetch).toHaveBeenCalledOnce();
    const requestPayload = JSON.parse(String(fetch.mock.calls[0][1].payload));
    expect(requestPayload.date).toBe("2026-10-03");
    expect(values.has("PENDING_response-legacy")).toBe(false);
    expect(context.Logger.log).toHaveBeenCalledWith(expect.stringContaining("date-normalized/replayed=1"));
  });

  it("queues retryable failures and blocks 401 without consuming attempts", () => {
    const retryHarness = makeHarness({
      properties: { APP_BASE_URL: "https://checklist.example", APP_SECRET: "test-secret" },
      fetch: vi.fn().mockReturnValue(httpResponse(503, "temporarily unavailable")),
    });
    retryHarness.functions.deliverPayload_(payload);
    const queued = JSON.parse(String(retryHarness.values.get("PENDING_response-1")));
    expect(queued).toMatchObject({ attempts: 1, blocked: false, payload });
    expect(Date.parse(queued.nextAttemptAt)).toBeGreaterThan(Date.now());

    const blockedHarness = makeHarness({
      properties: { APP_BASE_URL: "https://checklist.example", APP_SECRET: "test-secret" },
      fetch: vi.fn().mockReturnValue(httpResponse(401, "unauthorized")),
    });
    blockedHarness.functions.deliverPayload_(payload);
    const blocked = JSON.parse(String(blockedHarness.values.get("PENDING_response-1")));
    expect(blocked).toMatchObject({ attempts: 0, blocked: true, payload });
  });

  it("dead-letters a non-retryable response with its response body", () => {
    const { functions, values } = makeHarness({
      properties: { APP_BASE_URL: "https://checklist.example", APP_SECRET: "test-secret" },
      fetch: vi.fn().mockReturnValue(httpResponse(400, '{"error":"INVALID_DATE"}')),
    });

    functions.deliverPayload_(payload);

    const deadLetter = JSON.parse(String(values.get("DEAD_LETTER_response-1")));
    expect(deadLetter).toMatchObject({
      reason: "app_http_400",
      responseBody: '{"error":"INVALID_DATE"}',
      payload,
    });
    expect(values.has("PENDING_response-1")).toBe(false);
  });
});
