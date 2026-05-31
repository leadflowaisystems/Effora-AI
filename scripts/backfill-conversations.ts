/**
 * scripts/backfill-conversations.ts
 *
 * One-time backfill: creates a conversation row for every manual CRM lead
 * that doesn't already have one. Safe to run multiple times (idempotent).
 *
 * Usage:
 *   npx tsx scripts/backfill-conversations.ts
 *
 * Requires NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in env.
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

async function main() {
  console.log("Fetching manual CRM leads without conversations...");

  // Get all manual leads (source = 'manual') that have no conversation
  const { data: leads, error } = await supabase
    .from("leads")
    .select("id, org_id, name")
    .eq("source", "manual")
    .is("deleted_at", null);

  if (error) { console.error("Error fetching leads:", error.message); process.exit(1); }
  if (!leads?.length) { console.log("No manual leads found."); return; }

  console.log(`Found ${leads.length} manual leads. Checking for missing conversations...`);

  let created = 0;
  let skipped = 0;

  for (const lead of leads) {
    // Check if conversation already exists
    const { data: existing } = await supabase
      .from("conversations")
      .select("id")
      .eq("org_id", lead.org_id)
      .eq("lead_id", lead.id)
      .limit(1)
      .single();

    if (existing?.id) { skipped++; continue; }

    const now = new Date().toISOString();
    const { data: conv, error: convErr } = await supabase
      .from("conversations")
      .insert({
        org_id:               lead.org_id,
        lead_id:              lead.id,
        channel_provider:     "manual_crm",
        status:               "active",
        last_message_at:      now,
        last_message_preview: "",
      })
      .select("id")
      .single();

    if (convErr) {
      // Handle unique constraint violation (race or already exists)
      if ((convErr as { code?: string }).code === "23505") { skipped++; continue; }
      console.error(`  ✗ Failed to create conversation for lead ${lead.id}:`, convErr.message);
      continue;
    }

    // Insert a system outbound message so thread isn't empty
    if (conv?.id) {
      await supabase.from("messages").insert({
        conversation_id: conv.id,
        org_id:          lead.org_id,
        direction:       "outbound",
        content:         "Lead added via CRM.",
        sent_at:         now,
        metadata:        { source: "crm_backfill" },
      });
    }

    created++;
    console.log(`  ✓ Created conversation for: ${lead.name ?? "Unnamed"} (${lead.id})`);
  }

  console.log(`\nDone. Created: ${created}, Already existed: ${skipped}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
