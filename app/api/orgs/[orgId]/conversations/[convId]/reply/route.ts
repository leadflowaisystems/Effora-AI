/**
 * POST /api/orgs/[orgId]/conversations/[convId]/reply
 * Send a manual outbound message.
 * Body: { content: string }
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { sendInstagramMessage } from "@/lib/integrations/meta-instagram";
import { sendWhatsAppMessage }  from "@/lib/integrations/whatsapp-cloud";

// channel_provider values that map to Instagram (webhook writes "instagram",
// but the integration provider is "meta_instagram" — accept both)
const IG_PROVIDERS = new Set(["instagram", "meta_instagram"]);
// channel_provider values that map to WhatsApp Cloud API
const WA_PROVIDERS = new Set(["whatsapp_cloud"]);

interface Params { params: { orgId: string; convId: string } }

async function assertMember(orgId: string) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase
    .from("org_members").select("role")
    .eq("org_id", orgId).eq("user_id", user.id).single();
  return data ? user : null;
}

export async function POST(req: NextRequest, { params }: Params) {
  // ── Instrumentation ───────────────────────────────────────────────────────
  // Stage timings for the manual-reply hot path. Each value is wall-clock ms
  // for one sequential await. Emitted as a log line AND as a Server-Timing
  // response header so the browser's Network panel shows the server-side
  // breakdown without any UI change. Safe fields only: ids and durations.
  const tStart = Date.now();
  const T: Record<string, number> = {};
  const mark = (k: string, from: number) => { T[k] = Date.now() - from; };

  const tAuth = Date.now();
  const user = await assertMember(params.orgId);
  mark("auth", tAuth);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({})) as { content?: string; attachment_url?: string };

  if (!body.content?.trim() && !body.attachment_url?.trim()) {
    return NextResponse.json({ error: "content or attachment_url is required" }, { status: 400 });
  }

  const content      = body.content?.trim() ?? "";
  const attachmentUrl = body.attachment_url?.trim() || undefined;
  const now     = new Date().toISOString();
  const svc     = createServiceClient();

  // Load conversation to determine channel + lead's external_id for real delivery.
  //
  // OPTIMIZATION (Step 7B): the lead's external_id is embedded here via the
  // conversations->leads foreign key instead of being fetched by a second
  // query inside each channel branch. The old code was two strictly sequential
  // round-trips (the lead query needed conv.lead_id), each measured at ~249 ms.
  // Embedding collapses them into one, removing one full round-trip.
  //
  // SECURITY: scoped to BOTH the conversation id and params.orgId.
  //
  // assertMember() above proves the caller belongs to params.orgId, but it says
  // nothing about who owns this conversation. Previously the lookup filtered on
  // id alone while using the service-role client (RLS bypassed), so a member of
  // org A could reply into an org B conversation — messaging another tenant's
  // customer using org A's WhatsApp credentials. Confirmed live: HTTP 200.
  //
  // This mirrors the existing safe pattern in
  // app/api/orgs/[orgId]/conversations/[convId]/route.ts:31.
  const tConv = Date.now();
  const { data: conv } = await svc
    .from("conversations")
    .select("channel_provider, lead_id, leads(external_id)")
    .eq("id", params.convId)
    .eq("org_id", params.orgId)
    .single();
  mark("conv", tConv);

  // SECURITY: the scoped query alone is NOT sufficient — bail out here.
  // Without this return, a miss leaves conv null, which only skips channel
  // delivery; execution would still reach the message insert below, and because
  // messages.conversation_id has a foreign key to a row that genuinely exists
  // (in the other org) that insert would SUCCEED, writing into the other
  // tenant's conversation. Returning before any send, insert or update is what
  // makes the fix complete.
  //
  // 404 rather than 403 so the response cannot be used to probe whether a
  // conversation id exists in another org.
  if (!conv) {
    console.warn(`[reply] conversation not found in org — rejected org=${params.orgId} conv=${params.convId}`);
    return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
  }

  // PostgREST returns a many-to-one embed as an object; tolerate an array shape
  // defensively so a PostgREST version change cannot break delivery.
  const embeddedLead = (conv as { leads?: { external_id?: string } | { external_id?: string }[] } | null)?.leads;
  const leadExternalId =
    (Array.isArray(embeddedLead) ? embeddedLead[0]?.external_id : embeddedLead?.external_id) ?? "";

  let providerMessageId: string | null = null;
  const deliveryMeta: Record<string, string> = {};

  const channelProvider = (conv as { channel_provider?: string } | null)?.channel_provider ?? "";
  console.log(`[ig-send] request conv=${params.convId} channel_provider=${channelProvider}`);

  // Send via Meta Graph API if this is an Instagram conversation.
  // Accept both "instagram" (written by the webhook handler) and
  // "meta_instagram" (the integration provider value) — they are the same channel.
  // Delivery failure is non-fatal: the message is always stored in the DB so the
  // coach can see what was typed, and delivery_error metadata surfaces the reason.
  if (IG_PROVIDERS.has(channelProvider)) {
    const rawIgUserId = leadExternalId.replace(/^ig_/, "");

    console.log(`[ig-send] token loading org=${params.orgId} recipient=${rawIgUserId || "(empty)"}`);

    if (!rawIgUserId) {
      console.error("[ig-send] graph error: could not resolve IG user ID from lead.external_id");
      deliveryMeta.delivery_error = "missing_psid";
    } else if (!/^\d+$/.test(rawIgUserId)) {
      console.log(`[ig-send] skipping delivery — external_id="${rawIgUserId}" is not a numeric PSID`);
      deliveryMeta.delivery_error = "non_numeric_psid";
    } else {
      try {
        console.log(`[ig-send] graph request POST /{page_id}/messages recipient=${rawIgUserId}`);
        const result = await sendInstagramMessage(params.orgId, rawIgUserId, content, attachmentUrl);
        providerMessageId = result.provider_message_id;
        console.log(`[ig-send] graph response ok provider_message_id=${providerMessageId}`);
      } catch (sendErr) {
        const reason = sendErr instanceof Error ? sendErr.message : String(sendErr);
        const is24hWindow =
          reason.includes("outside") || reason.includes("131047") ||
          reason.includes("131026") || reason.includes("368");
        const isPermissionError =
          reason.includes('"code":200') || reason.includes("\"code\": 200") ||
          reason.includes("Advanced Access") || reason.includes("instagram_manage_messages");
        if (isPermissionError) {
          deliveryMeta.delivery_error = "meta_permission_development_mode";
          console.error(`[ig-send] META PERMISSION ERROR conv=${params.convId}: App lacks Advanced Access to instagram_manage_messages — recipient is not a Meta App tester. Apply for App Review to enable messaging to all users.`);
        } else if (is24hWindow) {
          deliveryMeta.delivery_error = "outside_24h_window";
          console.warn(`[ig-send] manual delivery skipped (outside 24h window) conv=${params.convId}`);
        } else {
          deliveryMeta.delivery_error = reason;
          console.error(`[ig-send] manual delivery failed conv=${params.convId}:`, reason);
        }
      }
    }
  } else if (WA_PROVIDERS.has(channelProvider)) {
    // ── WhatsApp Cloud API manual reply ──────────────────────────────────────
    // lead.external_id now arrives with the conversation query above (one fewer
    // round-trip). T.lead stays reported as 0 so the Step 7A before/after
    // comparison keeps the same key set.
    T.lead = 0;
    const rawExtId = leadExternalId.replace(/^wa_/, "");

    console.log(`[wa-send] manual reply conv=${params.convId} recipient=${rawExtId || "(empty)"}`);

    if (!rawExtId) {
      console.error("[wa-send] could not resolve phone from lead.external_id");
      deliveryMeta.delivery_error = "missing_phone";
    } else if (!content.trim()) {
      // Image-only not yet supported for WA in manual path — store as text
      console.log("[wa-send] skipping — empty content (WA image send not yet supported in manual path)");
    } else {
      try {
        const tSend = Date.now();
        const result = await sendWhatsAppMessage(params.orgId, rawExtId, content);
        mark("send", tSend);
        if (result.graph_ms !== undefined) T.graph = result.graph_ms;
        if (result.cfg_ms   !== undefined) T.cfg   = result.cfg_ms;
        providerMessageId = result.provider_message_id;
        console.log(`[wa-send] delivery ok provider_message_id=${providerMessageId}`);
      } catch (sendErr) {
        const reason = sendErr instanceof Error ? sendErr.message : String(sendErr);
        const is24hWindow =
          reason.includes("131047") || reason.includes("outside");
        if (is24hWindow) {
          deliveryMeta.delivery_error = "outside_24h_window";
          console.warn(`[wa-send] delivery skipped (outside 24h window) conv=${params.convId}`);
        } else {
          deliveryMeta.delivery_error = reason;
          console.error(`[wa-send] delivery failed conv=${params.convId}:`, reason);
        }
      }
    }
  } else {
    console.log(`[ig-send] skipping delivery — channel_provider=${channelProvider} is not Instagram or WhatsApp`);
  }

  // Display content: for image-only messages use the URL as the stored content
  const storedContent = content || attachmentUrl || "";

  // OPTIMIZATION (Step 7B): the message insert and the conversation preview
  // update are independent writes to different tables — neither consumes the
  // other's result, and the thread orders by messages.sent_at, not by any
  // conversation column. They were strictly sequential (~249 ms + ~248 ms);
  // running them concurrently removes one round-trip.
  //
  // Deliberately parallelised rather than deferred past the response: this
  // runtime has neither waitUntil (@vercel/functions is not a dependency) nor
  // Next 14.2 unstable_after, so work started after the response could be
  // dropped when the instance freezes. Both writes stay fully awaited.
  const tWrites = Date.now();
  const [insertRes, updateRes] = await Promise.all([
    svc.from("messages").insert({
      conversation_id:    params.convId,
      org_id:             params.orgId,
      direction:          "outbound",
      content:            storedContent,
      sent_at:            now,
      provider_message_id: providerMessageId,
      metadata:           {
        source:         "manual",
        sent_by:        user.id,
        attachment_url: attachmentUrl ?? null,
        ...deliveryMeta,
        // Instrumentation: per-stage ms for this reply. Durations only, no PII.
        t: { ...T },
      },
    }).select("id, content, sent_at").single(),
    svc.from("conversations").update({
      last_message_at:      now,
      last_message_preview: (content || (attachmentUrl ? "📷 Image" : "")).slice(0, 80),
    }).eq("id", params.convId),
  ]);
  // Both keys retained so the Step 7A before/after comparison keeps its shape.
  mark("insert", tWrites);
  mark("convUpdate", tWrites);

  const { data: message, error } = insertRes;

  // The preview update's error was previously discarded silently. Log it now —
  // strictly more visibility, no behaviour change (it stays non-fatal because
  // the message row is the source of truth, not the preview string).
  if (updateRes.error) {
    console.warn(`[reply] conversation preview update failed conv=${params.convId}: ${updateRes.error.message}`);
  }

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  T.total = Date.now() - tStart;

  // Log line: ids + durations only — never phone numbers, content or secrets.
  console.log(
    `[wa-timing] stage=manual_reply org=${params.orgId} conv=${params.convId} msg=${(message as { id: string } | null)?.id ?? "none"} ` +
    Object.entries(T).map(([k, v]) => `${k}_ms=${v}`).join(" "),
  );

  const deliveryFailed = !!deliveryMeta.delivery_error;
  return NextResponse.json(
    { message, delivery_failed: deliveryFailed, delivery_error: deliveryMeta.delivery_error ?? null },
    // Server-Timing exposes the same breakdown in the browser Network panel,
    // so browser-request -> server-response can be measured with no UI change.
    { headers: { "Server-Timing": Object.entries(T).map(([k, v]) => `${k};dur=${v}`).join(", ") } },
  );
}
