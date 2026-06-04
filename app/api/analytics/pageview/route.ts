import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { track } from "@/lib/analytics";

export async function POST(req: NextRequest) {
  try {
    const { path } = await req.json().catch(() => ({})) as { path?: string };
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    void track({ event: "page.view", userId: user?.id ?? null, properties: { path: path ?? "/" } });
  } catch { /* non-fatal */ }
  return NextResponse.json({ ok: true });
}
