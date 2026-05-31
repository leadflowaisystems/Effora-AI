\# Deferred Work



\## Next.js 14 → 15 upgrade

\- Date deferred: May 31, 2026

\- Reason: 7 framework-level vulns (DoS/SSRF/cache-poison) require Next.js 15+, 

&#x20; which is a breaking change (params are Promises, caching defaults inverted, 

&#x20; server actions behavior changed). Not actively exploitable against current 

&#x20; deployment given Vercel edge mitigations.

\- Trigger to do: any of the following

&#x20; - First paying customer asks about security posture in writing

&#x20; - Active exploitation reported in the wild for one of these CVEs

&#x20; - 6 months elapse (rotate on cadence regardless)

\- Estimated effort: 2-3 days including testing

\- Reference: npm audit output, May 31 2026



\## Other items shipped clean

\- RLS verified across all tables ✓

\- Plan gating server-side enforced ✓

\- Pagination on all big lists ✓

\- /admin/health + /admin/errors operational ✓

\- tsc + build clean ✓

