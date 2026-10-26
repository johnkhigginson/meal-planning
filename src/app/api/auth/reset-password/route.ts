import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { consumeAuthToken } from "@/lib/auth-tokens";
import { audit, clientIp } from "@/lib/audit";
import { enforceRateLimit, ipKey } from "@/lib/rate-limit";

// Set a new password using an emailed reset token. The token is single-use.
export async function POST(request: NextRequest) {
  const limited = enforceRateLimit("reset-password", ipKey(request), 10, 15 * 60_000);
  if (limited) return limited;

  const body = await request.json().catch(() => ({}));
  const { token, password } = body;

  // Validate the password before redeeming, so a typo doesn't burn the link.
  if (typeof password !== "string" || password.length < 8) {
    return NextResponse.json(
      { error: "Password must be at least 8 characters" },
      { status: 400 }
    );
  }

  const userId = await consumeAuthToken(token, "PASSWORD_RESET");
  if (!userId) {
    return NextResponse.json(
      { error: "This reset link is invalid or has expired. Please request a new one." },
      { status: 400 }
    );
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const user = await prisma.user.update({
    where: { id: userId },
    data: { passwordHash },
    select: { id: true, name: true, householdId: true, emailVerifiedAt: true },
  });

  // Any other outstanding reset links for this account stop working too.
  await prisma.authToken.deleteMany({ where: { userId, purpose: "PASSWORD_RESET", usedAt: null } });

  // Following a link from the inbox proves the user owns the address.
  if (!user.emailVerifiedAt) {
    await prisma.user.update({ where: { id: userId }, data: { emailVerifiedAt: new Date() } });
  }

  await audit({
    category: "AUTH",
    action: "PASSWORD_RESET",
    summary: `${user.name} reset their password`,
    actorUserId: user.id,
    actorName: user.name,
    householdId: user.householdId,
    ip: clientIp(request),
  });

  return NextResponse.json({ ok: true });
}
