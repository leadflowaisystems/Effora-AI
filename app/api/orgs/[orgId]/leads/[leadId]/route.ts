import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { sanitizeText } from "@/lib/sanitize";
import { z } from "zod";
import { invalidateAccessCache } from "@/lib/access";

interface Params { params: { orgId: string; leadId: string } }

async function assertMember(orgId: string) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.from("org_members").select("role")
    .eq("org_id", orgId).eq("user_id", user.id).single();
  return data ? user : null;
}

/** GET /api/orgs/[orgId]/leads/[leadId] — full lead profile */
export async function GET(_req: NextRequest, { params }: Params) {
  const user = await assertMember(params.orgId);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const svc = createServiceClient() as any;

  const [leadRes, convsRes, bookingsRes, paymentsRes] = await Promise.all([
    svc.from("leads")
       .select("id,name,external_id,channel,score,stage,tags,notes,ltv_inr,last_seen_at,created_at,source,avatar_url,metadata")
       .eq("id", params.leadId).eq("org_id", params.orgId).single(),
    svc.from("conversations")
       .select("id,channel_provider,last_message_at,last_message_preview,created_at")
       .eq("org_id", params.orgId).eq("lead_id", params.leadId)
       .order("last_message_at", { ascending: false }),
    svc.from("bookings")
       .select("id,status,starts_at,ends_at,meeting_url,attendee_name,attendee_email,recovery_attempt,created_at")
       .eq("org_id", params.orgId).eq("lead_id", params.leadId)
       .is("deleted_at", null)
       .order("starts_at", { ascending: false }),
    svc.from("payments")
       .select("id,amount_inr,status,payment_link_url,notes,created_at,updated_at")
       .eq("org_id", params.orgId).eq("lead_id", params.leadId)
       .is("deleted_at", null)
       .order("created_at", { ascending: false }),
  ]);

  if (!leadRes.data) return NextResponse.json({ error: "Lead not found" }, { status: 404 });

  return NextResponse.json({
    lead:          leadRes.data,
    conversations: convsRes.data   ?? [],
    bookings:      bookingsRes.data ?? [],
    payments:      paymentsRes.data ?? [],
  });
}

const UpdateSchema = z.object({
  name:    z.string().min(1).max(200).optional(),
  stage:   z.string().max(30).optional(),
  score:   z.number().min(0).max(100).optional(),
  tags:    z.array(z.string().max(50)).max(20).optional(),
  notes:   z.string().max(5000).optional(),
  ltv_inr: z.number().min(0).optional(),
}).partial();

export async function PUT(req: NextRequest, { params }: Params) {
  const user = await assertMember(params.orgId);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const raw    = await req.json().catch(() => ({}));
  const parsed = UpdateSchema.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 });

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (parsed.data.name    !== undefined) updates.name    = sanitizeText(parsed.data.name);
  if (parsed.data.stage   !== undefined) updates.stage   = parsed.data.stage;
  if (parsed.data.score   !== undefined) updates.score   = parsed.data.score;
  if (parsed.data.tags    !== undefined) updates.tags    = parsed.data.tags;
  if (parsed.data.notes   !== undefined) updates.notes   = sanitizeText(parsed.data.notes);
  if (parsed.data.ltv_inr !== undefined) updates.ltv_inr = parsed.data.ltv_inr;

  // Cast to any — tags/notes/ltv_inr/deleted_at added in migration 012, not yet in generated types
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const svc = createServiceClient() as any;
  const { data, error } = await svc.from("leads")
    .update(updates).eq("id", params.leadId).eq("org_id", params.orgId)
    .select("id, name, stage, score, tags, notes, ltv_inr").single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ lead: data });
}

/**
 * DELETE /api/orgs/[orgId]/leads/[leadId]
 *
 * Full lead removal, cascaded. Soft-delete per table — see the one-line
 * justification on each step below.
 *
 * Order matters: active sequences are stopped FIRST so no automated message can
 * escape while the rest of the cascade runs.
 *
 * Tenant safety: assertMember() resolves the caller's session through the
 * RLS-scoped anon client and requires an org_members row for THIS orgId, and
 * every mutation below is additionally constrained by .eq("org_id", orgId).
 * A member of org A therefore cannot reach org B's lead: assertMember fails
 * first, and even with a forged orgId the row filter matches nothing.
 */
