import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";

// Routes that don't require authentication
const publicPaths = ["/", "/login", "/register", "/forgot-password", "/reset-password"];

export default auth((req) => {
  const { pathname } = req.nextUrl;

  // Allow public paths (including the public recipe blog) and the API routes
  // the public blog depends on. Those API routes self-authorize (read is
  // public; writes call getCurrentUser and 401 on their own), so letting them
  // through middleware avoids redirecting logged-out visitors' image/comment
  // requests to /login.
  if (
    publicPaths.includes(pathname) ||
    pathname.startsWith("/share/") ||
    pathname.startsWith("/invite/") ||
    pathname === "/blog" ||
    pathname.startsWith("/blog/") ||
    pathname.startsWith("/api/images") ||
    pathname.startsWith("/api/blog/") ||
    pathname.startsWith("/api/share/") ||
    pathname.startsWith("/api/invite/")
  ) {
    return NextResponse.next();
  }

  // Redirect to login if not authenticated
  if (!req.auth) {
    const loginUrl = new URL("/login", req.nextUrl.origin);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
});

export const runtime = "nodejs";

export const config = {
  // Skip auth for static assets. Icons, the manifest and the service worker
  // must load for signed-out visitors, or the tab icon and PWA install break.
  // The share image must load for social crawlers, which are never signed in.
  matcher: [
    "/((?!api/auth|_next/static|_next/image|favicon.ico|icon\\.svg|icon-\\d+\\.png|apple-icon|manifest\\.json|sw\\.js|robots\\.txt|sitemap\\.xml|opengraph-image).*)",
  ],
};
