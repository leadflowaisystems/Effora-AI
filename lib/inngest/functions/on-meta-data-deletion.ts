/**
 * Inngest function: meta.data_deletion_requested
 *
 * Performs the ACTUAL erasure behind Meta's User Data Deletion Callback.
 *
 * The callback at app/api/meta/data-deletion/route.ts verifies the
 * signed_request HMAC and records the request; this function is what makes the
 * confirmation code resolve to a real, completed deletion.
 *
 * ── Matching ────────────────────────────────────────────────────────────────
 * Meta sends a Meta-scoped user id. Instagram leads are stored with
 * external_id = "ig_<IGSID>", so both that form and the bare id are matched. A
 * request for a user we hold no data on is a legitimate no-op and is still
 * marked completed — "we deleted everything we had" is true when we had
 * nothing.
 *
 * ── Multi-tenant scoping ────────────────────────────────────────────────────
 * The same person may be a lead at several institutes. Each matching lead is
 * therefore handled INDEPENDENTLY, inside its own org: conversation ids are
 * resolved per (org_id, lead_id) and every mutation carries org_id explicitly.
 * There is no global delete keyed on the Meta user id alone.
 *
 * ── What is erased vs retained ──────────────────────────────────────────────
 *   messages       HARD DELETED — the table has no deleted_at column, and the
 *                  message bodies are the sensitive Instagram DM content that
 *                  Meta expects to be gone. Scoped by org_id AND the specific
 *                  conversation ids belonging to this lead.
 *   conversations  soft-deleted (deleted_at)
 *   bookings       soft-deleted (deleted_at)
 *   sequence_runs  active runs stopped first, so nothing escapes mid-cascade
 *   leads          anonymised in place, not removed
 *   payments       RETAINED. payments.lead_id is NOT NULL, so deleting the lead
 *                  row would destroy financial records. The identity is erased;
 *                  the amounts survive.
 *
 * ── Idempotency ─────────────────────────────────────────────────────────────
 * Every write is guarded, and the lead's external_id is rewritten to
 * "deleted_<id>" at the end, so a second request for the same Meta user matches
 * nothing and completes as a no-op. Within a run, step.run memoises each step
 * across retries. Conversation ids are resolved WITHOUT a deleted_at filter so
 * that a run which soft-deleted conversations but crashed before removing their
 * messages still finds them on resume.
 */

import { inngest } from "../client";
import { createServiceClient } from "@/lib/supabase/server";

interface MetaDeletionData {
  confirmationCode: string;
  metaUserId:       string;
}

export interface CascadeCounts {
  sequences:     number;
  conversations: number;
  bookings:      number;
  messages:      number;
}

/**
 * Erase one lead's data inside ONE org. Exported so the cascade — the only part
 * of this file that destroys anything — can be exercised directly by
 * scripts/test-meta-data-deletion.ts against scratch orgs, without an Inngest
 * dev server standing in the way of testing it.
 *
 * Every statement carries org_id. `lead` must already have been resolved from
 * the leads table, so its org_id is authoritative rather than caller-supplied.
 */
