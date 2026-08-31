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

/** Delivery callback. `id` is the wamid of the ORIGINAL outbound message. */
interface WAStatus {
  id:            string;
  status:        string;   // sent | delivered | read | failed
  timestamp:     string;
  recipient_id?: string;
  errors?:       Array<{ code?: number; title?: string; message?: string }>;
}

interface WAValue {
  messaging_product: string;
  metadata:          WAMetadata;
  contacts?:         WAContact[];
  messages?:         WAMessage[];
  statuses?:         WAStatus[];
}

// Delivery states only ever move forward. Meta does not guarantee callback
// order, so without this a late-arriving `delivered` would clobber a `read`.
// A repeat of the same status ranks equal, updates zero rows, and is therefore
// idempotent for free.
const STATUS_RANK: Record<string, number> = {
  pending: 0, sent: 1, delivered: 2, read: 3, failed: 4,
};

/** Short, non-sensitive summary of a Meta delivery failure. Never includes secrets or message content. */
function summariseFailure(errors: WAStatus["errors"]): string | null {
  const e = errors?.[0];
  if (!e) return null;
  return [e.code, e.title].filter(Boolean).join(": ").slice(0, 200) || null;
}

/**
 * Apply one delivery callback to the outbound message it refers to.
 *
 * Org-scoped, so one tenant's callback can never touch another's row. If no
 * message matches the wamid the callback is dropped: a status event must never
 * conjure a message record into existence.
 */
async function applyStatus(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  svc: any,
  orgId: string,
  st: WAStatus,
): Promise<void> {
  const next = String(st.status ?? "").toLowerCase();
  const rank = STATUS_RANK[next];
  if (rank === undefined) {
    console.warn(`[wa-webhook] unknown status "${next}" — ignoring`);
    return;
  }
  if (!st.id) return;

  // Only advance: allow the update when the row has no status yet, or a lower-ranked one.
  const lower = Object.entries(STATUS_RANK).filter(([, r]) => r < rank).map(([k]) => k);
  const tsMs = Number(st.timestamp) * 1000;

  const patch: Record<string, unknown> = {
    status:            next,
    status_updated_at: new Date(Number.isFinite(tsMs) && tsMs > 0 ? tsMs : Date.now()).toISOString(),
  };
  const failure = next === "failed" ? summariseFailure(st.errors) : null;
  if (failure) patch.failure_reason = failure;

  let qb = svc.from("messages").update(patch)
    .eq("org_id", orgId)
    .eq("provider_message_id", st.id);
  qb = lower.length
    ? qb.or(`status.is.null,status.in.(${lower.join(",")})`)
    : qb.is("status", null);

  const { data, error } = await qb.select("id");
  if (error) {
    console.error(`[wa-webhook] status update failed (${next}): ${error.message}`);
    return;
  }
  const n = (data ?? []).length;
  if (n === 0) {
    // Either the message is unknown to us, or it already holds an equal/higher
    // status. Both are safe no-ops — nothing is created and nothing regresses.
    console.log(`[wa-webhook] status ${next} → no-op (unknown message or already at/ahead of this state)`);
  } else {
    console.log(`[wa-webhook] status ${next} applied msg=${(data as { id: string }[])[0].id}`);
  }
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

      // ── Delivery callbacks (sent / delivered / read / failed) ────────────
      // Meta batches these alongside messages under the same "messages" field.
      for (const st of value.statuses ?? []) {
        await applyStatus(svc, orgId, st);
      }

      for (const msg of value.messages ?? []) {
        if (msg.type !== "text" || !msg.text?.body) continue;

        // ── Idempotency fast path ─────────────────────────────────────────
        // Meta retries whenever it does not get a timely 200. Without this a
        // retry produced a second message row, a second whatsapp.message_received
        // event and therefore a second AI reply to the customer. This SELECT
        // handles the common case cheaply; the unique index on
        // (org_id, provider_message_id) is what makes it correct under a race.
        const { data: alreadyStored } = await svc
          .from("messages")
          .select("id")
          .eq("org_id", orgId)
          .eq("provider_message_id", msg.id)
          .maybeSingle();

        if (alreadyStored) {
          console.log(`[wa-webhook] duplicate delivery ignored msg=${(alreadyStored as { id: string }).id}`);
          continue;
        }

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
          // upsert, not insert: if a concurrent retry won the race between the
          // check above and here, the unique index turns this into a no-op that
          // returns zero rows instead of a duplicate or an error.
          svc.from("messages").upsert({
            conversation_id: conversationId,
            org_id:          orgId,
            direction:       "inbound",
            content:         messageText,
            sent_at:         new Date(metaSentMs).toISOString(),
            // The wamid is the idempotency key. It stays mirrored in metadata so
            // anything already reading metadata.wamid keeps working.
            provider_message_id: msg.id,
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
          }, { onConflict: "org_id,provider_message_id", ignoreDuplicates: true }).select("id"),
          svc.from("conversations").update({
            last_message_at:      now,
            last_message_preview: messageText.slice(0, 80),
          }).eq("id", conversationId),
        ]);

        const { data: insertedRows, error: me } = msgRes as { data: { id: string }[] | null; error: { message: string } | null };
        if (me) {
          console.error("[wa-webhook] message insert failed:", me.message);
          continue;
        }
        // Zero rows means the unique index rejected this as a duplicate: another
        // concurrent delivery of the same wamid already stored it. Skip the
        // Inngest emit so the customer cannot receive two AI replies, and let the
        // handler return 200 so Meta stops retrying.
        if (!insertedRows || insertedRows.length === 0) {
          console.log(`[wa-webhook] concurrent duplicate lost the race — no second message, no workflow`);
          continue;
        }
        const messageId = insertedRows[0].id;

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
