import { auth } from "@/lib/auth";
import { NextResponse, type NextFetchEvent, type NextMiddleware, type NextRequest } from "next/server";

// Routes that don't require authentication
const publicPaths = [
  "/",
  "/login",
  "/register",
  "/forgot-password",
  "/reset-password",
  "/verify-email",
  "/help",
  "/privacy",
  "/terms",
  "/contact",
];

// Top-level sections of the signed-in app. A signed-out request for anything
// else (a mistyped or made-up URL) gets the 404 page rather than a redirect to
// /login, so crawlers see a real 404. A section missing from this list fails
// closed: signed-out visitors get a 404 instead of the login redirect.
const appSections = [
  "admin",
  "api",
  "books",
  "grocery-list",
  "meal-plan",
  "pantry",
  "recipes",
  "settings",
  "stores",
  "what-can-i-make",
];

const authMiddleware = auth((req) => {
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
    const section = pathname.split("/")[1];
    // Paths with a file extension may be files in public/, so they keep the
    // login redirect.
    if (!appSections.includes(section) && !section.includes(".")) {
      return NextResponse.rewrite(new URL("/404", req.nextUrl.origin));
    }
    const loginUrl = new URL("/login", req.nextUrl.origin);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}) as unknown as NextMiddleware | Promise<NextMiddleware>;

// The auth config is built per request (see src/lib/auth.ts), and in that mode
// next-auth's auth(handler) hands back a promise of the middleware rather than
// the middleware itself (its types don't say so), so resolve it here.
export default async function middleware(req: NextRequest, ev: NextFetchEvent) {
  return (await authMiddleware)(req, ev);
}

export const runtime = "nodejs";

export const config = {
  // Skip auth for static assets. Icons, the manifest and the service worker
  // must load for signed-out visitors, or the tab icon and PWA install break.
  // The share image must load for social crawlers, which are never signed in.
  matcher: [
    "/((?!api/auth|_next/static|_next/image|favicon.ico|icon\\.svg|icon-\\d+\\.png|apple-icon|manifest\\.json|sw\\.js|robots\\.txt|sitemap\\.xml|opengraph-image).*)",
  ],
};
