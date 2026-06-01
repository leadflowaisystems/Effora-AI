import { NextRequest, NextResponse } from "next/server";

/**
 * Minimal middleware — forwards the current pathname as a request header
 * so server components (e.g. OrgLayout) can read it via headers().get("x-pathname").
 *
 * Without this header OrgLayout can never detect it is already on the
 * /onboarding sub-path, causing an infinite redirect loop for new users
 * on Vercel (→ 25-second timeout / hanging dark screen).
 */
export function middleware(request: NextRequest) {
  const response = NextResponse.next({
    request: {
      headers: new Headers(request.headers),
    },
  });
  // Forward the pathname so server components can read it
  response.headers.set("x-pathname", request.nextUrl.pathname);
  // Also set it on the *request* headers so server components receive it
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-pathname", request.nextUrl.pathname);
  return NextResponse.next({ request: { headers: requestHeaders } });
}

export const config = {
  matcher: [
    /*
     * Match all request paths except static files and Next.js internals.
     * This ensures x-pathname is available on every server-component render.
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
