/**
 * GET /api/debug/meta-config
 * POST /api/debug/meta-config  — verify a candidate secret against a known signature+body
 *
 * Temporary diagnostic — REMOVE after root cause is confirmed.
 *
 * POST body:
 *   { "secret": "<candidate secret>", "body": "<raw webhook body>", "sig": "sha256=<hex>" }
 * Returns:
 *   { "computed": "sha256=<hex>", "match": true|false }
 */
import { NextRequest, NextResponse } from "next/server";
import { createHmac } from "crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    appId:           process.env.META_APP_ID,
    appSecretLength: process.env.META_APP_SECRET?.length,
    appSecretPrefix: process.env.META_APP_SECRET?.slice(0, 6),
  });
}

export async function POST(req: NextRequest) {
  let payload: { secret?: string; body?: string; sig?: string };
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  const secret = payload.secret ?? process.env.META_APP_SECRET ?? "";
  const body   = payload.body   ?? "";
  const sig    = payload.sig    ?? "";

  if (!secret) return NextResponse.json({ error: "no secret" }, { status: 400 });
  if (!body)   return NextResponse.json({ error: "no body"   }, { status: 400 });

  const computed = "sha256=" + createHmac("sha256", secret).update(body).digest("hex");

  return NextResponse.json({
    computed,
    received:  sig,
    match:     computed === sig,
    secretLen: secret.length,
    secretPrefix: secret.slice(0, 6),
    bodyLen:   body.length,
    bodyBytes: Buffer.byteLength(body, "utf8"),
  });
}
