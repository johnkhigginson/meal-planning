import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { audit, clientIp } from "@/lib/audit";
import { enforceRateLimit } from "@/lib/rate-limit";

// Change the signed-in user's password. Requires the current password.
export async function PUT(request: NextRequest) {
  const current = await getCurrentUser();
  if (!current) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const limited = enforceRateLimit("change-password", current.userId, 5, 15 * 60_000);
  if (limited) return limited;

  const { currentPassword, newPassword } = await request.json().catch(() => ({}));

  if (typeof currentPassword !== "string" || !currentPassword) {
    return NextResponse.json({ error: "Current password is required" }, { status: 400 });
  }
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

  if (!(await bcrypt.compare(currentPassword, user.passwordHash))) {
    return NextResponse.json({ error: "Current password is incorrect" }, { status: 400 });
  }

  const passwordHash = await bcrypt.hash(newPassword, 12);
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash } });
  // A reset link requested before the change shouldn't still work after it.
  await prisma.authToken.deleteMany({ where: { userId: user.id, purpose: "PASSWORD_RESET", usedAt: null } });

  await audit({
    category: "AUTH",
    action: "PASSWORD_CHANGED",
    summary: `${user.name} changed their password`,
    actorUserId: user.id,
    actorName: user.name,
    householdId: user.householdId,
    ip: clientIp(request),
  });

  return NextResponse.json({ ok: true });
}
