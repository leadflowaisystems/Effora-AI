/**
 * POST /api/orgs/[orgId]/leads/[leadId]/revive
 * Triggers a ghost revival sequence for an inactive lead.
 * Creates a sequence_run row and emits lead.ghost_revival.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { inngest } from "@/lib/inngest/client";

interface Params { params: { orgId: string; leadId: string } }

export async function POST(_req: NextRequest, { params }: Params) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data: member } = await supabase
      .from("org_members").select("role")
      .eq("org_id", params.orgId).eq("user_id", user.id).single();
    if (!member) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const svc    = createServiceClient();
    const orgId  = params.orgId;
    const leadId = params.leadId;

    // Verify lead belongs to org
    const { data: lead } = await svc
      .from("leads").select("id, last_seen_at, stage")
      .eq("id", leadId).eq("org_id", orgId).single();

    if (!lead) return NextResponse.json({ error: "Lead not found" }, { status: 404 });

    const l = lead as { id: string; last_seen_at: string; stage: string };

    // Compute inactive days
    const lastSeenMs   = new Date(l.last_seen_at).getTime();
    const inactiveDays = Math.floor((Date.now() - lastSeenMs) / 86400000);

    // Find most recent conversation
    const { data: convRow } = await svc
      .from("conversations")
      .select("id")
      .eq("org_id", orgId)
      .eq("lead_id", leadId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const conversationId = (convRow as { id: string } | null)?.id ?? null;
    if (!conversationId) {
      return NextResponse.json(
        { error: "No conversation found for this lead — send a DM first." },
        { status: 422 }
      );
    }

    const now = new Date().toISOString();

    // Check for existing active revival
    const { data: existing } = await svc
      .from("sequence_runs")
      .select("id")
      .eq("org_id", orgId)
      .eq("lead_id", leadId)
      .eq("type", "ghost_revival")
      .eq("status", "active")
      .maybeSingle();

    if (existing) {
      return NextResponse.json(
        { error: "An active revival sequence already exists for this lead." },
        { status: 409 }
      );
    }

    // Create sequence_run
    const { data: run, error } = await svc.from("sequence_runs").insert({
      org_id:          orgId,
      lead_id:         leadId,
      conversation_id: conversationId,
      type:            "ghost_revival",
      status:          "active",
      step_current:    0,
      step_total:      3,
      metadata:        { inactive_days: inactiveDays },
      started_at:      now,
      updated_at:      now,
    }).select("id").single();

    if (error || !run) {
      return NextResponse.json({ error: error?.message ?? "Failed to create run" }, { status: 500 });
    }

    const sequenceRunId = (run as { id: string }).id;

    // Emit the event
    await inngest.send({
      name: "lead.ghost_revival",
      data: {
        orgId,
        leadId,
        conversationId,
        sequenceRunId,
        startedAt:    now,
        inactiveDays,
      },
    });

    return NextResponse.json({ ok: true, sequenceRunId });
  } catch (err) {
    console.error("[revive] unhandled error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    );
  }
}
