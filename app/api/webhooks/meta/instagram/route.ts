/**
 * /api/webhooks/meta/instagram
 *
 * GET  — Meta webhook verification (returns hub.challenge)
 * POST — Incoming Instagram DM events
 *
 * Security: POST requests are verified via X-Hub-Signature-256 HMAC.
 * Meta retries failed webhooks aggressively, so we always return 200
 * even on internal processing errors.
 */

import { NextRequest, NextResponse } from "next/server";
import { createHmac }               from "crypto";
import { createServiceClient }      from "@/lib/supabase/server";
import { inngest }                  from "@/lib/inngest/client";
import { getIgUserProfile }         from "@/lib/integrations/meta-instagram";
import { decryptSecret }            from "@/lib/crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ── GET — Webhook verification ───────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const url       = new URL(req.url);
  const mode      = url.searchParams.get("hub.mode");
  const token     = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");

  // Accept verify token from env OR platform_settings (loaded lazily)
  const expectedToken = process.env.META_WEBHOOK_VERIFY_TOKEN;

  if (mode === "subscribe" && token === expectedToken && expectedToken) {
    console.log("[ig-webhook] verification accepted");
    return new Response(challenge ?? "", {
      status: 200,
      headers: { "Content-Type": "text/plain" },
    });
  }
  return new Response("Forbidden", { status: 403 });
}

// ── POST — Incoming Instagram DM events ──────────────────────────────────────

interface IgMessage {
  mid:       string;
  text?:     string;
  is_echo?:  boolean;
  attachments?: unknown[];
}

interface IgMessaging {
  sender:    { id: string };
  recipient: { id: string };
  timestamp: number;
  message?:  IgMessage;
}

interface IgEntry {
  id:        string; // Facebook Page ID
  time:      number;
  messaging: IgMessaging[];
}

interface IgWebhookBody {
  object: string;
  entry:  IgEntry[];
}

