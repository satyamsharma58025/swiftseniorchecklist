import { NextResponse } from "next/server";

import { rejectUnlessIntegrationSecret } from "@/lib/integration-auth";
import { processInboundWhatsAppPayload } from "@/lib/whatsapp-inbound";

export const dynamic = "force-dynamic";

/**
 * POST /api/integrations/whatsapp/inbound
 *
 * n8n owns the Meta WhatsApp webhook (path "whatsapp-incoming") because the same
 * WhatsApp number also drives the boss voice-note and report-menu flows, and Meta
 * allows only ONE webhook URL per app. n8n forwards employee text replies here as
 * the untouched Meta payload. Authenticated with x-cron-secret (Meta's HMAC
 * signature cannot be re-verified after n8n has parsed the body).
 */
export async function POST(request: Request) {
  const denied = rejectUnlessIntegrationSecret(request);
  if (denied) {
    return denied;
  }

  const payload = await request.json().catch(() => null);
  if (!payload || typeof payload !== "object") {
    return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 });
  }

  return NextResponse.json(await processInboundWhatsAppPayload(payload, { storeUnparsed: false }));
}
