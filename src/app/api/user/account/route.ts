import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { auth, getCurrentUser } from "@/lib/auth";
import { deleteUserAccount } from "@/lib/account-deletion";
import { normalizeEmail } from "@/lib/email-normalize";
import { audit, clientIp } from "@/lib/audit";
import { enforceRateLimit } from "@/lib/rate-limit";

// Permanently delete the signed-in user's account. Requires the password and
// the word DELETE typed out. An account with no password (created through
// Google or Apple sign-in) types its email address instead of the password.
// The client signs out afterwards.
export async function DELETE(request: NextRequest) {
  const current = await getCurrentUser();
  if (!current) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const limited = enforceRateLimit("delete-account", current.userId, 5, 15 * 60_000);
  if (limited) return limited;

  // An admin viewing as someone else must not delete that person's account.
  const session = await auth();
  if ((session?.user as { impersonatedBy?: string | null } | undefined)?.impersonatedBy) {
    return NextResponse.json(
      { error: "Accounts can't be deleted while viewing as another user" },
      { status: 403 }
    );
  }

  const { password, email, confirm } = await request.json().catch(() => ({}));
  if (confirm !== "DELETE") {
    return NextResponse.json({ error: "Type DELETE to confirm" }, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { id: current.userId },
    select: { id: true, name: true, email: true, householdId: true, passwordHash: true, systemRole: true },
  });
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  if (user.passwordHash) {
    if (typeof password !== "string" || !password) {
      return NextResponse.json({ error: "Password is required" }, { status: 400 });
    }
    if (!(await bcrypt.compare(password, user.passwordHash))) {
      return NextResponse.json({ error: "Password is incorrect" }, { status: 400 });
    }
  } else if (typeof email !== "string" || normalizeEmail(email) !== user.email) {
    return NextResponse.json({ error: "Type your account email to confirm" }, { status: 400 });
  }

  // Keep at least one admin so the admin area stays reachable.
  if (user.systemRole === "ADMIN") {
    const otherAdmins = await prisma.user.count({
      where: { systemRole: "ADMIN", id: { not: user.id } },
    });
    if (otherAdmins === 0) {
      return NextResponse.json(
        { error: "You're the only admin. Make someone else an admin before deleting your account." },
        { status: 400 }
      );
    }
  }

  const result = await deleteUserAccount(user.id);

  await audit({
    category: "USER",
    action: "ACCOUNT_DELETED",
    summary: result.householdDeleted
      ? `${user.name} deleted their account and household`
      : result.newOwner
        ? `${user.name} deleted their account; ${result.newOwner.name} is now the household owner`
        : `${user.name} deleted their account`,
    actorUserId: user.id,
    actorName: user.name,
    householdId: result.householdId,
    targetType: "USER",
    targetId: user.id,
    metadata: { householdDeleted: result.householdDeleted, newOwnerId: result.newOwner?.id ?? null },
    ip: clientIp(request),
  });

  return NextResponse.json({ ok: true, householdDeleted: result.householdDeleted });
}
