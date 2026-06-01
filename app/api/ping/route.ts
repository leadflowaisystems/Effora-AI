import { NextResponse } from "next/server";
import { z } from "zod";

export const dynamic = "force-dynamic";

const Schema = z.object({ msg: z.string().optional() });

export function GET() {
  const parsed = Schema.safeParse({ msg: "hello" });
  return NextResponse.json({ ok: true, zodWorks: parsed.success, zodVersion: "3.25.x" });
}
