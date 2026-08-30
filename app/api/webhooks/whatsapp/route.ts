/**
 * /api/webhooks/whatsapp
 *
 * GET  — Meta webhook verification (returns hub.challenge)
 * POST — Incoming WhatsApp Cloud API message events
 *
 * Security: POST requests are verified via X-Hub-Signature-256 HMAC.
 */

import { NextRequest, NextResponse } from "next/server";
import { createHmac }                from "crypto";
import { createServiceClient }       from "@/lib/supabase/server";
import { inngest }                   from "@/lib/inngest/client";

// ── GET — Webhook verification ───────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const mode      = req.nextUrl.searchParams.get("hub.mode");
  const token     = req.nextUrl.searchParams.get("hub.verify_token");
  const challenge = req.nextUrl.searchParams.get("hub.challenge");

  if (mode === "subscribe" && token === process.env.META_WEBHOOK_VERIFY_TOKEN) {
    console.log("[wa-webhook] verification accepted");
    return new Response(challenge, { status: 200 });
  }
  return new Response("Forbidden", { status: 403 });
}

// ── POST — Incoming messages ──────────────────────────────────────────────────

interface WAMessage {
  id:        string;
  from:      string;
  timestamp: string;
  type:      string;
  text?:     { body: string };
}

interface WAMetadata {
  display_phone_number: string;
  phone_number_id:      string;
}

interface WAContact {
  profile: { name: string };
  wa_id:   string;
}

interface WAValue {
  messaging_product: string;
  metadata:          WAMetadata;
  contacts?:         WAContact[];
  messages?:         WAMessage[];
}

interface WAChange {
  value:  WAValue;
  field:  string;
}

interface WAEntry {
  id:      string;
  changes: WAChange[];
}

interface WAWebhookBody {
  object: string;
  entry:  WAEntry[];
}

