import { createHmac, timingSafeEqual } from "node:crypto";

export function verifyWebhookSignature(rawBody: string, signatureHeader: string | null | undefined, appSecret: string): boolean {
  if (!appSecret || !signatureHeader) {
    return false;
  }

  const expected = `sha256=${createHmac("sha256", appSecret).update(rawBody).digest("hex")}`;
  const expectedBuffer = Buffer.from(expected, "utf8");
  const actualBuffer = Buffer.from(signatureHeader, "utf8");

  if (expectedBuffer.length !== actualBuffer.length) {
    return false;
  }

  return timingSafeEqual(expectedBuffer, actualBuffer);
}

export function extractMessageFromWhatsAppPayload(payload: unknown): { id: string; from: string; text: string } | null {
  const entry = Array.isArray((payload as { entry?: unknown[] })?.entry)
    ? (payload as { entry: unknown[] }).entry
    : [];

  for (const item of entry) {
    const changes = Array.isArray((item as { changes?: unknown[] })?.changes)
      ? (item as { changes: unknown[] }).changes
      : [];

    for (const change of changes) {
      const value = (change as { value?: { messages?: unknown[] } })?.value;
      const messages = Array.isArray(value?.messages) ? value.messages : [];

      for (const message of messages) {
        const typed = message as {
          id?: string;
          from?: string;
          text?: { body?: string } | string;
        };

        if (!typed.id || !typed.from) {
          continue;
        }

        const textBody =
          typeof typed.text === "string"
            ? typed.text
            : typeof typed.text?.body === "string"
              ? typed.text.body
              : "";

        if (!textBody.trim()) {
          continue;
        }

        return {
          id: typed.id,
          from: typed.from,
          text: textBody.trim(),
        };
      }
    }
  }

  return null;
}