export async function cascadeDeleteLead(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  svc: any,
  lead: { id: string; org_id: string },
): Promise<CascadeCounts> {
  const now = new Date().toISOString();
  const counts: CascadeCounts = { sequences: 0, conversations: 0, bookings: 0, messages: 0 };

  // (a) Sequences FIRST so no automated message escapes mid-cascade.
  const { data: stopped } = await svc.from("sequence_runs")
    .update({ status: "stopped", stopped_at: now, updated_at: now })
    .eq("org_id", lead.org_id).eq("lead_id", lead.id).eq("status", "active")
    .select("id");
  counts.sequences = (stopped ?? []).length;

  // (b) Resolve this lead's conversations WITHIN THIS ORG.
  //     Deliberately no deleted_at filter: a previous partial run may have
  //     soft-deleted them before their messages were removed, and those
  //     messages must still be erased on resume.
  const { data: convRows } = await svc.from("conversations")
    .select("id")
    .eq("org_id", lead.org_id).eq("lead_id", lead.id);
  const convIds = ((convRows ?? []) as { id: string }[]).map((c) => c.id);

  // (c) HARD DELETE the messages of exactly those conversations. Scoped by
  //     org_id AND the explicit conversation id list, so no other tenant's or
  //     lead's messages can be reached. Skipped when the lead has no
  //     conversation, because .in() on an empty list is not a meaningful filter.
  if (convIds.length > 0) {
    const { data: delMsgs } = await svc.from("messages")
      .delete()
      .eq("org_id", lead.org_id)
      .in("conversation_id", convIds)
      .select("id");
    counts.messages = (delMsgs ?? []).length;
  }

  // (d) Soft-delete the conversations themselves.
  const { data: convs } = await svc.from("conversations")
    .update({ deleted_at: now })
    .eq("org_id", lead.org_id).eq("lead_id", lead.id).is("deleted_at", null)
    .select("id");
  counts.conversations = (convs ?? []).length;

  // (e) Soft-delete this lead's bookings in this org.
  const { data: bookings } = await svc.from("bookings")
    .update({ deleted_at: now })
    .eq("org_id", lead.org_id).eq("lead_id", lead.id).is("deleted_at", null)
    .select("id");
  counts.bookings = (bookings ?? []).length;

  // (f) Anonymise the lead LAST. Rewriting external_id is what makes a repeat
  //     request a no-op, so it must not happen before the rest.
  await svc.from("leads")
    .update({
      deleted_at:       now,
      updated_at:       now,
      name:             "Deleted lead",
      phone:            null,
      instagram_handle: null,
      external_id:      `deleted_${lead.id}`,
    })
    .eq("id", lead.id).eq("org_id", lead.org_id);

  return counts;
}

/** Leads across all orgs whose external_id maps to this Meta-scoped user id. */
export async function findLeadsForMetaUser(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  svc: any,
  metaUserId: string,
): Promise<{ id: string; org_id: string }[]> {
  const { data } = await svc
    .from("leads")
    .select("id, org_id")
    .in("external_id", [`ig_${metaUserId}`, metaUserId])
    .is("deleted_at", null);
  return (data ?? []) as { id: string; org_id: string }[];
}

export const onMetaDataDeletion = inngest.createFunction(
  {
    id:      "on-meta-data-deletion",
    name:    "Meta: process user data deletion request",
    retries: 2,
  },
  { event: "meta.data_deletion_requested" },
  async ({ event, step }) => {
    const { confirmationCode, metaUserId } = event.data as MetaDeletionData;

    // ── 1. Find every lead across every org that maps to this Meta user ──────
    const leads = await step.run("find-matching-leads", async () => {
      const svc = createServiceClient();
      return findLeadsForMetaUser(svc, metaUserId);
    });

    // ── 2. Cascade each match, strictly inside its own org ───────────────────
    const totals = { leads: 0, sequences: 0, conversations: 0, bookings: 0, messages: 0 };

    for (const lead of leads) {
      const result = await step.run(`delete-lead-${lead.id}`, async () => {
        const svc = createServiceClient();
        return cascadeDeleteLead(svc, lead);
      });

      totals.leads         += 1;
      totals.sequences     += result.sequences;
      totals.conversations += result.conversations;
      totals.bookings      += result.bookings;
      totals.messages      += result.messages;
    }

    // ── 3. Mark the request completed so the status URL reflects reality ─────
    await step.run("mark-completed", async () => {
      const svc = createServiceClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (svc as any).from("meta_data_deletion_requests")
        .update({ status: "completed", completed_at: new Date().toISOString() })
        .eq("confirmation_code", confirmationCode);
      return { done: true };
    });

    // Counts only — no lead name, handle, message body or Meta user id.
    console.log(
      `[meta-data-deletion] completed code=${confirmationCode} ` +
      `leads=${totals.leads} sequences_stopped=${totals.sequences} ` +
      `conversations=${totals.conversations} bookings=${totals.bookings} ` +
      `messages_deleted=${totals.messages}`,
    );

    return { confirmationCode, ...totals };
  },
);
