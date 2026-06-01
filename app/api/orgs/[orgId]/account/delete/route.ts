/**
 * POST /api/orgs/[orgId]/account/delete  — initiate 30-day soft-delete
 * DELETE /api/orgs/[orgId]/account/delete — cancel pending soft-delete
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit";
import { sendEmail } from "@/lib/email";

interface Params { params: { orgId: string } }

async function assertOwner(orgId: string) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.from("org_members").select("role")
    .eq("org_id", orgId).eq("user_id", user.id).single();
  if (!data || (data as { role: string }).role !== "owner") return null;
  return user;
}

// Initiate deletion (soft-delete, 30 days)
export async function POST(req: NextRequest, { params }: Params) {
  const user = await assertOwner(params.orgId);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const svc = createServiceClient();
  const scheduledAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (svc as any).from("orgs")
    .update({ scheduled_delete_at: scheduledAt })
    .eq("id", params.orgId);

  if (error) return NextResponse.json({ error: "Could not schedule deletion." }, { status: 500 });

  void logAudit(svc, params.orgId, user.id, "org.deletion_scheduled", {
    scheduled_delete_at: scheduledAt,
  });

  // Send confirmation email
  const email = user.email;
  if (email) {
    void sendEmail({
      to:       email,
      subject:  "Your Effora AI account is scheduled for deletion",
      template: "account_deletion",
      html: `
        <p>Hi,</p>
        <p>Your Effora AI account and all associated data have been scheduled for <strong>permanent deletion in 30 days</strong>.</p>
        <p>If this was a mistake, simply <a href="${process.env.NEXT_PUBLIC_APP_URL ?? "https://effora-ai-qh35.vercel.app"}/login">log back in</a> and cancel the deletion from Settings → Account.</p>
        <p>If you take no action, all your data will be permanently erased on <strong>${new Date(scheduledAt).toDateString()}</strong>.</p>
        <p>— Effora AI</p>
      `,
    });
  }

  return NextResponse.json({ ok: true, scheduled_delete_at: scheduledAt });
}

// Cancel pending deletion
export async function DELETE(req: NextRequest, { params }: Params) {
  const user = await assertOwner(params.orgId);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const svc = createServiceClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (svc as any).from("orgs")
    .update({ scheduled_delete_at: null })
    .eq("id", params.orgId);

  if (error) return NextResponse.json({ error: "Could not cancel deletion." }, { status: 500 });

  void logAudit(svc, params.orgId, user.id, "org.deletion_cancelled", {});

  return NextResponse.json({ ok: true });
}
