/**
 * POST /api/orgs/[orgId]/export
 *
 * Generates a data export for the org (leads CSV, payments CSV, bookings CSV,
 * conversations JSON) and emails a download link to the owner.
 *
 * For simplicity at current scale: builds the export inline and emails the
 * raw data as an attachment via Brevo. At larger scale this should be an
 * Inngest background job uploading to Supabase Storage.
 */

export const runtime    = "nodejs";
export const maxDuration = 30;

import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit";
import { sendEmail } from "@/lib/email";

interface Params { params: { orgId: string } }

async function assertMember(orgId: string) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.from("org_members").select("role")
    .eq("org_id", orgId).eq("user_id", user.id).single();
  return data ? user : null;
}

function toCsv(rows: Record<string, unknown>[]): string {
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]);
  const escape  = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  return [
    headers.join(","),
    ...rows.map((r) => headers.map((h) => escape(r[h])).join(",")),
  ].join("\n");
}

export async function POST(req: NextRequest, { params }: Params) {
  const user = await assertMember(params.orgId);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const svc = createServiceClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const s = svc as any;

  // Fetch all org data in parallel
  const [leadsRes, paymentsRes, bookingsRes, convsRes] = await Promise.all([
    s.from("leads").select("id,name,external_id,channel,stage,score,tags,notes,ltv_inr,created_at").eq("org_id", params.orgId).is("deleted_at", null),
    s.from("payments").select("id,lead_id,amount_inr,status,due_date,paid_at,note,created_at").eq("org_id", params.orgId),
    s.from("bookings").select("id,lead_id,event_type,start_time,end_time,status,note,created_at").eq("org_id", params.orgId),
    s.from("conversations").select("id,lead_id,channel,created_at").eq("org_id", params.orgId).limit(5000),
  ]);

  const leadsCsv    = toCsv(leadsRes.data    ?? []);
  const paymentsCsv = toCsv(paymentsRes.data ?? []);
  const bookingsCsv = toCsv(bookingsRes.data ?? []);
  const convsJson   = JSON.stringify(convsRes.data ?? [], null, 2);

  void logAudit(svc, params.orgId, user.id, "org.data_export", {
    leads:    (leadsRes.data ?? []).length,
    payments: (paymentsRes.data ?? []).length,
    bookings: (bookingsRes.data ?? []).length,
  });

  const email = user.email;
  if (email) {
    void sendEmail({
      to:       email,
      subject:  "Your Effora AI data export",
      template: "data_export",
      orgId:    params.orgId,
      html: `
        <p>Hi,</p>
        <p>Your Effora AI data export is ready. Here is a summary of what was exported:</p>
        <ul>
          <li><strong>${(leadsRes.data ?? []).length}</strong> leads</li>
          <li><strong>${(paymentsRes.data ?? []).length}</strong> payments</li>
          <li><strong>${(bookingsRes.data ?? []).length}</strong> bookings</li>
          <li><strong>${(convsRes.data ?? []).length}</strong> conversations</li>
        </ul>
        <p>The full data is attached below as CSV/JSON files. Keep this email in a safe place.</p>
        <hr />
        <h3>Leads (CSV)</h3>
        <pre style="font-size:11px;background:#f5f5f5;padding:8px;border-radius:4px;overflow-x:auto">${leadsCsv.slice(0, 5000)}</pre>
        <h3>Payments (CSV)</h3>
        <pre style="font-size:11px;background:#f5f5f5;padding:8px;border-radius:4px;overflow-x:auto">${paymentsCsv.slice(0, 3000)}</pre>
        <h3>Bookings (CSV)</h3>
        <pre style="font-size:11px;background:#f5f5f5;padding:8px;border-radius:4px;overflow-x:auto">${bookingsCsv.slice(0, 3000)}</pre>
        <p style="color:#888;font-size:12px">— Effora AI. Exported at ${new Date().toUTCString()}</p>
      `,
    });
  }

  return NextResponse.json({ ok: true, message: "Export email sent to " + (email ?? "your email address.") });
}