export async function POST(req: NextRequest) {
  // ── 1. Resolve app secret for signature verification ──────────────────────
  // Use env var first; fall back to platform_settings row.
  // We must verify before parsing, so we can't do per-org lookup here.
  let appSecret = process.env.META_APP_SECRET;

  if (!appSecret) {
    // Try platform_settings table
    try {
      const svc = createServiceClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: ps } = await (svc as any)
        .from("platform_settings")
        .select("meta_app_secret_encrypted")
        .eq("id", 1)
        .maybeSingle();
      if (ps?.meta_app_secret_encrypted) {
        const { isEncrypted, decryptSecret: dec } = await import("@/lib/crypto");
        appSecret = isEncrypted(ps.meta_app_secret_encrypted as string)
          ? dec(ps.meta_app_secret_encrypted as string)
          : (ps.meta_app_secret_encrypted as string);
      }
    } catch (e) {
      console.error("[ig-webhook] failed to load platform app secret:", e);
    }
  }

  if (!appSecret) {
    console.error("[ig-webhook] META_APP_SECRET not configured — cannot verify signature");
    return NextResponse.json({ ok: true }); // return 200 so Meta doesn't retry
  }

  // ── 2. Signature verification ─────────────────────────────────────────────
  const rawBody = await req.text();
  const sig     = req.headers.get("x-hub-signature-256") ?? "";
  const expected = "sha256=" + createHmac("sha256", appSecret).update(rawBody).digest("hex");

  if (sig !== expected) {
    console.warn("[ig-webhook] signature mismatch — ignoring");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  console.log("[ig-webhook] ✓ signature verified");

  // ── 3. Parse payload ──────────────────────────────────────────────────────
  let body: IgWebhookBody;
  try {
    body = JSON.parse(rawBody);
  } catch {
    console.warn("[ig-webhook] invalid JSON body");
    return NextResponse.json({ ok: true });
  }

  if (body.object !== "instagram") {
    // Not an IG event — could be a Page event on the same app
    return NextResponse.json({ ok: true });
  }

  const svc = createServiceClient();
  const now = new Date().toISOString();

  // ── 4. Process each entry ─────────────────────────────────────────────────
  for (const entry of body.entry ?? []) {
    const pageId = entry.id;

    // Look up org by page_id stored in meta_instagram integration config
    let integration: { org_id: string; config: Record<string, string> } | null = null;
    try {
      const { data: intRows } = await svc
        .from("integrations")
        .select("org_id, config")
        .eq("provider", "meta_instagram")
        .eq("active", true);

      integration = ((intRows ?? []) as { org_id: string; config: Record<string, string> }[])
        .find((r) => r.config?.page_id === pageId) ?? null;
    } catch (e) {
      console.error("[ig-webhook] DB error looking up integration:", e);
      continue;
    }

    if (!integration) {
      console.warn(`[ig-webhook] no active meta_instagram integration for page_id=${pageId}`);
      continue;
    }

    console.log(`[ig-webhook] ✓ integration found org=${integration.org_id} page=${pageId}`);

    const orgId    = integration.org_id;
    const cfg      = integration.config;
    const igBizId  = cfg.instagram_business_account_id;

    // Decrypt page token for profile lookups
    let pageToken: string | null = null;
    try {
      pageToken = cfg.access_token_enc ? decryptSecret(cfg.access_token_enc) : null;
    } catch (e) {
      console.warn("[ig-webhook] token decrypt failed (non-fatal):", e);
    }

    for (const messaging of entry.messaging ?? []) {
      const msg = messaging.message;
      if (!msg) continue;

      // Skip echo messages (messages sent by the page itself)
      if (msg.is_echo) continue;

      // Skip messages without text (images, stickers, etc. — not yet supported)
      const messageText = msg.text ?? null;
      if (!messageText) {
        console.log(`[ig-webhook] skipping non-text message mid=${msg.mid}`);
        continue;
      }

      const senderIgsid = messaging.sender.id;

      // Ignore if the sender is the IG business account itself
      if (senderIgsid === igBizId) continue;

      const externalId = "ig_" + senderIgsid;

      // ── 5. Resolve sender display name (best-effort) ────────────────────
      let displayName = senderIgsid;
      if (pageToken) {
        try {
          const profile = await getIgUserProfile(senderIgsid, pageToken);
          displayName = profile.name || profile.username || senderIgsid;
        } catch (e) {
          console.warn("[ig-webhook] profile lookup failed (non-fatal):", e);
        }
      }

      // ── 6. Upsert lead ──────────────────────────────────────────────────
      let leadId: string;
      try {
        const { data: existingLead } = await svc
          .from("leads")
          .select("id")
          .eq("org_id", orgId)
          .eq("channel", "instagram")
          .eq("external_id", externalId)
          .maybeSingle();

        if (existingLead) {
          leadId = (existingLead as { id: string }).id;
          await svc.from("leads")
            .update({ last_seen_at: now, updated_at: now })
            .eq("id", leadId);
        } else {
          const { data: newLead, error: le } = await svc.from("leads").insert({
            org_id:       orgId,
            channel:      "instagram",
            external_id:  externalId,
            name:         displayName,
            stage:        "cold",
            score:        0,
            source:       "instagram",
            last_seen_at: now,
            updated_at:   now,
          }).select("id").single();

          if (le || !newLead) {
            console.error("[ig-webhook] lead insert failed:", le?.message);
            continue;
          }
          leadId = (newLead as { id: string }).id;
        }
      } catch (e) {
        console.error("[ig-webhook] lead upsert error:", e);
        continue;
      }

      console.log(`[ig-webhook] ✓ lead upserted lead=${leadId}`);

      // ── 7. Upsert conversation ──────────────────────────────────────────
      let conversationId: string;
      try {
        const { data: existingConv } = await svc
          .from("conversations")
          .select("id")
          .eq("org_id", orgId)
          .eq("lead_id", leadId)
          .eq("channel_provider", "instagram")
          .maybeSingle();

        if (existingConv) {
          conversationId = (existingConv as { id: string }).id;
        } else {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { data: newConv, error: ce } = await (svc as any).from("conversations").insert({
            org_id:               orgId,
            lead_id:              leadId,
            channel_provider:     "instagram",
            last_message_at:      now,
            last_message_preview: messageText.slice(0, 80),
            auto_reply_enabled:   true,
          }).select("id").single();

          if (ce || !newConv) {
            console.error("[ig-webhook] conversation insert failed:", ce?.message);
            continue;
          }
          conversationId = (newConv as { id: string }).id;
        }
      } catch (e) {
        console.error("[ig-webhook] conversation upsert error:", e);
        continue;
      }

      console.log(`[ig-webhook] ✓ conversation upserted conv=${conversationId}`);

      // ── 8. Insert inbound message ────────────────────────────────────────
      let messageId: string;
      try {
        const { data: insertedMsg, error: me } = await svc.from("messages").insert({
          conversation_id: conversationId,
          org_id:          orgId,
          direction:       "inbound",
          content:         messageText,
          sent_at:         new Date(messaging.timestamp).toISOString(),
          metadata:        { source: "instagram", sender_igsid: senderIgsid, ig_mid: msg.mid },
        }).select("id").single();

        if (me || !insertedMsg) {
          console.error("[ig-webhook] message insert failed:", me?.message);
          continue;
        }
        messageId = (insertedMsg as { id: string }).id;
      } catch (e) {
        console.error("[ig-webhook] message insert error:", e);
        continue;
      }

      console.log(`[ig-webhook] ✓ message inserted msg=${messageId}`);

      // ── 9. Update conversation preview ───────────────────────────────────
      await svc.from("conversations").update({
        last_message_at:      now,
        last_message_preview: messageText.slice(0, 80),
      }).eq("id", conversationId);

      // ── 10. Fire Inngest event for AI processing ─────────────────────────
      try {
        await inngest.send({
          name: "dm.received",
          data: { orgId, leadId, conversationId, messageId },
        });
        console.log(`[ig-webhook] ✓ Inngest dm.received fired lead=${leadId} conv=${conversationId}`);
      } catch (e) {
        console.error("[ig-webhook] Inngest send failed (non-fatal):", e);
      }
    }
  }

  return NextResponse.json({ ok: true });
}
