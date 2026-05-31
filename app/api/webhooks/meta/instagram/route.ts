/**
 * /api/webhooks/meta/instagram
 *
 * GET  — Meta webhook verification (returns hub.challenge)
 * POST — Incoming Instagram DM events
 *
 * Security: POST requests are verified via X-Hub-Signature-256 HMAC.
 * Responds 200 immediately (Meta requires < 20s).
 */

import { NextRequest, NextResponse } from "next/server";
import { createHmac }                from "crypto";
import { createServiceClient }       from "@/lib/supabase/server";
import { inngest }                   from "@/lib/inngest/client";
import { getIgUserProfile }          from "@/lib/integrations/meta-instagram";
import { decryptSecret }             from "@/lib/crypto";

// ── GET — Webhook verification ───────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const mode      = req.nextUrl.searchParams.get("hub.mode");
  const token     = req.nextUrl.searchParams.get("hub.verify_token");
  const challenge = req.nextUrl.searchParams.get("hub.challenge");

  if (mode === "subscribe" && token === process.env.META_WEBHOOK_VERIFY_TOKEN) {
    console.log("[meta-webhook] verification accepted");
    return new Response(challenge, { status: 200 });
  }
  return new Response("Forbidden", { status: 403 });
}

// ── POST — Incoming events ────────────────────────────────────────────────────

interface MetaMessage {
  mid:  string;
  text: string;
}
interface MetaMessaging {
  sender:    { id: string };
  recipient: { id: string };
  timestamp: number;
  message?:  MetaMessage;
}
interface MetaEntry {
  id:        string; // page_id
  messaging: MetaMessaging[];
}
interface MetaWebhookBody {
  object: string;
  entry:  MetaEntry[];
}

export async function POST(req: NextRequest) {
  // ── Signature verification ────────────────────────────────────────────────
  const appSecret = process.env.META_APP_SECRET;
  if (!appSecret) {
    console.error("[meta-webhook] META_APP_SECRET not set");
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }

  const rawBody = await req.text();
  const sig     = req.headers.get("x-hub-signature-256") ?? "";
  const expected = "sha256=" + createHmac("sha256", appSecret).update(rawBody).digest("hex");

  if (sig !== expected) {
    console.warn("[meta-webhook] signature mismatch");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: MetaWebhookBody;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Respond 200 immediately — process async below
  const svc = createServiceClient();
  const now = new Date().toISOString();

  for (const entry of body.entry ?? []) {
    const pageId = entry.id;

    for (const msg of entry.messaging ?? []) {
      if (!msg.message?.text) continue;

      const senderId   = msg.sender.id;
      const messageText = msg.message.text;

      // Look up org by page_id stored in integration config
      const { data: intRows } = await svc
        .from("integrations")
        .select("org_id, config")
        .eq("provider", "meta_instagram")
        .eq("active", true);

      const integration = (intRows ?? []).find((r) => {
        const cfg = r.config as Record<string, string>;
        return cfg.page_id === pageId;
      });

      if (!integration) {
        console.warn(`[meta-webhook] no org for page_id=${pageId}`);
        continue;
      }

      const orgId = integration.org_id as string;
      const cfg   = integration.config as { access_token_enc: string };

      // Log webhook event for debug panel (webhook_events added in migration 015)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (svc as any).from("webhook_events").insert({
        org_id:     orgId,
        provider:   "meta_instagram",
        event_type: "message",
        sender_id:  senderId,
        payload:    { mid: msg.message.mid, text: messageText.slice(0, 200), timestamp: msg.timestamp },
        verified:   true,
      }).catch(() => { /* non-fatal */ });

      // ── Find or create lead ─────────────────────────────────────────────
      const externalId = "ig_" + senderId;

      const { data: existingLead } = await svc
        .from("leads")
        .select("id, name")
        .eq("org_id", orgId)
        .eq("channel", "meta_instagram")
        .eq("external_id", externalId)
        .maybeSingle();

      let leadId: string;

      if (existingLead) {
        leadId = (existingLead as { id: string }).id;
        await svc.from("leads")
          .update({ last_seen_at: now, updated_at: now })
          .eq("id", leadId);
      } else {
        // Fetch IG profile for a friendlier name
        let igName = senderId;
        try {
          const pageToken = decryptSecret(cfg.access_token_enc);
          const profile   = await getIgUserProfile(senderId, pageToken);
          igName = profile.name || profile.username || senderId;
        } catch { /* non-fatal */ }

        const { data: newLead, error: le } = await svc.from("leads").insert({
          org_id:       orgId,
          channel:      "meta_instagram",
          external_id:  externalId,
          name:         igName,
          stage:        "cold",
          score:        0,
          source:       "instagram",
          last_seen_at: now,
          updated_at:   now,
        }).select("id").single();

        if (le || !newLead) {
          console.error("[meta-webhook] lead insert failed:", le?.message);
          continue;
        }
        leadId = (newLead as { id: string }).id;
      }

      // ── Find or create conversation ─────────────────────────────────────
      const { data: existingConv } = await svc
        .from("conversations")
        .select("id")
        .eq("org_id", orgId)
        .eq("lead_id", leadId)
        .eq("channel_provider", "meta_instagram")
        .maybeSingle();

      let conversationId: string;

      if (existingConv) {
        conversationId = (existingConv as { id: string }).id;
      } else {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: newConv, error: ce } = await (svc as any).from("conversations").insert({
          org_id:               orgId,
          lead_id:              leadId,
          channel_provider:     "meta_instagram",
          last_message_at:      now,
          last_message_preview: messageText.slice(0, 80),
          auto_reply_enabled:   true,
        }).select("id").single();

        if (ce || !newConv) {
          console.error("[meta-webhook] conversation insert failed:", ce?.message);
          continue;
        }
        conversationId = (newConv as { id: string }).id;
      }

      // ── Insert inbound message ──────────────────────────────────────────
      const { data: insertedMsg, error: me } = await svc.from("messages").insert({
        conversation_id: conversationId,
        org_id:          orgId,
        direction:       "inbound",
        content:         messageText,
        sent_at:         new Date(msg.timestamp).toISOString(),
        metadata:        { source: "instagram", sender_id: senderId, mid: msg.message.mid },
      }).select("id").single();

      if (me || !insertedMsg) {
        console.error("[meta-webhook] message insert failed:", me?.message);
        continue;
      }
      const messageId = (insertedMsg as { id: string }).id;

      // ── Update conversation preview ─────────────────────────────────────
      await svc.from("conversations").update({
        last_message_at:      now,
        last_message_preview: messageText.slice(0, 80),
      }).eq("id", conversationId);

      // ── Fire Inngest event ──────────────────────────────────────────────
      await inngest.send({
        name: "dm.received",
        data: { orgId, leadId, conversationId, messageId },
      });

      console.log(`[meta-webhook] ✓ message lead=${leadId} conv=${conversationId}`);
    }
  }

  return NextResponse.json({ ok: true });
}
