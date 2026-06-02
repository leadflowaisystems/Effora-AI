import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";

/**
 * Middleware — two responsibilities:
 *
 * 1. Forward x-pathname header so server components (e.g. OrgLayout) can read
 *    the current path via headers().get("x-pathname"). Without this OrgLayout
 *    can't detect it's already on /onboarding, causing an infinite redirect loop.
 *
 * 2. Refresh Supabase session on every request. Without this, Supabase access
 *    tokens (default 1-hour expiry) expire silently and the user gets logged out
 *    mid-session. @supabase/ssr's cookie handler exchanges the refresh token for
 *    a new access token and writes the new cookies to the response automatically.
 */
export async function middleware(request: NextRequest) {
  // Build request headers with the pathname forwarded
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-pathname", request.nextUrl.pathname);

  // Start with a plain next response; session refresh may replace this
  let response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("x-pathname", request.nextUrl.pathname);

  // Session refresh via @supabase/ssr
  // The setAll handler must both update the request (for downstream reads)
  // AND the response (so Set-Cookie headers reach the browser).
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet: Array<{ name: string; value: string; options: CookieOptions }>) => {
          // Stamp onto the request so server components can read the new token
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          // Rebuild the response with updated request cookies + pathname header
          response = NextResponse.next({ request: { headers: requestHeaders } });
          response.headers.set("x-pathname", request.nextUrl.pathname);
          // Stamp onto the response so the browser stores the refreshed token
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Calling getUser() triggers token refresh if the access token has expired
  // but the refresh token is still valid. Non-fatal — if this throws we still
  // return the response so the page can render (it will show the login screen).
  try {
    await supabase.auth.getUser();
  } catch {
    // Swallow — network issues shouldn't hard-fail every page load
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except static files and Next.js internals.
     * This ensures x-pathname is available and sessions are refreshed on
     * every server-side render.
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
