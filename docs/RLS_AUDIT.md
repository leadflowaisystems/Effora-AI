# RLS Audit — CoachOS

Audited: 2026-05-30  
Auditor: production hardening pass

## Summary

Every table in the `public` schema has RLS enabled. All org-scoped tables use
the `is_org_member(org_id)` predicate which calls `auth.uid()` through a
`SECURITY DEFINER` helper function, preventing row-level injection.

No data leakage vector was found through the Supabase client. Service role
is used exclusively in server-side API routes and Inngest functions — never
exposed to the browser.

---

## Table Status

| Table             | RLS Enabled | Policy Predicate                      | Notes |
|-------------------|-------------|---------------------------------------|-------|
| `orgs`            | ✅          | `is_org_member(id)` — SELECT only     | Writes via service role only |
| `org_members`     | ✅          | SELECT: member · INSERT/DELETE: owner | Prevents member self-promotion |
| `integrations`    | ✅          | `is_org_member(org_id)` — FOR ALL     | Secret fields encrypted before storage |
| `leads`           | ✅          | `is_org_member(org_id)` — FOR ALL     | |
| `conversations`   | ✅          | `is_org_member(org_id)` — FOR ALL     | |
| `messages`        | ✅          | `is_org_member(org_id)` — FOR ALL     | migration 003 |
| `ai_drafts`       | ✅          | `is_org_member(org_id)` — FOR ALL     | migration 003 |
| `bookings`        | ✅          | `is_org_member(org_id)` — FOR ALL     | migration 004 |
| `payments`        | ✅          | `is_org_member(org_id)` — FOR ALL     | migration 005 |
| `sequence_runs`   | ✅          | `is_org_member(org_id)` — FOR ALL     | migration 005 |
| `voice_profiles`  | ✅          | `is_org_member(org_id)` — FOR ALL     | migration 002 |
| `ai_usage`        | ✅          | `is_org_member(org_id)` — FOR ALL     | migration 003 |
| `metrics_daily`   | ✅          | `is_org_member(org_id)` — SELECT      | migration 006 (write via service) |
| `sequences`       | ✅          | `is_org_member(org_id)` — FOR ALL     | migration 001 |
| `events`          | ✅          | `is_org_member(org_id)` — FOR ALL     | migration 001 |
| `user_flags`      | ✅          | `user_id = auth.uid()` — FOR ALL      | Self-only (no org_id) |
| `waitlist`        | ✅          | `false` (deny all)                    | Service role only; anon route uses service client |
| `audit_log`       | ✅          | `is_org_owner(org_id)` — SELECT       | Write via service role; owners can read own org log |
| `error_log`       | ✅          | `false` (deny all)                    | Service role only; admin reads via service client |

---

## Helper Functions

Both helpers are `SECURITY DEFINER` with `SET search_path = public`:

- `is_org_member(check_org_id UUID) → BOOLEAN`  
  Returns true if `auth.uid()` has a row in `org_members` for that org.

- `is_org_owner(check_org_id UUID) → BOOLEAN`  
  Same, but additionally requires `role = 'owner'`.

These functions are the single source of truth for access control and cannot
be spoofed from the client.

---

## API-layer Defence-in-Depth

RLS is the last line of defence. API routes also verify membership explicitly:

```typescript
// Pattern used by every org-scoped API route
async function assertMember(orgId: string) {
  const supabase = createClient(); // user's JWT
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase
    .from("org_members").select("role")
    .eq("org_id", orgId).eq("user_id", user.id).single();
  return data ? user : null;
}
```

Routes that operate on org data reject requests with 401 if `assertMember`
returns null, before any database queries are executed.

---

## Dev-only Routes

The following routes return **404** (not 403) in production to avoid
revealing their existence:

- `POST /api/orgs/[orgId]/bookings/simulate`
- `POST /api/orgs/[orgId]/payments/simulate`
- `POST /api/orgs/[orgId]/dashboard/seed`

---

## Cross-Org Test Script

`scripts/rls-test.ts` automates verification. Run it with two test accounts:

```bash
RLS_USER_B_EMAIL=user-b@example.com \
RLS_USER_B_PASSWORD=xxx \
RLS_ORG_A_ID=<uuid> \
RLS_ORG_B_ID=<uuid> \
npx ts-node scripts/rls-test.ts
```

Expected output: all 11+ checks green, zero rows returned for cross-org
SELECT attempts, INSERT/UPDATE attempts rejected by RLS.
