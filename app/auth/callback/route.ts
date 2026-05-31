import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit";
import { rateLimitAsync, getIp } from "@/lib/ratelimit";

export async function GET(request: NextRequest) {
  const ip = getIp(request);

  // Rate limit callback attempts per IP: 10 per minute
  const rl = await rateLimitAsync(`auth-callback:${ip}`, { limit: 10, windowMs: 60_000 });
  if (!rl.allowed) {
    return NextResponse.redirect(new URL("/login?error=too_many_attempts", request.url));
  }

  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";

  if (code) {
    const cookieStore = cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
          setAll(cookiesToSet: { name: string; value: string; options?: CookieOptions }[]) {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          },
        },
      }
    );

    const { data: sessionData, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      const userId = sessionData?.session?.user?.id ?? null;
      if (userId) {
        void logAudit(createServiceClient(), null, userId, "user.login", {
          method:     "oauth_callback",
          ip,
          user_agent: request.headers.get("user-agent")?.slice(0, 200),
        });
      }
      return NextResponse.redirect(`${origin}${next}`);
    }

    // Log failed callback attempt
    void logAudit(createServiceClient(), null, null, "auth.callback_failed", {
      ip,
      error: (error as { message?: string })?.message?.slice(0, 200),
    });
  }

  return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`);
}
