import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";

// Routes that don't require authentication
const publicPaths = ["/", "/login", "/register"];

export default auth((req) => {
  const { pathname } = req.nextUrl;

  // Allow public paths (including the public recipe blog)
  if (
    publicPaths.includes(pathname) ||
    pathname.startsWith("/share/") ||
    pathname === "/blog" ||
    pathname.startsWith("/blog/")
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