export async function POST(req: NextRequest) {
  // ── Instrumentation ───────────────────────────────────────────────────────
  // tReceived is Effora's server clock at the moment the webhook entered the
  // function. messages.sent_at for inbound rows is META's timestamp, not ours,
  // so this is the only way to separate Meta's delivery leg from our own work.
  // No PII is logged: org / conversation / message ids only, never phone
  // numbers, message content, signatures or secrets.
  const tReceived = Date.now();

  const appSecret = process.env.META_APP_SECRET;
  if (!appSecret) {
    console.error("[wa-webhook] META_APP_SECRET not set");
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }

  const rawBody = await req.text();
  const sig     = req.headers.get("x-hub-signature-256") ?? "";
  const expected = "sha256=" + createHmac("sha256", appSecret).update(rawBody).digest("hex");

  if (sig !== expected) {
    console.warn("[wa-webhook] signature mismatch");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: WAWebhookBody;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (body.object !== "whatsapp_business_account") {
    return NextResponse.json({ ok: true });
  }

  const svc = createServiceClient();
  const now = new Date().toISOString();

  for (const entry of body.entry ?? []) {
    for (const change of entry.changes ?? []) {
      if (change.field !== "messages") continue;
      const value = change.value;
      const phoneNumberId = value.metadata?.phone_number_id;

      // Look up org by phone_number_id stored in integration config
      const { data: intRows } = await svc
        .from("integrations")
        .select("org_id, config")
        .eq("provider", "whatsapp_cloud")
        .eq("active", true);

      const integration = (intRows ?? []).find((r) => {
        const cfg = r.config as Record<string, string>;
        return cfg.phone_number_id === phoneNumberId;
      });

      if (!integration) {
        console.warn(`[wa-webhook] no org for phone_number_id=${phoneNumberId}`);
        continue;
      }

      const orgId = integration.org_id as string;

      for (const msg of value.messages ?? []) {
        if (msg.type !== "text" || !msg.text?.body) continue;

        const tMsgStart = Date.now();

        const senderPhone = msg.from;
        const messageText = msg.text.body;
        const externalId  = "wa_" + senderPhone;

        // Resolve sender display name from contacts array
        const contactName = value.contacts?.find((c) => c.wa_id === senderPhone)?.profile?.name ?? senderPhone;

        // ── 1. Find or create lead (upsert pattern) ──────────────────────────
        const { data: existingLead } = await svc
          .from("leads")
          .select("id")
          .eq("org_id", orgId)
          .eq("channel", "whatsapp_cloud")
          .eq("external_id", externalId)
          .maybeSingle();

        let leadId: string;

        if (existingLead) {
          leadId = (existingLead as { id: string }).id;
          // fire-and-forget update — don't block the response
          svc.from("leads").update({ last_seen_at: now, updated_at: now }).eq("id", leadId).then(() => {});
        } else {
          const { data: newLead, error: le } = await svc.from("leads").insert({
            org_id:       orgId,
            channel:      "whatsapp_cloud",
            external_id:  externalId,
            name:         contactName,
            stage:        "cold",
            score:        0,
            source:       "whatsapp",
            last_seen_at: now,
            updated_at:   now,
          }).select("id").single();

          if (le || !newLead) {
            console.error("[wa-webhook] lead insert failed:", le?.message);
            continue;
          }
          leadId = (newLead as { id: string }).id;
        }

        // ── 2. Find or create conversation + insert message in parallel ───────
        const { data: existingConv } = await svc
          .from("conversations")
          .select("id")
          .eq("org_id", orgId)
          .eq("lead_id", leadId)
          .eq("channel_provider", "whatsapp_cloud")
          .maybeSingle();

        let conversationId: string;

        if (existingConv) {
          conversationId = (existingConv as { id: string }).id;
        } else {
          const { data: newConv, error: ce } = await svc.from("conversations").insert({
            org_id:               orgId,
            lead_id:              leadId,
            channel_provider:     "whatsapp_cloud",
            last_message_at:      now,
            last_message_preview: messageText.slice(0, 80),
            auto_reply_enabled:   true,
          }).select("id").single();

          if (ce || !newConv) {
            console.error("[wa-webhook] conversation insert failed:", ce?.message);
            continue;
          }
          conversationId = (newConv as { id: string }).id;
        }

        // ── 3. Insert message + update preview in parallel ────────────────────
        // Meta's own timestamp for this message (second precision).
        const metaSentMs = parseInt(msg.timestamp) * 1000;

        const [msgRes] = await Promise.all([
          svc.from("messages").insert({
            conversation_id: conversationId,
            org_id:          orgId,
            direction:       "inbound",
            content:         messageText,
            sent_at:         new Date(metaSentMs).toISOString(),
            metadata:        {
              source: "whatsapp", sender_phone: senderPhone, wamid: msg.id,
              // Instrumentation. `recv` is Effora's receipt time; `meta_lag_ms`
              // is Meta's delivery leg (recv - Meta timestamp); `pre_ms` is the
              // DB work this webhook did before inserting the row.
              t: {
                recv:        new Date(tReceived).toISOString(),
                meta_lag_ms: tReceived - metaSentMs,
                pre_ms:      Date.now() - tMsgStart,
              },
            },
          }).select("id").single(),
          svc.from("conversations").update({
            last_message_at:      now,
            last_message_preview: messageText.slice(0, 80),
          }).eq("id", conversationId),
        ]);

        const { data: insertedMsg, error: me } = msgRes as { data: { id: string } | null; error: { message: string } | null };
        if (me || !insertedMsg) {
          console.error("[wa-webhook] message insert failed:", me?.message);
          continue;
        }
        const messageId = insertedMsg.id;

        // ── 4. Fire Inngest event (fire-and-forget — Meta retries on 200 loss) ─
        inngest.send({
          name: "whatsapp.message_received",
          data: { orgId, leadId, conversationId, messageId, senderPhone },
        }).catch((err: unknown) => console.error("[wa-webhook] inngest.send failed:", err));

        console.log(`[wa-webhook] ✓ message lead=${leadId} conv=${conversationId}`);
        console.log(
          `[wa-timing] stage=inbound org=${orgId} conv=${conversationId} msg=${messageId} ` +
          `meta_lag_ms=${tReceived - metaSentMs} db_ms=${Date.now() - tMsgStart} ack_ms=${Date.now() - tReceived}`,
        );
      }
    }
  }

  console.log(`[wa-timing] stage=inbound_ack total_ms=${Date.now() - tReceived}`);
  return NextResponse.json({ ok: true });
}
