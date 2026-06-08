/**
 * lib/founder.ts
 *
 * Founder account detection.
 * Source of truth: FOUNDER_EMAILS env var (comma-separated).
 * The founder_accounts DB table (migration 034) is the audit record;
 * this module is the fast runtime check.
 *
 * Usage:
 *   import { isFounder } from "@/lib/founder";
 *   if (isFounder(user.email)) { ... }
 */

export function isFounder(email: string | null | undefined): boolean {
  if (!email) return false;
  const founders = (process.env.FOUNDER_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return founders.includes(email.toLowerCase());
}
