/**
 * POST /api/orgs/[orgId]/push-subscribe
 * Stores a Web Push subscription for the authenticated user.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { z } from "zod";

interface Params { params: { orgId: string } }

const Schema = z.object({
  endpoint: z.string().url(),
  p256dh:   z.string().min(1),
  auth:     z.string().min(1),
});

export async function POST(req: NextRequest, { params }: Params) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: membership } = await supabase
    .from("org_members").select("role")
    .eq("org_id", params.orgId).eq("user_id", user.id).single();
  if (!membership) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const raw    = await req.json().catch(() => ({}));
  const parsed = Schema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid" }, { status: 400 });
  }

  // user_push_subscriptions added in migration 011 — cast to bypass stale types
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const svc = createServiceClient() as any;
  const { error } = await svc.from("user_push_subscriptions").upsert({
    user_id:  user.id,
    org_id:   params.orgId,
    endpoint: parsed.data.endpoint,
    p256dh:   parsed.data.p256dh,
    auth:     parsed.data.auth,
    updated_at: new Date().toISOString(),
  }, { onConflict: "endpoint" });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
