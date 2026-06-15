import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";

// Routes that don't require authentication
const publicPaths = ["/", "/login", "/register"];

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
  matcher: [
    "/((?!api/auth|_next/static|_next/image|favicon.ico).*)",
  ],
};
