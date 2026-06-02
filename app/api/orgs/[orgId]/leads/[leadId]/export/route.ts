/**
 * GET /api/orgs/[orgId]/leads/[leadId]/export?format=csv
 *
 * Downloads a CSV containing the lead's full profile + bookings + payments.
 * Returns Content-Disposition: attachment so the browser triggers a download.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

interface Params { params: { orgId: string; leadId: string } }

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
  const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  return [
    headers.join(","),
    ...rows.map((r) => headers.map((h) => esc(r[h])).join(",")),
  ].join("\n");
}

export async function GET(req: NextRequest, { params }: Params) {
  const user = await assertMember(params.orgId);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const svc = createServiceClient() as any;

  const [leadRes, bookingsRes, paymentsRes] = await Promise.all([
    svc.from("leads")
       .select("id,name,external_id,channel,score,stage,tags,notes,ltv_inr,last_seen_at,created_at,source")
       .eq("id", params.leadId).eq("org_id", params.orgId).single(),
    svc.from("bookings")
       .select("id,status,starts_at,ends_at,meeting_url,attendee_name,attendee_email,created_at")
       .eq("lead_id", params.leadId).eq("org_id", params.orgId)
       .order("starts_at", { ascending: false }),
    svc.from("payments")
       .select("id,amount_inr,status,payment_link_url,notes,created_at,updated_at")
       .eq("lead_id", params.leadId).eq("org_id", params.orgId)
       .order("created_at", { ascending: false }),
  ]);

  if (!leadRes.data) return NextResponse.json({ error: "Lead not found" }, { status: 404 });

  const lead = leadRes.data;
  const leadName = (lead.name ?? lead.external_id ?? "lead").replace(/[^a-z0-9]/gi, "_").toLowerCase();

  // Build a combined multi-section CSV
  const sections = [
    "# LEAD PROFILE",
    toCsv([lead]),
    "",
    "# BOOKINGS",
    toCsv(bookingsRes.data ?? []),
    "",
    "# PAYMENTS",
    toCsv(paymentsRes.data ?? []),
    "",
    `# Exported from Effora AI on ${new Date().toUTCString()}`,
  ].join("\n");

  return new NextResponse(sections, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${leadName}_export_${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
