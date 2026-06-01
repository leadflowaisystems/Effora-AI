/**
 * POST /api/waitlist
 * Body: { email: string, source?: string }
 */

import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { rateLimitAsync, getIp } from "@/lib/ratelimit";

export async function POST(req: NextRequest): Promise<Response> {
  const { allowed } = await rateLimitAsync(`waitlist:${getIp(req)}`, { limit: 5 });
  if (!allowed) return NextResponse.json({ error: "Too many requests." }, { status: 429 });

  const { email, source } = await req.json().catch(() => ({}));

  if (!email || typeof email !== "string" || !email.includes("@")) {
    return NextResponse.json({ error: "Invalid email" }, { status: 400 });
  }

  const svc = createServiceClient();
  const { error } = await svc.from("waitlist").upsert(
    { email: email.toLowerCase().trim(), source: source ?? "landing" },
    { onConflict: "email", ignoreDuplicates: true }
  );

  if (error) console.error("[waitlist]", error);

  // Always return OK (don't leak whether email already exists)
  return NextResponse.json({ ok: true });
}
