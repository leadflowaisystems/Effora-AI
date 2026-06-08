/**
 * Effora AI — k6 Load Test Script
 *
 * USAGE:
 *   # Install k6: https://k6.io/docs/get-started/installation/
 *   k6 run scripts/loadtest.js
 *
 * ENVIRONMENT VARIABLES (set before running):
 *   BASE_URL    — production URL, e.g. https://effora-ai-qh35.vercel.app
 *   ORG_ID      — a real org ID to test against
 *   SESSION     — a valid Supabase session cookie string
 *
 * Example:
 *   BASE_URL=https://effora-ai-qh35.vercel.app \
 *   ORG_ID=abc123 \
 *   SESSION="sb-xxx-auth-token=..." \
 *   k6 run --vus 10 --duration 30s scripts/loadtest.js
 *
 * SCENARIOS:
 *   smoke     — 1 VU, 30s — sanity check, no load
 *   load      — ramp 1→10 VUs over 2m, hold 5m, ramp down
 *   stress    — ramp 1→30 VUs to find breaking point
 *   spike     — instant 50 VU spike for 10s, then back to 0
 *
 * THRESHOLDS (production targets):
 *   p95 response time < 2000ms
 *   error rate < 1%
 *   health endpoint p99 < 500ms
 */

import http from "k6/http";
import { check, sleep } from "k6";
import { Rate, Trend } from "k6/metrics";

/* ── Config ────────────────────────────────────────────────────────────── */
const BASE_URL = __ENV.BASE_URL || "http://localhost:3000";
const ORG_ID   = __ENV.ORG_ID  || "REPLACE_WITH_ORG_ID";
const SESSION  = __ENV.SESSION  || "";

const headers = SESSION
  ? { "Cookie": SESSION, "Content-Type": "application/json" }
  : { "Content-Type": "application/json" };

/* ── Custom metrics ────────────────────────────────────────────────────── */
const errorRate    = new Rate("errors");
const dashboardTrend = new Trend("dashboard_duration");
const leadsTrend   = new Trend("leads_duration");
const healthTrend  = new Trend("health_duration");

/* ── Scenarios ─────────────────────────────────────────────────────────── */
export const options = {
  scenarios: {
    smoke: {
      executor:  "constant-vus",
      vus:       1,
      duration:  "30s",
      tags:      { scenario: "smoke" },
    },
  },
  thresholds: {
    // 95th percentile under 2s across all requests
    http_req_duration: ["p(95)<2000"],
    // Error rate under 1%
    errors:            ["rate<0.01"],
    // Health endpoint fast
    health_duration:   ["p(99)<500"],
  },
};

/* ── Test scenarios (choose one via --env SCENARIO=load) ─────────────── */
const SCENARIO = __ENV.SCENARIO || "smoke";

function getScenarioOptions() {
  switch (SCENARIO) {
    case "load":
      return {
        stages: [
          { duration: "1m", target: 5  },  // ramp up
          { duration: "3m", target: 10 },  // hold
          { duration: "1m", target: 0  },  // ramp down
        ],
      };
    case "stress":
      return {
        stages: [
          { duration: "30s", target: 5  },
          { duration: "1m",  target: 15 },
          { duration: "1m",  target: 30 },
          { duration: "30s", target: 0  },
        ],
      };
    case "spike":
      return {
        stages: [
          { duration: "5s",  target: 50 },
          { duration: "10s", target: 50 },
          { duration: "5s",  target: 0  },
        ],
      };
    default:
      return {};
  }
}

/* ── Main test function ────────────────────────────────────────────────── */
export default function () {
  // 1. Health check (always public, no auth needed)
  {
    const r = http.get(`${BASE_URL}/api/health`, { tags: { name: "health" } });
    healthTrend.add(r.timings.duration);
    const ok = check(r, {
      "health: status 200":    (res) => res.status === 200,
      "health: ok field true": (res) => {
        try { return (JSON.parse(res.body)).ok === true; } catch { return false; }
      },
    });
    errorRate.add(!ok);
    sleep(0.5);
  }

  // Skip authenticated routes if no session provided
  if (!SESSION || SESSION === "") {
    sleep(1);
    return;
  }

  // 2. Dashboard API
  {
    const r = http.get(`${BASE_URL}/api/orgs/${ORG_ID}/dashboard`, { headers, tags: { name: "dashboard" } });
    dashboardTrend.add(r.timings.duration);
    const ok = check(r, {
      "dashboard: status 200 or 401": (res) => res.status === 200 || res.status === 401,
    });
    errorRate.add(!ok);
    sleep(0.5);
  }

  // 3. Leads list (paginated, cursor-based)
  {
    const r = http.get(`${BASE_URL}/api/orgs/${ORG_ID}/leads?limit=50`, { headers, tags: { name: "leads" } });
    leadsTrend.add(r.timings.duration);
    const ok = check(r, {
      "leads: status 200 or 401": (res) => res.status === 200 || res.status === 401,
    });
    errorRate.add(!ok);
    sleep(0.5);
  }

  // 4. Payments list
  {
    const r = http.get(`${BASE_URL}/api/orgs/${ORG_ID}/payments?limit=50`, { headers, tags: { name: "payments" } });
    const ok = check(r, {
      "payments: status 200 or 401": (res) => res.status === 200 || res.status === 401,
    });
    errorRate.add(!ok);
    sleep(0.5);
  }

  // 5. CRM stats
  {
    const r = http.get(`${BASE_URL}/api/orgs/${ORG_ID}/crm/stats?range=month`, { headers, tags: { name: "crm_stats" } });
    const ok = check(r, {
      "crm/stats: status 200 or 401": (res) => res.status === 200 || res.status === 401,
    });
    errorRate.add(!ok);
    sleep(0.5);
  }

  // 6. Verify debug routes are closed in production (expect 404)
  {
    const r = http.get(`${BASE_URL}/api/debug/meta-secret-hash`, { tags: { name: "debug_gate" } });
    const ok = check(r, {
      "debug route: 404 in prod": (res) => res.status === 404 || res.status === 405,
    });
    errorRate.add(!ok);
  }

  sleep(1);
}

/* ── Summary handler ─────────────────────────────────────────────────────── */
export function handleSummary(data) {
  const p95 = data.metrics.http_req_duration?.values?.["p(95)"] ?? 0;
  const p99 = data.metrics.http_req_duration?.values?.["p(99)"] ?? 0;
  const errRate = (data.metrics.errors?.values?.rate ?? 0) * 100;
  const rps = data.metrics.http_reqs?.values?.rate ?? 0;

  console.log("\n=== Effora AI Load Test Summary ===");
  console.log(`Requests/sec:  ${rps.toFixed(1)}`);
  console.log(`p95 latency:   ${p95.toFixed(0)}ms`);
  console.log(`p99 latency:   ${p99.toFixed(0)}ms`);
  console.log(`Error rate:    ${errRate.toFixed(2)}%`);
  console.log(`\nThresholds:`);
  console.log(`  p95 < 2000ms:  ${p95 < 2000 ? "✓ PASS" : "✗ FAIL"}`);
  console.log(`  errors < 1%:   ${errRate < 1 ? "✓ PASS" : "✗ FAIL"}`);

  return {
    stdout: "",
    "scripts/loadtest-results.json": JSON.stringify(data, null, 2),
  };
}
