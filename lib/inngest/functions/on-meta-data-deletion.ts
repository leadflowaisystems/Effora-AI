/**
 * Inngest function: meta.data_deletion_requested
 *
 * Performs the ACTUAL deletion behind Meta's User Data Deletion Callback.
 *
 * The callback at app/api/meta/data-deletion/route.ts already verifies the
 * signed_request HMAC and records the request, but until now nothing consumed
 * those rows: every request sat at status "pending" forever and no user data
 * was ever removed. Meta's requirement is that the confirmation code resolve to
 * a real, completed deletion — so this function closes that loop.
 *
 * Matching: Meta sends a Meta-scoped user id. Instagram leads are stored with
 * external_id = "ig_<IGSID>", so we look for that form and the bare id. A
 * deletion request for a user we hold no data on is a legitimate no-op and is
 * still marked completed — "we deleted everything we had" is true when we had
 * nothing.
 *
 * NOTE: the cascade below intentionally mirrors
 * app/api/orgs/[orgId]/leads/[leadId]/route.ts rather than importing from it,
 * so this Part 2 work cannot alter the revenue-path code shipped in Part 1.
 * Consolidating the two is tracked in DEFERRED.md.
 */

import { inngest } from "../client";
import { createServiceClient } from "@/lib/supabase/server";

interface MetaDeletionData {
  confirmationCode: string;
  metaUserId:       string;
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
      const candidates = [`ig_${metaUserId}`, metaUserId];

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (svc as any)
        .from("leads")
        .select("id, org_id")
        .in("external_id", candidates)
        .is("deleted_at", null);

      return (data ?? []) as { id: string; org_id: string }[];
    });

    // ── 2. Cascade each match ────────────────────────────────────────────────
    const totals = { leads: 0, sequences: 0, conversations: 0, bookings: 0 };

    for (const lead of leads) {
      const result = await step.run(`delete-lead-${lead.id}`, async () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const svc = createServiceClient() as any;
        const now = new Date().toISOString();
        const counts = { sequences: 0, conversations: 0, bookings: 0 };

        // Sequences FIRST so no automated message escapes mid-cascade.
        const { data: stopped } = await svc.from("sequence_runs")
          .update({ status: "stopped", stopped_at: now, updated_at: now })
          .eq("org_id", lead.org_id).eq("lead_id", lead.id).eq("status", "active")
          .select("id");
        counts.sequences = (stopped ?? []).length;

        const { data: convs } = await svc.from("conversations")
          .update({ deleted_at: now })
          .eq("org_id", lead.org_id).eq("lead_id", lead.id).is("deleted_at", null)
          .select("id");
        counts.conversations = (convs ?? []).length;

        const { data: bookings } = await svc.from("bookings")
          .update({ deleted_at: now })
          .eq("org_id", lead.org_id).eq("lead_id", lead.id).is("deleted_at", null)
          .select("id");
        counts.bookings = (bookings ?? []).length;

        // Payments deliberately retained — payments.lead_id is NOT NULL with
        // ON DELETE CASCADE, so removing the lead row would destroy financial
        // records. The identity is erased instead; the amounts survive.
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
      });

      totals.leads      += 1;
      totals.sequences  += result.sequences;
      totals.conversations += result.conversations;
      totals.bookings   += result.bookings;
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

    console.log(
      `[meta-data-deletion] completed code=${confirmationCode} meta_user=${metaUserId} ` +
      `leads=${totals.leads} sequences_stopped=${totals.sequences} ` +
      `conversations=${totals.conversations} bookings=${totals.bookings}`,
    );

    return { confirmationCode, ...totals };
  },
);
