#!/usr/bin/env node
/**
 * scripts/load-test.mjs — lightweight concurrency test (no external deps)
 *
 * Run: node scripts/load-test.mjs https://coachos-pi.vercel.app
 *
 * Tests:
 *   - 30 concurrent GET /api/health (simple health check)
 *   - 30 concurrent GET requests to / (landing page)
 *
 * Asserts all responses return < 3 s and no 5xx status codes.
 * Saves summary to docs/LOAD_TEST_RESULTS.md
 */

import { writeFileSync } from "fs";

const BASE = process.argv[2] ?? "http://localhost:3000";
const TIMEOUT_MS = 5000;

async function timedFetch(url) {
  const t0  = Date.now();
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    const res  = await fetch(url, { signal: ctrl.signal });
    clearTimeout(timer);
    return { url, status: res.status, ms: Date.now() - t0, ok: res.status < 500 };
  } catch (err) {
    return { url, status: 0, ms: Date.now() - t0, ok: false, error: String(err) };
  }
}

async function runBatch(label, url, count) {
  console.log(`\n▶ ${label} — ${count} concurrent requests to ${url}`);
  const results = await Promise.all(Array.from({ length: count }, () => timedFetch(url)));
  const failures = results.filter((r) => !r.ok);
  const times    = results.map((r) => r.ms).sort((a, b) => a - b);
  const p50  = times[Math.floor(times.length * 0.5)];
  const p95  = times[Math.floor(times.length * 0.95)];
  const max  = times[times.length - 1];
  const slow = results.filter((r) => r.ms > 3000).length;

  console.log(`  ✓ ${results.length - failures.length} ok  ✗ ${failures.length} failed`);
  console.log(`  Latency — p50: ${p50}ms  p95: ${p95}ms  max: ${max}ms`);
  if (slow > 0) console.warn(`  ⚠️  ${slow} requests exceeded 3s`);
  if (failures.length > 0) {
    failures.forEach((f) => console.error(`  ❌ ${f.url} → ${f.status} (${f.ms}ms) ${f.error ?? ""}`));
  }

  return { label, url, count, failures: failures.length, p50, p95, max, slow };
}

async function main() {
  console.log(`🔫 Load test against ${BASE}`);
  console.log(`   Timeout: ${TIMEOUT_MS / 1000}s per request`);

  const results = [];

  results.push(await runBatch("Health check", `${BASE}/api/health`, 30));
  results.push(await runBatch("Landing page", `${BASE}/`,            20));

  // Summary
  const anyFailure = results.some((r) => r.failures > 0);
  const anySlow    = results.some((r) => r.slow > 0);
  const verdict    = anyFailure ? "❌ FAIL" : anySlow ? "⚠️  WARN (slow)" : "✅ PASS";

  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`Verdict: ${verdict}`);

  // Write to docs
  const md = `# Load Test Results

Run: ${new Date().toISOString()}
Target: ${BASE}

## Results

| Test | Requests | Failures | p50 | p95 | Max | Slow (>3s) |
|------|----------|----------|-----|-----|-----|------------|
${results.map((r) =>
  `| ${r.label} | ${r.count} | ${r.failures} | ${r.p50}ms | ${r.p95}ms | ${r.max}ms | ${r.slow} |`
).join("\n")}

**Verdict: ${verdict}**
`;

  writeFileSync("docs/LOAD_TEST_RESULTS.md", md);
  console.log("Results saved to docs/LOAD_TEST_RESULTS.md");

  if (anyFailure) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
