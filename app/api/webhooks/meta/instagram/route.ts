/**
 * /api/webhooks/meta/instagram
 *
 * GET  — Meta webhook verification (returns hub.challenge)
 * POST — Incoming Instagram DM events
 *
 * Security: POST requests are verified via X-Hub-Signature-256 HMAC.
 * Meta retries failed webhooks aggressively, so we always return 200
 * even on internal processing errors.
 *
 * Payload shape (Instagram Messaging API, subscribed via /{ig-user-id}/subscribed_apps):
 *   { object: "instagram", entry: [{ id: IG_ACCOUNT_ID, messaging: [...] }] }
 *
 * NOTE: entry[].id is the INSTAGRAM BUSINESS ACCOUNT ID.
 * We look up the integration by config.instagram_business_account_id first,
 * with a fallback to config.page_id for any legacy subscriptions.
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

  const expectedToken = process.env.META_WEBHOOK_VERIFY_TOKEN;

  if (mode === "subscribe" && token === expectedToken && expectedToken) {
    console.log("[ig-webhook] ✓ verification accepted");
    return new Response(challenge ?? "", {
      status: 200,
      headers: { "Content-Type": "text/plain" },
    });
  }
  return new Response("Forbidden", { status: 403 });
}

// ── POST — Incoming Instagram DM events ──────────────────────────────────────

interface IgMessage {
  mid:          string;
  text?:        string;
  is_echo?:     boolean;
  attachments?: unknown[];
}

interface IgMessaging {
  sender:    { id: string };
  recipient: { id: string };
  timestamp: number;
  message?:  IgMessage;
}

interface IgEntry {
  id:        string; // Instagram Business Account ID (from IG API subscription)
  time:      number;
  messaging: IgMessaging[];
}

interface IgWebhookBody {
  object: string;
  entry:  IgEntry[];
}

export async function POST(req: NextRequest) {
  // ── 1. Resolve app secret for signature verification ──────────────────────
  let appSecret = process.env.META_APP_SECRET;
  let secretSource = "env-var";

  if (!appSecret) {
    secretSource = "db";
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
    console.error("[ig-webhook] META_APP_SECRET not configured — cannot verify signature. Set META_APP_SECRET in Vercel env vars.");
    return NextResponse.json({ ok: true }); // return 200 so Meta doesn't retry endlessly
  }

  // ── 2. Signature verification ─────────────────────────────────────────────
  const rawBody = await req.text();
  const sig     = req.headers.get("x-hub-signature-256") ?? "";
  const expected = "sha256=" + createHmac("sha256", appSecret).update(rawBody).digest("hex");

  console.log(
    `[ig-webhook] sig-check source=${secretSource}` +
    ` secret_len=${appSecret.length}` +
    ` body_len=${rawBody.length}` +
    ` sig_match=${sig === expected}`,
  );

  // ── Signature gate ────────────────────────────────────────────────────────
  // META_WEBHOOK_DEBUG_BYPASS_SIGNATURE=true skips enforcement for pipeline
  // testing only. Remove the env var to re-enable enforcement. Never commit
  // with bypass active — it is controlled entirely by the Vercel env var.
  // Gated on NODE_ENV so this can never take effect in production even if the
  // env var is accidentally left set there — it only applies to local dev.
  const signatureValid  = sig === expected;
  const bypassSignature =
    process.env.NODE_ENV !== "production" &&
    process.env.META_WEBHOOK_DEBUG_BYPASS_SIGNATURE === "true";

  if (!signatureValid) {
    console.error("[ig-webhook] SIGNATURE FAILED - received_sig does not match expected_sig");
    if (!bypassSignature) {
      console.warn("[ig-webhook] ✗ signature mismatch — halting (set META_WEBHOOK_DEBUG_BYPASS_SIGNATURE=true to bypass for pipeline testing)");
      return NextResponse.json({ ok: true });
    }
    console.error("[ig-webhook] ================================================================");
    console.error("[ig-webhook] DEBUG MODE: META_WEBHOOK_DEBUG_BYPASS_SIGNATURE=true");
    console.error("[ig-webhook] continuing despite signature failure — pipeline test in progress");
    console.error("[ig-webhook] ================================================================");
  } else {
    console.log("[ig-webhook] ✓ signature verified");
  }

  // ── 3. Parse payload ──────────────────────────────────────────────────────
  let body: IgWebhookBody;
  try {
    body = JSON.parse(rawBody);
    console.log(`[ig-webhook] payload parsed object=${body.object} entries=${body.entry?.length ?? 0}`);
  } catch {
    console.error("[ig-webhook] PARSE ERROR: invalid JSON body — cannot process");
    return NextResponse.json({ ok: true });
  }

  // Accept both "instagram" (IG account subscription) and "page" (legacy page subscription)
  if (body.object !== "instagram" && body.object !== "page") {
    console.log(`[ig-webhook] ignoring object type: ${body.object}`);
    return NextResponse.json({ ok: true });
  }

  const svc = createServiceClient();
  const now = new Date().toISOString();

  // Load ALL active meta_instagram integrations once (avoids per-entry DB round-trips)
  let allIntegrations: { org_id: string; config: Record<string, string> }[] = [];
  try {
    const { data: intRows } = await svc
      .from("integrations")
      .select("org_id, config")
      .eq("provider", "meta_instagram")
      .eq("active", true);
    allIntegrations = (intRows ?? []) as { org_id: string; config: Record<string, string> }[];
    console.log(`[ig-webhook] integrations loaded count=${allIntegrations.length}`);
  } catch (e) {
    console.error("[ig-webhook] DB error loading integrations:", e);
    return NextResponse.json({ ok: true });
  }

  // ── 4. Process each entry ─────────────────────────────────────────────────
  for (const entry of body.entry ?? []) {
    const entryId = entry.id;
    console.log(`[ig-webhook] processing entry entry_id=${entryId} messaging_count=${entry.messaging?.length ?? 0}`);

    // Instagram Messaging API (/{ig-user-id}/subscribed_apps):
    //   entry[].id = Instagram Business Account ID  → match by config.instagram_business_account_id
    // Fallback for any legacy page-subscribed events:
    //   entry[].id = Facebook Page ID  → match by config.page_id
    const integration = allIntegrations.find(
      (r) =>
        r.config?.instagram_business_account_id === entryId ||
        r.config?.page_id === entryId,
    ) ?? null;

    if (!integration) {
      console.error(
        `[ig-webhook] integration found=false entry_id=${entryId}` +
        ` checked=${allIntegrations.length} rows` +
        ` — no active meta_instagram row matches this IG account ID or page ID`,
      );
      continue;
    }

    const orgId   = integration.org_id;
    const cfg     = integration.config;
    const igBizId = cfg.instagram_business_account_id;

    console.log(`[ig-webhook] integration found org=${orgId} ig_account=${igBizId}`);

    // Decrypt page token for profile lookups + message sending
    let pageToken: string | null = null;
    try {
      pageToken = cfg.access_token_enc ? decryptSecret(cfg.access_token_enc) : null;
      console.log(`[ig-webhook] page token decrypted ok=${!!pageToken}`);
    } catch (e) {
      console.error("[ig-webhook] page token decrypt failed (non-fatal):", e);
    }

    for (const messaging of entry.messaging ?? []) {
      const msg = messaging.message;
      if (!msg) {
        console.log("[ig-webhook] messaging event has no message field — skipping");
        continue;
      }

      // Skip echo messages (sent by the page/IG account itself)
      if (msg.is_echo) {
        console.log(`[ig-webhook] skipping echo message mid=${msg.mid}`);
        continue;
      }

      const messageText = msg.text ?? null;
      const senderIgsid = messaging.sender.id;

      // Ignore self-messages (sender is the IG business account)
      if (senderIgsid === igBizId) {
        console.log(`[ig-webhook] skipping self-message sender=${senderIgsid}`);
        continue;
      }

      const t_dm_start = Date.now();
      console.log(`[ig-webhook] inbound DM sender=${senderIgsid} has_text=${!!messageText} mid=${msg.mid}`);

      // ── Log to webhook_events for debug panel (fire-and-forget) ───────────
      void (async () => {
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (svc as any).from("webhook_events").insert({
            org_id:     orgId,
            provider:   "meta_instagram",
            event_type: msg.mid ? "message" : "messaging_postback",
            sender_id:  senderIgsid,
            payload:    { entry_id: entryId, mid: msg.mid, has_text: !!messageText },
            verified:   signatureValid,
            created_at: now,
          });
        } catch (e) {
          console.error("[ig-webhook] webhook_events insert failed (non-fatal):", e);
        }
      })();

      // Skip messages without text (images, stickers, etc.)
      if (!messageText) {
        console.log(`[ig-webhook] skipping non-text message mid=${msg.mid}`);
        continue;
      }

      const externalId = "ig_" + senderIgsid;

      // ── 5. Resolve sender display name + existing lead IN PARALLEL ──────
      // Profile lookup (HTTP to Meta) and existing lead DB fetch run concurrently.
      // This saves ~50-100ms over the sequential approach for returning senders.
      // resolvedName is null on failure — we never store "IG …xxx" in the DB.
      let resolvedName: string | null = null;
      if (pageToken) {
        try {
          // Pass 2.5s timeout; slow Meta API responses no longer block DB writes
          const profile = await getIgUserProfile(senderIgsid, pageToken, 2500);
          // Only accept the name if it's a real value, not the "IG …xxx" fallback
          const isRealName = profile.name &&
            !profile.name.startsWith("IG …") &&
            !profile.name.startsWith("IG .") &&
            !/^\d+$/.test(profile.name);
          if (isRealName) {
            resolvedName = profile.name;
          } else if (profile.username && !/^\d+$/.test(profile.username)) {
            resolvedName = `@${profile.username}`;
          }
          console.log(`[ig-webhook] profile resolved display_name="${resolvedName ?? "(none — will keep existing or use fallback)"}" raw_name="${profile.name}" username="${profile.username}"`);
        } catch (e) {
          console.error("[ig-webhook] profile lookup failed (non-fatal):", e);
        }
      } else {
        console.log("[ig-webhook] no page token — skipping profile lookup");
      }

      // ── 6. Upsert lead ──────────────────────────────────────────────────
      let leadId: string;
      try {
        const { data: existingLead } = await svc
          .from("leads")
          .select("id, name")
          .eq("org_id", orgId)
          .eq("channel", "instagram")
          .eq("external_id", externalId)
          .maybeSingle();

        if (existingLead) {
          leadId = (existingLead as { id: string; name?: string | null }).id;
          const currentName = (existingLead as { id: string; name?: string | null }).name ?? "";
          // Re-enrich if: (a) name is blank/numeric IGSID, OR (b) name is a stored
          // "IG …" fallback from a previous failed lookup (stored directly), OR
          // (c) name is "@IG …" — an artifact of a prior webhook bug where the
          // failure-path username ("IG …xxx") was prefixed with "@".
          const nameNeedsEnrichment =
            !currentName ||
            /^\d+$/.test(currentName) ||
            currentName.startsWith("IG …") ||
            currentName.startsWith("IG .") ||
            currentName.startsWith("@IG …") ||
            currentName.startsWith("@IG .");
          const shouldEnrich = nameNeedsEnrichment && !!resolvedName;
          if (shouldEnrich) {
            console.log(`[ig-webhook] re-enriching lead name from "${currentName}" to "${resolvedName}" lead=${leadId}`);
            await svc.from("leads").update({ last_seen_at: now, updated_at: now, name: resolvedName }).eq("id", leadId);
          } else {
            await svc.from("leads").update({ last_seen_at: now, updated_at: now }).eq("id", leadId);
          }
          console.log(`[ig-webhook] lead upserted action=updated lead=${leadId}`);
        } else {
          // For new leads use resolvedName if available, otherwise store the IGSID as the name
          // so there's always a non-null name. The UI has its own display fallback.
          const nameForInsert = resolvedName ?? senderIgsid;
          const { data: newLead, error: le } = await svc.from("leads").insert({
            org_id:       orgId,
            channel:      "instagram",
            external_id:  externalId,
            name:         nameForInsert,
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
          console.log(`[ig-webhook] lead upserted action=created lead=${leadId}`);
        }
      } catch (e) {
        console.error("[ig-webhook] lead upsert error:", e);
        continue;
      }

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
          console.log(`[ig-webhook] conversation upserted action=found conv=${conversationId}`);
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
          console.log(`[ig-webhook] conversation upserted action=created conv=${conversationId}`);
        }
      } catch (e) {
        console.error("[ig-webhook] conversation upsert error:", e);
        continue;
      }

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
        console.log(`[ig-webhook] message inserted msg=${messageId}`);
      } catch (e) {
        console.error("[ig-webhook] message insert error:", e);
        continue;
      }

      // ── 9. Update conversation preview ── REALTIME FIRES HERE ───────────
      // This UPDATE triggers the Supabase Postgres WAL → realtime broadcast,
      // which the inbox-shell client picks up to move the conversation to top.
      try {
        await svc.from("conversations").update({
          last_message_at:      now,
          last_message_preview: messageText.slice(0, 80),
        }).eq("id", conversationId);
        console.log(
          `[ig-webhook] conversation preview updated conv=${conversationId}` +
          ` t_webhook_to_realtime_write=${Date.now() - t_dm_start}ms` +
          ` (profile+lead+conv+msg+update phases total)`,
        );
      } catch (e) {
        console.error("[ig-webhook] conversation preview update failed (non-fatal):", e);
      }

      // ── 10. Fire Inngest event for AI processing ─────────────────────────
      try {
        await inngest.send({
          name: "dm.received",
          data: { orgId, leadId, conversationId, messageId },
        });
        console.log(
          `[ig-webhook] workflow triggered event=dm.received lead=${leadId} conv=${conversationId} msg=${messageId}` +
          ` t_total=${Date.now() - t_dm_start}ms`,
        );
      } catch (e) {
        console.error("[ig-webhook] workflow trigger failed (Inngest send failed):", e);
      }
    }
  }

  console.log("[ig-webhook] processing complete");
  return NextResponse.json({ ok: true });
}
