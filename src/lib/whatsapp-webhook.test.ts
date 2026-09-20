import { describe, expect, it } from "vitest";
import { createHmac } from "node:crypto";

import { extractMessageFromWhatsAppPayload, verifyWebhookSignature } from "@/lib/whatsapp-webhook";

describe("verifyWebhookSignature", () => {
  it("accepts the correct SHA256 signature", () => {
    const secret = "test-secret";
    const payload = JSON.stringify({ hello: "world" });
    const signature = `sha256=${createHmac("sha256", secret).update(payload).digest("hex")}`;

    expect(verifyWebhookSignature(payload, signature, secret)).toBe(true);
  });

  it("rejects a missing or incorrect signature", () => {
    expect(verifyWebhookSignature("{}", "sha256=wrong", "secret")).toBe(false);
    expect(verifyWebhookSignature("{}", "", "secret")).toBe(false);
  });
});

describe("extractMessageFromWhatsAppPayload", () => {
  it("reads the sender and text body from Meta payloads", () => {
    const payload = {
      entry: [
        {
          changes: [
            {
              value: {
                messages: [
                  {
                    id: "wamid.test-1",
                    from: "919876543210",
                    text: { body: "I have updated this task" },
                  },
                ],
              },
            },
          ],
        },
      ],
    };

    expect(extractMessageFromWhatsAppPayload(payload as Record<string, unknown>)).toEqual({
      id: "wamid.test-1",
      from: "919876543210",
      text: "I have updated this task",
    });
  });
});
