/**
 * GET /api/health
 * Uptime monitoring probe. Returns 200 with timestamp.
 */

import { NextResponse } from "next/server";

export const runtime = "edge";

export function GET() {
  return NextResponse.json({ ok: true, time: new Date().toISOString() });
}
