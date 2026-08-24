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
        // GAP FIX: previously any non-text message (photo, voice note, document,
        // location, sticker) was dropped here, so a parent whose FIRST contact
        // was a photo of a marksheet created no lead at all — the enquiry was
        // lost silently. Now every message type captures the lead and shows up
        // in the inbox; only the AI pipeline is skipped, since it needs text.
        const isText = msg.type === "text" && !!msg.text?.body;

        const NON_TEXT_LABEL: Record<string, string> = {
          image:    "📷 Photo",
          video:    "🎬 Video",
          audio:    "🎤 Voice note",
          voice:    "🎤 Voice note",
          document: "📄 Document",
          location: "📍 Location",
          sticker:  "😀 Sticker",
          contacts: "👤 Contact card",
        };

        const senderPhone = msg.from;
        const messageText = isText
          ? msg.text!.body
          : (NON_TEXT_LABEL[msg.type] ?? `📎 ${msg.type}`);
        const externalId  = "wa_" + senderPhone;

        // Resolve sender display name from contacts array
        const contactName = value.contacts?.find((c) => c.wa_id === senderPhone)?.profile?.name ?? senderPhone;

        // ── 1. Find or create lead (upsert pattern) ──────────────────────────
        // Deleted leads are excluded deliberately. A deleted lead also has its
        // external_id scrubbed, so this lookup would miss it anyway — the
        // filter is belt-and-braces. Net effect: if a deleted number messages
        // again it becomes a brand-new lead with no stale references.
        const { data: existingLead } = await svc
          .from("leads")
          .select("id")
          .eq("org_id", orgId)
          .eq("channel", "whatsapp_cloud")
          .eq("external_id", externalId)
          .is("deleted_at", null)
          .maybeSingle();

        let leadId: string;
        // Whether this enquiry is from someone we've never spoken to before.
        // Forwarded to Inngest so the owner gets a "new enquiry" notification.
        const isNewLead = !existingLead;

        if (existingLead) {
          leadId = (existingLead as { id: string }).id;
          // fire-and-forget update — don't block the response
          svc.from("leads").update({ last_seen_at: now, updated_at: now }).eq("id", leadId).then(() => {});
        } else {
          // Cast: phone / first_contact_at / last_contact_at were added in
          // migrations 019 and 012 and are not in the generated types yet.
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { data: newLead, error: le } = await (svc as any).from("leads").insert({
            org_id:       orgId,
            channel:      "whatsapp_cloud",
            external_id:  externalId,
            name:         contactName,
            // GAP FIX: phone was never populated, so WhatsApp leads showed a
            // blank number in the CRM even though the column exists (added in
            // migration 019) and the CRM renders it.
            phone:        senderPhone,
            stage:        "cold",
            score:        0,
            source:       "whatsapp",
            first_contact_at: now,
            last_contact_at:  now,
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
        // Note: intentionally NOT filtered on deleted_at. A conversation the
        // owner removed from the inbox must be REOPENED when the same person
        // messages again, not duplicated — otherwise the new message would land
        // in a hidden thread and appear to vanish.
        const { data: existingConv } = await svc
          .from("conversations")
          .select("id, deleted_at")
          .eq("org_id", orgId)
          .eq("lead_id", leadId)
          .eq("channel_provider", "whatsapp_cloud")
          .maybeSingle();

        let conversationId: string;

        if (existingConv) {
          conversationId = (existingConv as { id: string }).id;
          // Reopen if it was archived. Clearing deleted_at is enough: the
          // inbox list filters on it, and the UPDATE below fires the realtime
          // event that puts the thread back at the top of the sidebar.
          if ((existingConv as { deleted_at?: string | null }).deleted_at) {
            await svc.from("conversations")
              .update({ deleted_at: null })
              .eq("id", conversationId);
            console.log(`[wa-webhook] reopened archived conversation conv=${conversationId}`);
          }
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
        const [msgRes] = await Promise.all([
          svc.from("messages").insert({
            conversation_id: conversationId,
            org_id:          orgId,
            direction:       "inbound",
            content:         messageText,
            sent_at:         new Date(parseInt(msg.timestamp) * 1000).toISOString(),
            metadata:        { source: "whatsapp", sender_phone: senderPhone, wamid: msg.id },
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
        // Text only: qualification and drafting both operate on message text.
        // Non-text messages still created the lead, conversation and message
        // above, so the enquiry is captured and visible — it just isn't
        // auto-qualified. The owner sees it in the inbox and replies manually.
        if (isText) {
          inngest.send({
            name: "whatsapp.message_received",
            data: { orgId, leadId, conversationId, messageId, senderPhone, isNewLead, leadName: contactName },
          }).catch((err: unknown) => console.error("[wa-webhook] inngest.send failed:", err));
        } else {
          console.log(`[wa-webhook] non-text message (${msg.type}) — lead captured, AI pipeline skipped`);
        }

        console.log(`[wa-webhook] ✓ message lead=${leadId} conv=${conversationId} type=${msg.type}`);
      }
    }
  }

  return NextResponse.json({ ok: true });
}
