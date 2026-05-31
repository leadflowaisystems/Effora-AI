/**
 * Applies the Phase 0 schema migration to your Supabase project.
 * Uses the service role key so no DB password needed.
 *
 * Run: tsx scripts/apply-migration.ts
 *
 * This script is idempotent — safe to run multiple times.
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { join } from "path";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

// Extract project ref from URL
const projectRef = new URL(SUPABASE_URL).hostname.split(".")[0];
console.log(`\nApplying migration to project: ${projectRef}\n`);

async function applyMigration() {
  const migrationPath = join(process.cwd(), "supabase", "migrations", "001_initial_schema.sql");
  const sql = readFileSync(migrationPath, "utf-8");

  // Supabase Management API: POST /v1/projects/{ref}/database/query
  const managementUrl = `https://api.supabase.com/v1/projects/${projectRef}/database/query`;

  // We use the service role for the REST API to run a simple check first
  const service = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Check if tables already exist
  const { data: existing, error: checkErr } = await service
    .from("orgs")
    .select("id")
    .limit(1);

  if (!checkErr) {
    console.log("✓ Tables already exist — migration already applied.");
    console.log("  If you want to re-apply, drop the tables first.\n");
    process.exit(0);
  }

  // PGRST205 = table not in PostgREST schema cache (doesn't exist)
  // 42P01 = relation does not exist (direct PG error)
  if (checkErr.code !== "42P01" && checkErr.code !== "PGRST205") {
    console.error("Unexpected error checking for tables:", checkErr);
    process.exit(1);
  }

  console.log("Tables not found — applying migration...\n");

  // Try to apply via Management API (requires a Supabase access token, not service role)
  // If you have a Supabase access token, set SUPABASE_ACCESS_TOKEN in .env.local
  const accessToken = process.env.SUPABASE_ACCESS_TOKEN;

  if (accessToken) {
    const res = await fetch(managementUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query: sql }),
    });

    if (res.ok) {
      const result = await res.json();
      console.log("✅ Migration applied successfully via Management API!\n");
      console.log(JSON.stringify(result, null, 2));
      return;
    } else {
      const err = await res.text();
      console.error("Management API error:", err);
    }
  } else {
    console.log("ℹ  SUPABASE_ACCESS_TOKEN not set.");
    console.log("   To auto-apply: add SUPABASE_ACCESS_TOKEN to .env.local");
    console.log("   Get it from: https://supabase.com/dashboard/account/tokens\n");
  }

  // Fallback: print the SQL for manual application
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("MANUAL STEP REQUIRED");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("1. Open: https://supabase.com/dashboard/project/" + projectRef + "/sql/new");
  console.log("2. Paste and run the SQL from: supabase/migrations/001_initial_schema.sql");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
}

applyMigration().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
