import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  try {
    // Forward the pathname so Server Component layouts can read it via headers().
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set("x-pathname", request.nextUrl.pathname);

    let supabaseResponse = NextResponse.next({
      request: { headers: requestHeaders },
    });

    const supabaseUrl  = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    // If env vars are missing, skip auth and pass the request through.
    if (!supabaseUrl || !supabaseAnon) {
      console.error("[middleware] Supabase env vars missing — skipping auth");
      return supabaseResponse;
    }

    const supabase = createServerClient(supabaseUrl, supabaseAnon, {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options?: CookieOptions }[]) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({
            request: { headers: requestHeaders },
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    });

    // Refresh session — required for auth state to propagate.
    let user = null;
    try {
      const { data } = await supabase.auth.getUser();
      user = data.user;
    } catch (authErr) {
      console.error("[middleware] supabase.auth.getUser failed:", authErr);
      // Auth check failed — let the route handler deal with it.
    }

    const { pathname } = request.nextUrl;

    const isPublicPath =
      pathname.startsWith("/login") ||
      pathname.startsWith("/auth") ||
      pathname.startsWith("/api/inngest") ||
      pathname.startsWith("/styleguide") ||
      pathname.startsWith("/_next") ||
      /\.(svg|png|jpg|jpeg|gif|webp|ico|css|js)$/.test(pathname);

    if (!user && !isPublicPath) {
      const loginUrl = request.nextUrl.clone();
      loginUrl.pathname = "/login";
      loginUrl.searchParams.set("next", pathname);
      return NextResponse.redirect(loginUrl);
    }

    if (user && pathname === "/login") {
      const homeUrl = request.nextUrl.clone();
      homeUrl.pathname = "/";
      homeUrl.searchParams.delete("next");
      return NextResponse.redirect(homeUrl);
    }

    // Propagate x-pathname to the response headers too
    supabaseResponse.headers.set("x-pathname", pathname);

    return supabaseResponse;
  } catch (err) {
    console.error("[middleware] unhandled error:", err);
    // CRITICAL: never throw — always return NextResponse.next() so requests
    // still reach their route handlers even if middleware crashes.
    return NextResponse.next();
  }
}

export const config = {
  matcher: [
    // Match all routes EXCEPT static assets, api/webhooks/*, and api/inngest
    "/((?!_next/static|_next/image|favicon.ico|api/webhooks|api/inngest).*)",
  ],
};
