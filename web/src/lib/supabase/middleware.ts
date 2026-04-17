// Middleware helper: refresh the Supabase session on every request so server
// components always see a fresh access token, and block unauthenticated
// access to /admin.
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(
          cookiesToSet: { name: string; value: string; options?: CookieOptions }[],
        ) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // Critical: must call getUser() to refresh the token
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  // Maintenance mode — gated behind MAINTENANCE_MODE env var so we can flip it
  // without redeploying code. Signed-in admin users pass through. The
  // /maintenance page itself plus the admin login page must stay reachable,
  // otherwise we'd lock ourselves out. /api/* stays reachable so Vercel Cron
  // jobs keep hitting sync-news / sync-civicclerk during maintenance.
  const maintenance = process.env.MAINTENANCE_MODE === "true";
  if (maintenance) {
    const isExempt =
      pathname === "/maintenance" ||
      pathname === "/admin/login" ||
      pathname.startsWith("/admin/") || // admin area itself is gated below
      pathname === "/admin" ||
      pathname.startsWith("/api/") ||
      pathname.startsWith("/_next/") ||
      pathname.startsWith("/auth/") ||
      pathname === "/favicon.ico" ||
      pathname === "/robots.txt" ||
      pathname === "/sitemap.xml";

    if (!isExempt && !user) {
      const url = request.nextUrl.clone();
      url.pathname = "/maintenance";
      url.search = "";
      return NextResponse.redirect(url);
    }
  }

  // Gate /admin routes. /admin/login itself is public so users can sign in.
  const isAdminRoute = pathname.startsWith("/admin") && pathname !== "/admin/login";

  if (isAdminRoute && !user) {
    const url = request.nextUrl.clone();
    url.pathname = "/admin/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
