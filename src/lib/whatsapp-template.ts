import { toWhatsAppNumber } from "@/lib/business-logic";

export class WhatsAppTemplateError extends Error {
  constructor(message: string, readonly permanent: boolean) {
    super(message);
    this.name = "WhatsAppTemplateError";
  }
}

export async function sendWhatsAppTemplate(input: {
  phone: string;
  templateName: string;
  language: string;
  parameters: string[];
  fetcher?: typeof fetch;
  timeoutMs?: number;
}): Promise<string> {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID?.trim();
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN?.trim();
  const recipient = toWhatsAppNumber(input.phone);
  if (!phoneNumberId || !accessToken) {
    throw new WhatsAppTemplateError("WhatsApp Cloud API configuration is missing", true);
  }
  if (!recipient) {
    throw new WhatsAppTemplateError("Recipient phone number is invalid", true);
  }

  let response: Response;
  try {
    response = await (input.fetcher ?? fetch)(
      `https://graph.facebook.com/v21.0/${encodeURIComponent(phoneNumberId)}/messages`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${accessToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: recipient,
          type: "template",
          template: {
            name: input.templateName,
            language: { code: input.language },
            components: [{
              type: "body",
              parameters: input.parameters.map((text) => ({ type: "text", text })),
            }],
          },
        }),
        signal: AbortSignal.timeout(input.timeoutMs ?? 8_000),
      },
    );
  } catch {
    throw new WhatsAppTemplateError("WhatsApp Cloud API request failed", false);
  }

  const body = await response.json().catch(() => ({})) as {
    messages?: Array<{ id?: string }>;
    error?: { message?: string };
  };
  if (!response.ok) {
    const permanent = response.status < 500 && response.status !== 408 && response.status !== 429;
    throw new WhatsAppTemplateError(
      body.error?.message ?? `WhatsApp Cloud API returned HTTP ${response.status}`,
      permanent,
    );
  }

  const providerMessageId = body.messages?.[0]?.id;
  if (!providerMessageId) {
    throw new WhatsAppTemplateError("WhatsApp API response omitted provider message ID", true);
  }
  return providerMessageId;
}
