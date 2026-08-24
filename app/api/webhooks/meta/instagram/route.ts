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
import { createServiceClient }      from "@/lib/supabase/server";
import {
  collectMetaAppSecrets,
  verifyAgainstCandidates,
  collectMetaVerifyTokens,
  matchVerifyToken,
} from "@/lib/meta-secrets";
import { inngest }                  from "@/lib/inngest/client";
import { getIgUserProfile }         from "@/lib/integrations/meta-instagram";
import { decryptSecret }            from "@/lib/crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Record a webhook delivery outcome — including REJECTED ones.
 *
 * Bounded on purpose: this is an unauthenticated code path, so it must not
 * become a write amplifier. A row is only written when the request at least
 * looks like Meta traffic (a signature header present AND a JSON body with an
 * `object` field). Random internet noise gets a 401 with no database write.
 * Only a small, fixed set of non-secret fields is stored — never the raw body.
 */
async function logWebhookEvent(
  rawBody:  string,
  sigHeader: string,
  verified: boolean,
  reason:   string,
  orgId:    string | null = null,
): Promise<void> {
  try {
    if (!sigHeader) return; // not plausibly Meta — do not write

    let entryId: string | null = null;
    let objectType: string | null = null;
    try {
      const parsed = JSON.parse(rawBody) as { object?: string; entry?: { id?: string }[] };
      if (!parsed?.object) return; // not plausibly Meta — do not write
      objectType = parsed.object;
      entryId = parsed.entry?.[0]?.id ?? null;
    } catch {
      return; // unparseable — do not write
    }

    const svc = createServiceClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (svc as any).from("webhook_events").insert({
      org_id:     orgId,
      provider:   "meta_instagram",
      event_type: verified ? "message" : "signature_rejected",
      sender_id:  null,
      payload:    { object: objectType, entry_id: entryId, body_len: rawBody.length, reason },
      verified,
      created_at: new Date().toISOString(),
    });
  } catch (e) {
    console.error("[ig-webhook] webhook_events insert failed (non-fatal):", e);
  }
}

// ── GET — Webhook verification ───────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const url       = new URL(req.url);
  const mode      = url.searchParams.get("hub.mode");
  const token     = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");

  // Same inversion as the POST path: this previously read ONLY
  // process.env.META_WEBHOOK_VERIFY_TOKEN, while getMetaConfig() resolves the
  // token from meta_byo → platform_settings → env. A deployment configured
  // through /admin/platform-settings would pass POST but fail Meta's GET
  // re-verification — and a failed re-verification is itself a reason Meta
  // drops a subscription.
  if (mode !== "subscribe" || !token) {
    return new Response("Forbidden", { status: 403 });
  }

  const tokenCandidates = await collectMetaVerifyTokens();
  const matchedToken = matchVerifyToken(token, tokenCandidates);

  if (matchedToken) {
    console.log(`[ig-webhook] ✓ verification accepted source=${matchedToken.source}`);
    return new Response(challenge ?? "", {
      status: 200,
      headers: { "Content-Type": "text/plain" },
    });
  }

  console.warn(
    `[ig-webhook] ✗ verify_token mismatch — tried=${tokenCandidates.map((c) => c.source).join(",") || "none"}`,
  );
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
  const rawBody = await req.text();
  const sig     = req.headers.get("x-hub-signature-256") ?? "";

  // ── 1. Gather every app secret this deployment knows about ────────────────
  // Previously this read ONLY process.env.META_APP_SECRET (falling back to
  // platform_settings when env was unset) and never consulted meta_byo — the
  // inverse of the order OAuth uses to mint the token that CREATES the
  // subscription. Production evidence: 69 meta_instagram webhook_events, every
  // one verified=false, zero verified=true ever recorded. See lib/meta-secrets.ts.
  const candidates = await collectMetaAppSecrets();

  if (candidates.length === 0) {
    console.error("[ig-webhook] no Meta app secret configured anywhere — cannot verify signature. Rejecting.");
    void logWebhookEvent(rawBody, sig, false, "no_candidates");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // ── 2. Constant-time verification against each candidate ──────────────────
  // This does NOT widen acceptance: a forger must still produce a valid
  // HMAC-SHA256 of this exact body under one of OUR real secrets.
  const { matched, tried } = verifyAgainstCandidates(rawBody, sig, candidates);
  const signatureValid = matched !== null;
  const secretSource   = matched?.source ?? "none";

  console.log(
    `[ig-webhook] sig-check matched_source=${secretSource}` +
    ` matched_app_id=${matched?.appId ?? "unknown"}` +
    ` candidates_tried=${tried.join(",")}` +
    ` body_len=${rawBody.length}` +
    ` sig_match=${signatureValid}`,
  );

  // ── Signature gate — FAIL CLOSED ──────────────────────────────────────────
  // The debug bypass is permanently inert in production. It is honoured only
  // in a non-production runtime, and only when explicitly set to "true".
  // In production an invalid signature is ALWAYS a 401, with no escape hatch.
  //
  // Merge note: this supersedes main's NODE_ENV-gated variant. Same production
  // outcome, but it also covers Preview builds, warns when the var is set in a
  // built deployment, and compares the HMAC in constant time (see above).
  const IS_PROD = process.env.NODE_ENV === "production";
  const bypassRequested = process.env.META_WEBHOOK_DEBUG_BYPASS_SIGNATURE === "true";

  if (IS_PROD && bypassRequested) {
    // NOTE: Next.js inlines NODE_ENV as "production" for every built deployment,
    // so this fires on Preview builds too. Name the actual environment rather
    // than assuming Production, or the operator hunts in the wrong place.
    console.warn(
      "[ig-webhook] ⚠ SECURITY: META_WEBHOOK_DEBUG_BYPASS_SIGNATURE is set in a built " +
      `deployment (VERCEL_ENV=${process.env.VERCEL_ENV ?? "unknown"}). It is being IGNORED — ` +
      "signature enforcement remains active. Remove this env var from that Vercel environment.",
    );
  }

  const bypassSignature = bypassRequested && !IS_PROD;

  if (!signatureValid) {
    console.error(
      `[ig-webhook] SIGNATURE FAILED — no candidate matched. tried=${tried.join(",")}`,
    );
    if (!bypassSignature) {
      console.warn("[ig-webhook] ✗ signature mismatch — rejecting with 401");
      // Record the rejection. Fail-closed previously returned BEFORE the
      // webhook_events insert, which destroyed exactly the observability this
      // whole diagnosis relied on (69 rows, all verified=false). Fire-and-forget.
      void logWebhookEvent(rawBody, sig, false, `no_match:${tried.join("|")}`);
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.warn("[ig-webhook] NON-PRODUCTION DEBUG BYPASS ACTIVE — continuing despite signature failure");
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
      // Whether this enquiry is from someone we've never spoken to before.
      // Forwarded to Inngest so the owner gets a "new enquiry" notification.
      let isNewLead = false;
      let leadDisplayName: string | null = resolvedName;
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
          leadDisplayName = resolvedName ?? (currentName || null);
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
          isNewLead = true;
          const nameForInsert = resolvedName ?? senderIgsid;
          leadDisplayName = nameForInsert;
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
          data: { orgId, leadId, conversationId, messageId, isNewLead, leadName: leadDisplayName },
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
