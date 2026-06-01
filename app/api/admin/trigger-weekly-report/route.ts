/**
 * POST /api/admin/trigger-weekly-report
 * Manually triggers the weekly report Inngest function for testing.
 * Admin-only.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { inngest } from "@/lib/inngest/client";

export async function POST(_req: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const adminEmails = (process.env.ADMIN_EMAILS ?? "").split(",").map((e) => e.trim());
  if (!adminEmails.includes(user.email ?? "")) {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  await inngest.send({ name: "test/weekly-report.trigger", data: { triggeredBy: user.email } });
  return NextResponse.json({ ok: true, message: "Weekly report triggered. Check your inbox in ~30s." });
}
