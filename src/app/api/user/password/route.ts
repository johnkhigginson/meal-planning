import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { auth, getCurrentUser } from "@/lib/auth";
import { audit, clientIp } from "@/lib/audit";
import { enforceRateLimit } from "@/lib/rate-limit";

// Change the signed-in user's password. Requires the current password, unless
// the account has none yet (created through Google or Apple sign-in), in which
// case this sets the first one.
export async function PUT(request: NextRequest) {
  const current = await getCurrentUser();
  if (!current) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const limited = enforceRateLimit("change-password", current.userId, 5, 15 * 60_000);
  if (limited) return limited;

  const { currentPassword, newPassword } = await request.json().catch(() => ({}));

  if (typeof newPassword !== "string" || newPassword.length < 8) {
    return NextResponse.json(
      { error: "New password must be at least 8 characters" },
      { status: 400 }
    );
  }

  const user = await prisma.user.findUnique({
    where: { id: current.userId },
    select: { id: true, name: true, householdId: true, passwordHash: true },
  });
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  // Only an account with no password may skip the current one.
  const settingFirst = user.passwordHash === null;
  if (settingFirst) {
    // An admin viewing as someone else must not give that account a password
    // they know.
    const session = await auth();
    if ((session?.user as { impersonatedBy?: string | null } | undefined)?.impersonatedBy) {
      return NextResponse.json(
        { error: "A password can't be set while viewing as another user" },
        { status: 403 }
      );
    }
  } else {
    if (typeof currentPassword !== "string" || !currentPassword) {
      return NextResponse.json({ error: "Current password is required" }, { status: 400 });
    }
    if (!(await bcrypt.compare(currentPassword, user.passwordHash!))) {
      return NextResponse.json({ error: "Current password is incorrect" }, { status: 400 });
    }
  }

  const passwordHash = await bcrypt.hash(newPassword, 12);
  // Setting a first password is conditional on there still being none, so two
  // racing requests can't let the second skip the current-password check.
  const updated = await prisma.user.updateMany({
    where: settingFirst ? { id: user.id, passwordHash: null } : { id: user.id },
    data: { passwordHash },
  });
  if (updated.count === 0) {
    return NextResponse.json({ error: "Current password is required" }, { status: 400 });
  }
  // A reset link requested before the change shouldn't still work after it.
  await prisma.authToken.deleteMany({ where: { userId: user.id, purpose: "PASSWORD_RESET", usedAt: null } });

  await audit({
    category: "AUTH",
    action: settingFirst ? "PASSWORD_SET" : "PASSWORD_CHANGED",
    summary: settingFirst ? `${user.name} set a password` : `${user.name} changed their password`,
    actorUserId: user.id,
    actorName: user.name,
    householdId: user.householdId,
    ip: clientIp(request),
  });

  return NextResponse.json({ ok: true });
}
