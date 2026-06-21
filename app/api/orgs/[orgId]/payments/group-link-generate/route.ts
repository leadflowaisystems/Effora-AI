/**
 * POST /api/orgs/[orgId]/payments/group-link-generate
 * Request payment from every member of a group.
 * For each member: creates a payment row, generates a UPI/Razorpay link,
 * and writes a payment-request message to their inbox conversation thread.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { z } from "zod";
import { getOrCreateConversation, deliverOutboundMessage } from "@/lib/conversation";
import { createPaymentLink, type PaymentLinkError } from "@/lib/razorpay";
import { getLeadFirstName } from "@/lib/leads";
import { inngest } from "@/lib/inngest/client";
import { writeLeadEvent } from "@/lib/lead-events";

interface Params { params: { orgId: string } }

function razorpayUserMessage(err: PaymentLinkError): string {
  if (err.httpStatus === 0) return err.description;
  if (err.isTestMode)
    return "Razorpay test-mode limit reached (30 payment links). Switch to Live Mode in your Razorpay dashboard, or use UPI.";
  if (err.isRateLimit)
    return "Razorpay rate limit exceeded. Please try again in a moment.";
  return `Razorpay error: ${err.description}`;
}

async function assertMember(orgId: string) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.from("org_members").select("role")
    .eq("org_id", orgId).eq("user_id", user.id).single();
  return data ? user : null;
}

const Schema = z.object({
  group_id:       z.string().uuid(),
  amount_inr:     z.number().positive(),
  description:    z.string().min(1).max(500),
  method:         z.enum(["razorpay", "upi", "auto"]).default("auto"),
  custom_url:     z.string().url().optional().or(z.literal("")),
  custom_message: z.string().max(2000).optional(),
});

export async function POST(req: NextRequest, { params }: Params) {
  const user = await assertMember(params.orgId);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  const parsed = Schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const svc = createServiceClient() as any;

  // Verify group
  const { data: group } = await svc.from("lead_groups").select("id, name")
    .eq("id", parsed.data.group_id).eq("org_id", params.orgId).is("deleted_at", null).single();
  if (!group) return NextResponse.json({ error: "Group not found" }, { status: 404 });

  // Load org payment settings + group members in parallel
  const [orgRes, rzpRes, membersRes] = await Promise.all([
    svc.from("orgs").select("name, upi_id, payment_mode").eq("id", params.orgId).single(),
    svc.from("integrations").select("config, active").eq("org_id", params.orgId).eq("provider", "razorpay").eq("active", true).maybeSingle(),
    svc.from("lead_group_members").select("lead_id, lead:lead_id(id, name, external_id, channel, metadata)")
      .eq("group_id", parsed.data.group_id),
  ]);

  const org     = orgRes.data as { name: string; upi_id: string | null; payment_mode: string | null } | null;
  const rzp     = rzpRes.data as { active: boolean } | null;
  const members = (membersRes.data ?? []) as Array<{
    lead_id: string;
    lead: { id: string; name: string | null; external_id: string | null; channel: string; metadata: Record<string, unknown> | null };
  }>;

  if (!members.length) return NextResponse.json({ error: "Group has no members" }, { status: 400 });

  const hasRazorpay = !!rzp?.active;
  const hasUpi      = !!org?.upi_id;
  const paymentMode = (org?.payment_mode ?? "both") as "razorpay_only" | "upi_only" | "both";
  const { method, amount_inr, description, custom_url, custom_message } = parsed.data;

  // Enforce payment mode (skip for custom_url — it bypasses mode entirely)
  if (!custom_url?.trim()) {
    if (paymentMode === "razorpay_only" && !hasRazorpay) {
      return NextResponse.json({ error: "Razorpay Only mode is active but Razorpay is not configured. Add API keys in Settings › Payments." }, { status: 400 });
    }
    if (paymentMode === "upi_only" && !hasUpi) {
      return NextResponse.json({ error: "UPI Only mode is active but no UPI ID is configured. Add your UPI ID in Settings › Payments." }, { status: 400 });
    }
    if (method === "razorpay" && paymentMode === "upi_only") {
      return NextResponse.json({ error: "This org is set to UPI Only. Change payment mode in Settings › Payments to use Razorpay." }, { status: 400 });
    }
    if (method === "upi" && paymentMode === "razorpay_only") {
      return NextResponse.json({ error: "This org is set to Razorpay Only. Change payment mode in Settings › Payments to use UPI." }, { status: 400 });
    }
  }

  let useRazorpay: boolean;
  let useUpi: boolean;

  if (paymentMode === "razorpay_only") {
    useRazorpay = hasRazorpay;
    useUpi      = false;
  } else if (paymentMode === "upi_only") {
    useRazorpay = false;
    useUpi      = hasUpi;
  } else {
    useRazorpay = method === "razorpay" || (method === "auto" && hasRazorpay);
    useUpi      = method === "upi" || (method === "auto" && !hasRazorpay && hasUpi);
  }

  console.log(`[payments/group-link-generate] DIAG org="${org?.name}" upi_id="${org?.upi_id ?? "(none)"}" payment_mode="${paymentMode}" hasRazorpay=${hasRazorpay} hasUpi=${hasUpi} method="${method}" useRazorpay=${useRazorpay} useUpi=${useUpi} custom_url="${custom_url ?? "(none)"}" members=${members.length}`);

  if (!custom_url?.trim() && !useRazorpay && !useUpi) {
    return NextResponse.json({ error: "No payment method configured. Connect Razorpay or add a UPI ID in Settings › Payments." }, { status: 400 });
  }

  const now = new Date().toISOString();
  let successCount = 0;
  const results: Array<{ lead_id: string; ok: boolean; msg?: string; error?: string }> = [];

  // Process each member sequentially (Razorpay rate limits)
  for (const m of members) {
    const lead      = m.lead;
    const firstName = getLeadFirstName({ name: lead.name, external_id: lead.external_id ?? null });

    console.log(`[payments/group-link-generate] DIAG START lead_id=${lead.id} lead_name="${lead.name}" lead_channel="${lead.channel}" external_id="${lead.external_id ?? "(none)"}"`);

    try {
      let linkUrl    = "";
      let linkMethod = "upi";

      // Custom URL overrides auto-generation for all members (shared URL)
      if (custom_url?.trim()) {
        linkUrl    = custom_url.trim();
        linkMethod = "custom";
        console.log(`[payments/group-link-generate] DIAG lead=${lead.id} link_path=custom_url linkUrl="${linkUrl}"`);
      } else {
        if (useRazorpay && hasRazorpay) {
          const result = await createPaymentLink({
            orgId:        params.orgId,
            amountInr:    amount_inr,
            description,
            customerName: lead.name ?? undefined,
          });
          if (result.ok) {
            linkUrl    = result.data.shortUrl;
            linkMethod = "razorpay";
            console.log(`[payments/group-link-generate] DIAG lead=${lead.id} link_path=razorpay linkUrl="${linkUrl}"`);
          } else if (paymentMode === "razorpay_only") {
            const userMsg = razorpayUserMessage(result.error);
            console.warn(`[payments/group-link-generate] DIAG lead=${lead.id} razorpay_failed_razorpay_only code=${result.error.razorpayCode}`);
            results.push({ lead_id: lead.id, ok: false, error: userMsg });
            continue;
          } else {
            // "both" mode — fall through to UPI
            console.warn(`[payments/group-link-generate] DIAG lead=${lead.id} razorpay_failed code=${result.error.razorpayCode ?? result.error.httpStatus} falling_back_to_upi`);
          }
        }

        if (!linkUrl && useUpi && hasUpi) {
          const pa = encodeURIComponent(org!.upi_id!);
          const pn = encodeURIComponent(org?.name ?? "Coach");
          const am = encodeURIComponent(String(amount_inr));
          const tn = encodeURIComponent(description);
          linkUrl    = `upi://pay?pa=${pa}&pn=${pn}&am=${am}&tn=${tn}&cu=INR`;
          linkMethod = "upi";
          console.log(`[payments/group-link-generate] DIAG lead=${lead.id} link_path=upi linkUrl="${linkUrl}"`);
        }

        if (!linkUrl) {
          console.warn(`[payments/group-link-generate] DIAG lead=${lead.id} link_path=NONE linkUrl="" useRazorpay=${useRazorpay} hasRazorpay=${hasRazorpay} useUpi=${useUpi} hasUpi=${hasUpi}`);
        }
      }

      // Build payment insert payload — log every field
      const paymentInsertPayload = {
        org_id:           params.orgId,
        lead_id:          lead.id,
        amount_inr,
        status:           "pending",
        payment_method:   linkMethod,
        payment_link_url: linkUrl || null,
        link_url:         linkUrl || null,
        link_method:      linkMethod,
        notes:            `Group request: ${(group as { name: string }).name} — ${description}`,
        source:           "group_request",
        custom_message:   custom_message?.trim() || null,
        created_at:       now,
        updated_at:       now,
      };
      console.log(`[payments/group-link-generate] DIAG lead=${lead.id} payment_insert_payload=${JSON.stringify(paymentInsertPayload)}`);

      const { data: payment, error: payErr } = await svc.from("payments").insert(paymentInsertPayload).select("id").single();

      console.log(`[payments/group-link-generate] DIAG lead=${lead.id} payment_insert_result: data=${JSON.stringify(payment)} error=${JSON.stringify(payErr)}`);

      if (payErr || !payment) {
        const errMsg = payErr?.message ?? payErr?.details ?? payErr?.hint ?? "payment insert returned null — no error details";
        console.error(`[payments/group-link-generate] DIAG lead=${lead.id} PAYMENT_INSERT_FAILED: code="${payErr?.code}" msg="${errMsg}" details="${payErr?.details ?? ""}" hint="${payErr?.hint ?? ""}"`);
        results.push({ lead_id: lead.id, ok: false, error: errMsg });
        continue;
      }

      // Write lead event (non-fatal)
      void writeLeadEvent({
        orgId:      params.orgId,
        leadId:     lead.id,
        eventType:  "payment_created",
        entityType: "payment",
        entityId:   (payment as { id: string }).id,
        title:      `Payment link created — ₹${amount_inr.toLocaleString("en-IN")} (group)`,
        metadata:   { amount_inr, description },
      });

      // Write to inbox conversation and deliver to real channel
      const fullName = lead.name ?? "there";
      const amtStr   = `₹${amount_inr.toLocaleString("en-IN")}`;
      const msg = custom_message?.trim()
        ? custom_message
            .replace(/\{\{name\}\}/gi,        fullName)
            .replace(/\{\{first_name\}\}/gi,  firstName)
            .replace(/\{\{amount\}\}/gi,      amtStr)
            .replace(/\{\{description\}\}/gi, description)
            .replace(/\{\{link\}\}/gi,        linkUrl)
        : linkUrl
        ? `Hi ${firstName}! A payment request of ${amtStr} has been sent for "${description}".\n\nPay here: ${linkUrl} 💳`
        : `Hi ${firstName}! A payment of ${amtStr} is due for "${description}". Please reach out to complete your payment.`;

      const provider =
        lead.channel === "whatsapp" || lead.channel === "whatsapp_cloud" ? "whatsapp_cloud" :
        lead.channel === "instagram" ? "meta_instagram" : "manual_crm";

      console.log(`[payments/group-link-generate] DIAG lead=${lead.id} provider="${provider}" msg_first80="${msg.slice(0, 80).replace(/\n/g, "\\n")}"`);

      const convId = await getOrCreateConversation(params.orgId, lead.id, provider);
      console.log(`[payments/group-link-generate] DIAG lead=${lead.id} conv_id="${convId}"`);

      // Update payment row with conversation_id (safe to fail — non-critical)
      const { error: convLinkErr } = await svc.from("payments")
        .update({ conversation_id: convId })
        .eq("id", (payment as { id: string }).id);
      if (convLinkErr) {
        console.warn(`[payments/group-link-generate] DIAG conv_link_update failed lead=${lead.id} err="${convLinkErr.message}"`);
      }

      // deliverOutboundMessage: sends to real WA/IG channel AND stores to DB
      const deliverResult = await deliverOutboundMessage(convId, params.orgId, msg, "group_payment_request");
      console.log(`[payments/group-link-generate] DIAG lead=${lead.id} delivered=${deliverResult.delivered} provider_msg_id="${deliverResult.provider_message_id ?? "null"}"`);

      successCount++;
      results.push({ lead_id: lead.id, ok: true, msg });
      console.log(`[payments/group-link-generate] DIAG SUCCESS lead=${lead.id} successCount=${successCount}`);
    } catch (err) {
      const errMsg  = err instanceof Error ? err.message : String(err);
      const stack1  = err instanceof Error ? (err.stack?.split("\n")[1]?.trim() ?? "") : "";
      const stack2  = err instanceof Error ? (err.stack?.split("\n")[2]?.trim() ?? "") : "";
      console.error(`[payments/group-link-generate] DIAG EXCEPTION lead=${lead.id} error="${errMsg}" at="${stack1}" via="${stack2}"`);
      results.push({ lead_id: lead.id, ok: false, error: errMsg });
    }
    console.log(`[payments/group-link-generate] DIAG END lead=${lead.id}`);
  }

  // ── Fire Inngest fan-out for actual IG/WA API delivery ─────────────────────
  // Create a broadcast record + delivery rows so on-broadcast-process can call
  // the channel APIs for each member (rate-limited, dev-mode safe).
  if (successCount > 0) {
    try {
      const broadcastChannel = (members[0]?.lead?.channel === "instagram") ? "instagram" : "whatsapp";

      const { data: bcast } = await svc.from("broadcasts").insert({
        org_id:           params.orgId,
        group_id:         parsed.data.group_id,
        channel:          broadcastChannel,
        message_template: `Payment request: ₹${parsed.data.amount_inr.toLocaleString("en-IN")} for "${parsed.data.description}"`,
        variables:        { type: "payment_request" },
        status:           "queued",
        send_at:          now,
        total_recipients: successCount,
        created_at:       now,
      }).select("id").single();

      if (bcast) {
        const deliveryRows = results
          .filter((r) => r.ok && r.msg)
          .map((r) => ({
            broadcast_id:     (bcast as { id: string }).id,
            lead_id:          r.lead_id,
            channel:          broadcastChannel,
            rendered_message: r.msg, // personalized message with payment link
            status:           "pending",
            created_at:       now,
          }));

        if (deliveryRows.length > 0) {
          await svc.from("broadcast_deliveries").insert(deliveryRows);
          await inngest.send({
            name: "broadcast.queued",
            data: { broadcast_id: (bcast as { id: string }).id, org_id: params.orgId },
          });
        }
      }
    } catch (e) {
      console.warn("[payments/group-link-generate] Inngest fan-out setup failed (non-fatal):", e);
    }
  }

  return NextResponse.json({ ok: true, total: members.length, sent: successCount, failed: members.length - successCount });
}
