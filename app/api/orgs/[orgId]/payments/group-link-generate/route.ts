/**
 * POST /api/orgs/[orgId]/payments/group-link-generate
 * Request payment from every member of a group.
 * For each member: creates a payment row, generates a UPI/Razorpay link,
 * and writes a payment-request message to their inbox conversation thread.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { z } from "zod";
import { getOrCreateConversation, insertOutboundMessage } from "@/lib/conversation";
import { createPaymentLink } from "@/lib/razorpay";
import { getLeadFirstName } from "@/lib/leads";

interface Params { params: { orgId: string } }

async function assertMember(orgId: string) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.from("org_members").select("role")
    .eq("org_id", orgId).eq("user_id", user.id).single();
  return data ? user : null;
}

const Schema = z.object({
  group_id:    z.string().uuid(),
  amount_inr:  z.number().positive(),
  description: z.string().min(1).max(500),
  method:      z.enum(["razorpay", "upi", "auto"]).default("auto"),
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
    svc.from("orgs").select("name, upi_id").eq("id", params.orgId).single(),
    svc.from("integrations").select("config, active").eq("org_id", params.orgId).eq("provider", "razorpay").eq("active", true).maybeSingle(),
    svc.from("lead_group_members").select("lead_id, lead:lead_id(id, name, external_id, channel, metadata)")
      .eq("group_id", parsed.data.group_id),
  ]);

  const org     = orgRes.data as { name: string; upi_id: string | null } | null;
  const rzp     = rzpRes.data as { active: boolean } | null;
  const members = (membersRes.data ?? []) as Array<{
    lead_id: string;
    lead: { id: string; name: string | null; external_id: string | null; channel: string; metadata: Record<string, unknown> | null };
  }>;

  if (!members.length) return NextResponse.json({ error: "Group has no members" }, { status: 400 });

  const hasRazorpay = !!rzp?.active;
  const hasUpi      = !!org?.upi_id;
  const { method, amount_inr, description } = parsed.data;

  const useRazorpay = method === "razorpay" || (method === "auto" && hasRazorpay);
  const useUpi      = method === "upi" || (method === "auto" && !hasRazorpay && hasUpi);

  if (!useRazorpay && !useUpi) {
    return NextResponse.json({ error: "No payment method configured. Connect Razorpay or add a UPI ID in Settings › Payments." }, { status: 400 });
  }

  const now = new Date().toISOString();
  let successCount = 0;
  const results: Array<{ lead_id: string; ok: boolean; error?: string }> = [];

  // Process each member sequentially (Razorpay rate limits)
  for (const m of members) {
    const lead      = m.lead;
    const firstName = getLeadFirstName({ name: lead.name, external_id: lead.external_id ?? null });

    try {
      let linkUrl    = "";
      let linkMethod = "upi";

      if (useRazorpay && hasRazorpay) {
        try {
          const result = await createPaymentLink({
            orgId:        params.orgId,
            amountInr:    amount_inr,
            description,
            customerName: lead.name ?? undefined,
          });
          linkUrl    = result?.shortUrl ?? "";
          linkMethod = "razorpay";
        } catch { /* fall through to UPI */ }
      }

      if (!linkUrl && useUpi && hasUpi) {
        const pa = encodeURIComponent(org!.upi_id!);
        const pn = encodeURIComponent(org?.name ?? "Coach");
        const am = encodeURIComponent(String(amount_inr));
        const tn = encodeURIComponent(description);
        linkUrl    = `upi://pay?pa=${pa}&pn=${pn}&am=${am}&tn=${tn}&cu=INR`;
        linkMethod = "upi";
      }

      // Create payment row
      const { data: payment } = await svc.from("payments").insert({
        org_id:           params.orgId,
        lead_id:          lead.id,
        amount_inr,
        status:           "pending",
        payment_method:   linkMethod,
        payment_link_url: linkUrl || null,
        description,
        notes:            `Group request: ${(group as { name: string }).name}`,
        created_at:       now,
        updated_at:       now,
      }).select("id").single();

      // Write to inbox conversation immediately
      const msg = linkUrl
        ? `Hi ${firstName}! A payment request of ₹${amount_inr.toLocaleString("en-IN")} has been sent for "${description}".\n\nPay here: ${linkUrl} 💳`
        : `Hi ${firstName}! A payment of ₹${amount_inr.toLocaleString("en-IN")} is due for "${description}". Please reach out to complete your payment.`;

      const provider =
        lead.channel === "whatsapp" ? "whatsapp_cloud" :
        lead.channel === "instagram" ? "meta_instagram" : "manual_crm";

      const convId = await getOrCreateConversation(params.orgId, lead.id, provider);
      await svc.from("payments").update({ conversation_id: convId })
        .eq("id", (payment as { id: string }).id).catch(() => null);
      await insertOutboundMessage(convId, params.orgId, msg, "group_payment_request");

      successCount++;
      results.push({ lead_id: lead.id, ok: true });
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.error("[payments/group-link-generate] failed for lead", lead.id, errMsg);
      results.push({ lead_id: lead.id, ok: false, error: errMsg });
    }
  }

  return NextResponse.json({ ok: true, total: members.length, sent: successCount, failed: members.length - successCount });
}
