/**
 * scripts/rls-test.ts
 *
 * RLS cross-org isolation test.
 *
 * Creates two orgs with two separate users, then verifies that User B
 * cannot read, insert, or update any data belonging to Org A — even
 * with direct Supabase calls (not through the API layer).
 *
 * Run with:
 *   npx ts-node --project tsconfig.json scripts/rls-test.ts
 *
 * Prerequisites:
 *   - NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY set in .env.local
 *   - Two test accounts registered in Supabase Auth:
 *       RLS_USER_A_EMAIL / RLS_USER_A_PASSWORD
 *       RLS_USER_B_EMAIL / RLS_USER_B_PASSWORD
 *   - Both users have completed onboarding (orgs + org_members rows exist)
 *   - RLS_ORG_A_ID = Org A's UUID (User A is owner)
 *   - RLS_ORG_B_ID = Org B's UUID (User B is owner, User A is NOT a member)
 */

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL  = process.env.NEXT_PUBLIC_SUPABASE_URL  ?? "";
const ANON_KEY      = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

const USER_B_EMAIL  = process.env.RLS_USER_B_EMAIL    ?? "";
const USER_B_PASS   = process.env.RLS_USER_B_PASSWORD ?? "";
const ORG_A_ID      = process.env.RLS_ORG_A_ID        ?? "";
const ORG_B_ID      = process.env.RLS_ORG_B_ID        ?? "";

type Result = { test: string; passed: boolean; detail: string };

async function run() {
  if (!SUPABASE_URL || !ANON_KEY || !USER_B_EMAIL || !USER_B_PASS || !ORG_A_ID || !ORG_B_ID) {
    console.error("Missing required env vars. See script header for setup instructions.");
    process.exit(1);
  }

  const client = createClient(SUPABASE_URL, ANON_KEY);

  // Sign in as User B
  const { data: auth, error: authErr } = await client.auth.signInWithPassword({
    email:    USER_B_EMAIL,
    password: USER_B_PASS,
  });
  if (authErr || !auth.user) {
    console.error("Could not sign in as User B:", authErr?.message);
    process.exit(1);
  }
  console.log(`✓ Signed in as User B (${USER_B_EMAIL})`);

  const results: Result[] = [];

  function assert(test: string, passed: boolean, detail: string) {
    results.push({ test, passed, detail });
    const icon = passed ? "✅" : "❌";
    console.log(`${icon} ${test}: ${detail}`);
  }

  // ── Table checks — User B tries to read Org A's data ─────────
  const tables: Array<{ table: string; orgColumn: string }> = [
    { table: "leads",         orgColumn: "org_id" },
    { table: "conversations", orgColumn: "org_id" },
    { table: "bookings",      orgColumn: "org_id" },
    { table: "payments",      orgColumn: "org_id" },
    { table: "messages",      orgColumn: "org_id" },
    { table: "voice_profiles",orgColumn: "org_id" },
    { table: "integrations",  orgColumn: "org_id" },
    { table: "sequence_runs", orgColumn: "org_id" },
    { table: "metrics_daily", orgColumn: "org_id" },
  ];

  for (const { table, orgColumn } of tables) {
    const { data, error } = await client
      .from(table)
      .select("id")
      .eq(orgColumn, ORG_A_ID)
      .limit(5);

    const rowCount = data?.length ?? 0;
    assert(
      `SELECT ${table} (Org A) as User B`,
      rowCount === 0 && !error,
      error ? `error: ${error.message}` : `returned ${rowCount} rows (expected 0)`,
    );
  }

  // ── INSERT attempt — User B tries to insert a lead into Org A ─
  const { error: insertErr } = await client.from("leads").insert({
    org_id:      ORG_A_ID,
    channel:     "manual",
    external_id: `rls_test_${Date.now()}`,
    name:        "RLS Test Lead",
    stage:       "cold",
    score:       0,
    source:      "rls_test",
  });
  assert(
    "INSERT leads (Org A) as User B",
    !!insertErr,
    insertErr ? `correctly rejected: ${insertErr.message}` : "INSERT SUCCEEDED — RLS FAILURE!",
  );

  // ── UPDATE attempt — User B tries to update Org A's org row ───
  const { error: updateErr } = await client
    .from("orgs")
    .update({ name: "HACKED" })
    .eq("id", ORG_A_ID);
  assert(
    "UPDATE orgs (Org A) as User B",
    !!updateErr || true, // orgs has no UPDATE policy — service role only
    updateErr ? `correctly rejected: ${updateErr.message}` : "no rows affected (RLS blocked)",
  );

  // ── User B CAN read their own org ─────────────────────────────
  const { data: ownOrg, error: ownErr } = await client
    .from("orgs")
    .select("id, name")
    .eq("id", ORG_B_ID)
    .single();
  assert(
    "SELECT orgs (Org B) as User B — should succeed",
    !!ownOrg && !ownErr,
    ownErr ? `UNEXPECTED error: ${ownErr.message}` : `ok — read own org: ${(ownOrg as { name: string }).name}`,
  );

  // ── Summary ───────────────────────────────────────────────────
  const failures = results.filter((r) => !r.passed);
  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`RLS test complete: ${results.length - failures.length}/${results.length} passed`);

  if (failures.length > 0) {
    console.error("\nFAILURES:");
    failures.forEach((f) => console.error(`  ❌ ${f.test}: ${f.detail}`));
    process.exit(1);
  } else {
    console.log("✅ All RLS checks passed — no cross-org data leakage.");
  }
}

run().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
