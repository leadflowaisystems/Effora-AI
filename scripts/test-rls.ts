/**
 * RLS isolation test — proves cross-org data leakage is impossible.
 *
 * Run: npm run test:rls
 *
 * What it does:
 *  1. Creates two users (A and B) via the admin API
 *  2. Creates two orgs, assigns A→Org A and B→Org B
 *  3. Inserts a lead in Org A (via service role)
 *  4. Signs in as User B and tries to read Org A's data
 *  5. Asserts User B sees nothing from Org A
 *  6. Cleans up all test data
 */

// Load .env.local before anything else
import { config } from "dotenv";
config({ path: ".env.local" });

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!SUPABASE_URL || !ANON_KEY || !SERVICE_KEY) {
  console.error("Missing Supabase env vars. Ensure .env.local is loaded.");
  process.exit(1);
}

const service = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

let cleanupOrgIds: string[] = [];
let cleanupUserIds: string[] = [];

async function main() {
  console.log("🔐 Effora AI RLS isolation test\n");

  const ts = Date.now();
  // example.com is reserved for testing by RFC 2606. The previous domain was
  // "Effora AI.test" — a CoachOS → Effora AI rename turned "coachos.test" into
  // a value containing a space, which Supabase rejects with
  // "Unable to validate email address: invalid format". That failure happened
  // before the first assertion ran, so this suite had been silently
  // non-functional since the rename.
  const emailA = `rls-a-${ts}@example.com`;
  const emailB = `rls-b-${ts}@example.com`;
  const password = "TestPassword123!";

  // ── 1. Create test users ──────────────────────────────────
  console.log("Creating test users...");
  const { data: { user: userA }, error: errA } = await service.auth.admin.createUser({
    email: emailA,
    password,
    email_confirm: true,
  });
  const { data: { user: userB }, error: errB } = await service.auth.admin.createUser({
    email: emailB,
    password,
    email_confirm: true,
  });

  if (errA || !userA) bail("Failed to create User A", errA);
  if (errB || !userB) bail("Failed to create User B", errB);

  cleanupUserIds = [userA!.id, userB!.id];
  console.log(`  ✓ User A: ${emailA}`);
  console.log(`  ✓ User B: ${emailB}`);

  // ── 2. Create orgs ────────────────────────────────────────
  console.log("\nCreating orgs...");
  const { data: orgA, error: eOA } = await service
    .from("orgs")
    .insert({ slug: `test-org-a-${ts}`, name: "Test Org A" })
    .select()
    .single();
  const { data: orgB, error: eOB } = await service
    .from("orgs")
    .insert({ slug: `test-org-b-${ts}`, name: "Test Org B" })
    .select()
    .single();

  if (eOA || !orgA) bail("Failed to create Org A", eOA);
  if (eOB || !orgB) bail("Failed to create Org B", eOB);

  cleanupOrgIds = [orgA!.id, orgB!.id];
  console.log(`  ✓ Org A: ${orgA!.id}`);
  console.log(`  ✓ Org B: ${orgB!.id}`);

  // ── 3. Assign memberships (owner) ────────────────────────
  console.log("\nAssigning memberships...");
  const { error: eMem } = await service.from("org_members").insert([
    { org_id: orgA!.id, user_id: userA!.id, role: "owner" },
    { org_id: orgB!.id, user_id: userB!.id, role: "owner" },
  ]);
  if (eMem) bail("Failed to insert memberships", eMem);
  console.log("  ✓ User A owns Org A, User B owns Org B");

  // ── 4. Insert secret data in Org A ───────────────────────
  console.log("\nInserting secret lead in Org A...");
  const { data: lead, error: eLead } = await service
    .from("leads")
    .insert({ org_id: orgA!.id, name: "Secret Lead", source: "rls-test" })
    .select()
    .single();
  if (eLead || !lead) bail("Failed to insert test lead", eLead);
  console.log(`  ✓ Lead ${lead!.id} in Org A`);

  // ── 5. Sign in as User B ──────────────────────────────────
  console.log("\nSigning in as User B...");
  const clientB = createClient(SUPABASE_URL, ANON_KEY);
  const { data: { session }, error: eSign } = await clientB.auth.signInWithPassword({
    email: emailB,
    password,
  });
  if (eSign || !session) bail("Failed to sign in as User B", eSign);
  console.log("  ✓ Signed in");

  // ── 6. Try to read Org A data as User B ───────────────────
  console.log("\nVerifying RLS isolation...");

  // Leads
  const { data: stolenLeads } = await clientB
    .from("leads")
    .select("*")
    .eq("org_id", orgA!.id);

  const leadsIsolated = !stolenLeads || stolenLeads.length === 0;
  console.log(
    leadsIsolated
      ? "  ✅ PASS: User B cannot read Org A leads"
      : `  ❌ FAIL: User B read ${stolenLeads?.length} leads from Org A!`
  );

  // Orgs
  const { data: stolenOrg } = await clientB
    .from("orgs")
    .select("*")
    .eq("id", orgA!.id);

  const orgIsolated = !stolenOrg || stolenOrg.length === 0;
  console.log(
    orgIsolated
      ? "  ✅ PASS: User B cannot read Org A row"
      : `  ❌ FAIL: User B read Org A! org: ${JSON.stringify(stolenOrg)}`
  );

  // Verify User B CAN see their own org
  const { data: ownOrg } = await clientB
    .from("orgs")
    .select("*")
    .eq("id", orgB!.id);
  console.log(
    `  ✓ User B can see own org (${ownOrg?.length ?? 0} rows — expected 1)`
  );

  await cleanup();

  if (!leadsIsolated || !orgIsolated) {
    console.error("\n🔴 RLS TEST FAILED — cross-org data leaked!");
    process.exit(1);
  }

  console.log("\n🟢 All RLS isolation tests passed — no cross-org leakage.");
}

async function cleanup() {
  console.log("\nCleaning up test data...");
  if (cleanupOrgIds.length > 0) {
    await service.from("orgs").delete().in("id", cleanupOrgIds);
  }
  for (const uid of cleanupUserIds) {
    await service.auth.admin.deleteUser(uid);
  }
  console.log("  ✓ Cleaned up");
}

function bail(msg: string, err: unknown): never {
  console.error(`\n❌ ${msg}`, err);
  cleanup().finally(() => process.exit(1));
  throw new Error(msg);
}

main().catch(async (err) => {
  console.error("Unexpected error:", err);
  await cleanup();
  process.exit(1);
});
