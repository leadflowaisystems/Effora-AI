# CoachOS Load Test Results

**Last run:** Pending production deploy.

## How to Run

```bash
node scripts/load-test.mjs --target=https://coachos-pi.vercel.app
```

## Target SLAs

| Endpoint                        | p95 target |
|---------------------------------|-----------|
| `GET /org/*/dashboard`          | < 3 s     |
| `POST /api/orgs/*/inbox/send`   | < 2 s     |
| `POST /api/orgs/*/process-screenshot` | < 15 s |
| `POST /api/funnel/*/submit`     | < 1 s     |

5xx error rate: 0% under 50 concurrent users.

## Last Results

| Endpoint | p50 | p95 | p99 | Errors |
|----------|-----|-----|-----|--------|
| (pending) | — | — | — | — |

Run load test after first production deploy and fill in results above.
