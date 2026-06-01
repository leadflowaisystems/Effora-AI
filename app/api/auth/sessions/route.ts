/**
 * GET  /api/auth/sessions — list current session info
 * DELETE /api/auth/sessions — sign out of all sessions globally
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit";

export async function GET() {
  const supabase = createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Supabase doesn't expose a full session list to users.
  // Return current session identity info so the client can display it.
  const { data: { session } } = await supabase.auth.getSession();

  return NextResponse.json({
    user: {
      id:         user.id,
      email:      user.email,
      created_at: user.created_at,
      last_sign_in_at: user.last_sign_in_at,
    },
    current_session: session
      ? {
          expires_at:  session.expires_at,
          token_type:  session.token_type,
        }
      : null,
  });
}

// Sign out of all sessions (global scope)
export async function DELETE(req: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  void logAudit(createServiceClient(), null, user.id, "auth.global_signout", {
    user_agent: req.headers.get("user-agent")?.slice(0, 200),
  });

  const { error } = await supabase.auth.signOut({ scope: "global" });
  if (error) return NextResponse.json({ error: "Sign out failed." }, { status: 500 });

  return NextResponse.json({ ok: true });
}
