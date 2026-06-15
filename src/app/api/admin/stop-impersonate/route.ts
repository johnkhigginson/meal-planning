import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createImpersonationToken } from "@/lib/impersonation";

// Return to the original admin account. Reads `impersonatedBy` from the current
// (NextAuth-signed) session — which only an admin-initiated impersonation can
// have set — and mints a clean token back to that admin. No admin check needed:
// while impersonating a regular user the session has no admin role, but the
// signed `impersonatedBy` claim is trustworthy on its own.
export async function POST() {
  const session = await auth();
  const impersonatedBy = (session?.user as { impersonatedBy?: string | null } | undefined)?.impersonatedBy;
  if (!impersonatedBy) {
    return NextResponse.json({ error: "Not impersonating" }, { status: 400 });
  }

  const adminId = parseInt(impersonatedBy, 10);
  if (Number.isNaN(adminId)) {
    return NextResponse.json({ error: "Invalid impersonation state" }, { status: 400 });
  }

  console.warn(`[impersonation] returning to admin ${adminId}`);
  // impersonatedBy = null → resulting session is a normal admin session.
  const token = createImpersonationToken(adminId, null);
  return NextResponse.json({ token });
}