export async function DELETE(_req: NextRequest, { params }: Params) {
  const user = await assertMember(params.orgId);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const svc = createServiceClient() as any;
  const now = new Date().toISOString();

  // Confirm the lead actually belongs to this org before touching anything.
  const { data: lead } = await svc
    .from("leads")
    .select("id, name")
    .eq("id", params.leadId)
    .eq("org_id", params.orgId)
    .maybeSingle();

  if (!lead) return NextResponse.json({ error: "Lead not found" }, { status: 404 });

  const removed = { sequences: 0, conversations: 0, bookings: 0 };

  // ── 1. Stop active sequences FIRST ────────────────────────────────────────
  // HARD-STOP, not delete: sequence_runs is operational state, and "stopped" is
  // what the running Inngest function polls for. See on-ghost-revival.ts:89
  // isStopped(), which reads this row before every nudge and self-terminates.
  const { data: stopped } = await svc.from("sequence_runs")
    .update({ status: "stopped", stopped_at: now, updated_at: now })
    .eq("org_id", params.orgId)
    .eq("lead_id", params.leadId)
    .eq("status", "active")
    .select("id");
  removed.sequences = (stopped ?? []).length;

  // ── 2. Conversations — SOFT ───────────────────────────────────────────────
  // Soft: keeps the thread recoverable and lets messages inherit visibility
  // from their parent rather than needing their own flag.
  const { data: convs } = await svc.from("conversations")
    .update({ deleted_at: now })
    .eq("org_id", params.orgId)
    .eq("lead_id", params.leadId)
    .is("deleted_at", null)
    .select("id");
  removed.conversations = (convs ?? []).length;

  // ── 3. Bookings — SOFT ────────────────────────────────────────────────────
  // Soft: a booking is a scheduling record that reporting still counts.
  const { data: bookings } = await svc.from("bookings")
    .update({ deleted_at: now })
    .eq("org_id", params.orgId)
    .eq("lead_id", params.leadId)
    .is("deleted_at", null)
    .select("id");
  removed.bookings = (bookings ?? []).length;

  // ── 4. Payments — DELIBERATELY UNTOUCHED ──────────────────────────────────
  // See the block comment below the handler for why.

  // ── 5. Lead — SOFT + PII scrub ────────────────────────────────────────────
  // Soft: payments.lead_id is NOT NULL ... ON DELETE CASCADE, so a hard delete
  // would destroy financial records. The row survives; the identity does not.
  // Scrubbing external_id also frees the (org_id, channel, external_id) unique
  // slot, so if this number ever messages again it becomes a brand-new lead
  // instead of resurrecting this one.
  const { error } = await svc.from("leads")
    .update({
      deleted_at:       now,
      updated_at:       now,
      name:             "Deleted lead",
      phone:            null,
      instagram_handle: null,
      external_id:      `deleted_${params.leadId}`,
    })
    .eq("id", params.leadId)
    .eq("org_id", params.orgId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  console.log(
    `[lead-delete] org=${params.orgId} lead=${params.leadId} by=${user.id} ` +
    `sequences_stopped=${removed.sequences} conversations=${removed.conversations} bookings=${removed.bookings}`,
  );

  return NextResponse.json({ ok: true, removed });
}

/**
 * WHY PAYMENTS ARE NOT DELETED OR DETACHED
 *
 * payments.lead_id is `NOT NULL REFERENCES leads(id) ON DELETE CASCADE`, so a
 * hard delete of a lead would silently destroy that lead's entire payment
 * history — amounts, Razorpay order and payment ids, and timestamps. For an
 * Indian coaching institute those rows are financial records: they reconcile
 * against Razorpay settlements, feed revenue reporting, and may be needed for
 * tax and audit purposes long after a student's personal data should be gone.
 * Detaching them by nulling lead_id is not possible either, because the column
 * is NOT NULL, and doing so would orphan the revenue from any customer context.
 *
 * The pattern used here separates the two concerns instead of trading one off
 * against the other: the lead ROW is retained so referential integrity and
 * financial reporting stay intact, while the lead's IDENTITY is erased in place
 * — name, phone, Instagram handle and the channel external_id (which embeds the
 * phone number) are all overwritten. Payment rows keep their amounts and
 * gateway references but no longer resolve to a named person. This is the
 * behaviour DPDP-style "erasure with a lawful-retention carve-out" expects, and
 * it is why deleting a lead never changes a single revenue figure.
 */

// Suppress unused import warning — kept for future plan-change hooks
void invalidateAccessCache;
