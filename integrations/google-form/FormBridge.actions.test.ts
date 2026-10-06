import fs from "node:fs";
import path from "node:path";
import { runInNewContext } from "node:vm";

import { describe, expect, it, vi } from "vitest";

const source = fs.readFileSync(path.join(process.cwd(), "integrations/google-form/FormBridge.gs"), "utf8");

function loadFunction(name: string, context: Record<string, unknown>) {
  const declaration = source.match(new RegExp(`function ${name}\\([\\s\\S]*?\\n\\}`))?.[0];
  if (!declaration) throw new Error(`Could not locate ${name} in FormBridge.gs`);
  return runInNewContext(`${declaration}\n${name}`, context) as (...args: unknown[]) => unknown;
}

function scriptProperties(initial: Record<string, string>) {
  const values = new Map(Object.entries(initial));
  const setProperty = vi.fn((key: string, value: string) => values.set(key, value));
  const getProperty = (key: string) => values.get(key) ?? "";
  return {
    values,
    setProperty,
    getProperty,
    PropertiesService: { getScriptProperties: () => ({ setProperty, getProperty }) },
  };
}

describe("FormBridge form link safety", () => {
  it("returns a known employee form URL without opening or changing the form", () => {
    const formKey = "FORM_ID_2026-10-03_Yogesh_Tomar";
    const properties = scriptProperties({
      [formKey]: "google-form-id",
      [`FORM_URL_${formKey}`]: "https://forms.google.test/existing",
    });
    const openById = vi.fn();
    const linkForm = loadFunction("linkForm_", {
      PropertiesService: properties.PropertiesService,
      FormApp: { openById },
      prop_: properties.getProperty,
    });

    const result = linkForm({ date: "2026-10-03", employeeName: "Yogesh Tomar", choices: ["only open task"] }) as Record<string, unknown>;

    expect(result).toMatchObject({ ok: true, formId: "google-form-id", formUrl: "https://forms.google.test/existing" });
    expect(openById).not.toHaveBeenCalled();
    expect(properties.setProperty).not.toHaveBeenCalled();
  });

  it("does not rebuild a form with existing responses when its choice signature changes", () => {
    const formKey = "FORM_ID_2026-10-03_Yogesh_Tomar";
    const properties = scriptProperties({
      [formKey]: "google-form-id",
      [`FORM_URL_${formKey}`]: "https://forms.google.test/existing",
      [`FORM_SIGNATURE_${formKey}`]: "old-choice-signature",
    });
    const getItems = vi.fn(() => []);
    const deleteItem = vi.fn();
    const getResponses = vi.fn(() => [{ getId: () => "submitted-response" }]);
    const setAcceptingResponses = vi.fn();
    const form = {
      getResponses,
      getPublishedUrl: () => "https://forms.google.test/existing",
      getEditUrl: () => "https://forms.google.test/edit",
      getItems,
      deleteItem,
      setAcceptingResponses,
      getId: () => "google-form-id",
    };
    const logger = { log: vi.fn() };
    const refreshForm = loadFunction("refreshForm_", {
      PropertiesService: properties.PropertiesService,
      FormApp: { openById: vi.fn(() => form), create: vi.fn() },
      Utilities: { formatDate: () => "2026-10-03" },
      ScriptApp: { getProjectTriggers: () => [] },
      Logger: logger,
      prop_: properties.getProperty,
    });

    const result = refreshForm({
      date: "2026-10-03",
      employeeName: "Yogesh Tomar",
      choices: ["new open task"],
    }) as Record<string, unknown>;

    expect(result).toMatchObject({ ok: true, unchanged: true, preservedResponses: true, formUrl: "https://forms.google.test/existing" });
    expect(getResponses).toHaveBeenCalledOnce();
    expect(getItems).not.toHaveBeenCalled();
    expect(deleteItem).not.toHaveBeenCalled();
    expect(setAcceptingResponses).not.toHaveBeenCalled();
    expect(properties.setProperty).toHaveBeenCalledWith("FORM_DATE_google-form-id", "2026-10-03");
    expect(logger.log).toHaveBeenCalledOnce();
  });

  it("ignores stale form submission events that have no source or response object", () => {
    const logger = { log: vi.fn() };
    const onFormSubmit = loadFunction("onFormSubmit_", {
      Logger: logger,
      buildPayload_: vi.fn(),
      deliverPayload_: vi.fn(),
      deadLetterPayload_: vi.fn(),
    });

    onFormSubmit({});

    expect(logger.log).toHaveBeenCalledWith("[FormBridge] Ignoring stale or missing form submission event.");
  });
});
