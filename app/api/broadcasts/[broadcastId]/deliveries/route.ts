/**
 * GET /api/broadcasts/[broadcastId]/deliveries
 * Returns delivery status for all recipients of a broadcast.
 * Auth: must be a member of the broadcast's org.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

interface Params { params: { broadcastId: string } }

export async function GET(_req: NextRequest, { params }: Params) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const svc = createServiceClient() as any;

  // Fetch broadcast to verify auth
  const { data: broadcast } = await svc.from("broadcasts").select("id, org_id")
    .eq("id", params.broadcastId).single();
  if (!broadcast) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Verify membership
  const { data: membership } = await supabase.from("org_members").select("role")
    .eq("org_id", broadcast.org_id).eq("user_id", user.id).single();
  if (!membership) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: deliveries, error } = await svc.from("broadcast_deliveries")
    .select("id, status, failed_reason, sent_at, lead:lead_id(id, name, external_id)")
    .eq("broadcast_id", params.broadcastId)
    .order("created_at", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ deliveries: deliveries ?? [] });
}
