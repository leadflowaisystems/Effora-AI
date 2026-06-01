import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";

export async function middleware(req: NextRequest) {
  try {
    const pathname = req.nextUrl.pathname;

    // Skip middleware entirely for these paths
    if (
      pathname.startsWith("/_next") ||
      pathname.startsWith("/api/webhooks") ||
      pathname.startsWith("/api/inngest") ||
      pathname === "/favicon.ico" ||
      pathname === "/manifest.json" ||
      pathname === "/sw.js" ||
      pathname.startsWith("/icon-") ||
      pathname.startsWith("/apple-touch-icon")
    ) {
      return NextResponse.next();
    }

    // Supabase session refresh + auth redirect logic
    try {
      const requestHeaders = new Headers(req.headers);
      requestHeaders.set("x-pathname", pathname);

      let supabaseResponse = NextResponse.next({
        request: { headers: requestHeaders },
      });

      const supabaseUrl  = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const supabaseAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

      if (!supabaseUrl || !supabaseAnon) {
        console.error("[middleware] Supabase env vars missing — skipping auth");
        return NextResponse.next();
      }

      const supabase = createServerClient(supabaseUrl, supabaseAnon, {
        cookies: {
          getAll() {
            return req.cookies.getAll();
          },
          setAll(cookiesToSet: { name: string; value: string; options?: CookieOptions }[]) {
            cookiesToSet.forEach(({ name, value }) => req.cookies.set(name, value));
            supabaseResponse = NextResponse.next({
              request: { headers: requestHeaders },
            });
            cookiesToSet.forEach(({ name, value, options }) =>
              supabaseResponse.cookies.set(name, value, options)
            );
          },
        },
      });

      let user = null;
      try {
        const { data } = await supabase.auth.getUser();
        user = data.user;
      } catch (authErr) {
        console.error("[middleware] auth refresh failed:", authErr);
        // Continue without auth — never crash the request
      }

      const isPublicPath =
        pathname.startsWith("/login") ||
        pathname.startsWith("/auth") ||
        pathname.startsWith("/styleguide") ||
        /\.(svg|png|jpg|jpeg|gif|webp|ico|css|js)$/.test(pathname);

      if (!user && !isPublicPath) {
        const loginUrl = req.nextUrl.clone();
        loginUrl.pathname = "/login";
        loginUrl.searchParams.set("next", pathname);
        return NextResponse.redirect(loginUrl);
      }

      if (user && pathname === "/login") {
        const homeUrl = req.nextUrl.clone();
        homeUrl.pathname = "/";
        homeUrl.searchParams.delete("next");
        return NextResponse.redirect(homeUrl);
      }

      supabaseResponse.headers.set("x-pathname", pathname);
      return supabaseResponse;
    } catch (authErr) {
      console.error("[middleware] auth refresh failed:", authErr);
      // Continue without auth — never crash the request
    }

    return NextResponse.next();
  } catch (err) {
    console.error("[middleware] caught fatal error:", err);
    return NextResponse.next();
  }
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|manifest.json|sw.js|icon-|apple-touch-icon|api/webhooks|api/inngest).*)",
  ],
};
