/**
 * GET /api/debug/meta-config
 * Temporary diagnostic — confirms which Meta app ID and secret production is using.
 * REMOVE after root cause is confirmed.
 */
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    appId:           process.env.META_APP_ID,
    appSecretLength: process.env.META_APP_SECRET?.length,
    appSecretPrefix: process.env.META_APP_SECRET?.slice(0, 6),
  });
}
