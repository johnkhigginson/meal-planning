import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { consumeAuthToken } from "@/lib/auth-tokens";
import { audit, clientIp } from "@/lib/audit";
import { enforceRateLimit, ipKey } from "@/lib/rate-limit";

// Whether the signed-in user's email is verified. Drives the reminder banner.
export async function GET() {
  const current = await getCurrentUser();
  if (!current) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const user = await prisma.user.findUnique({
    where: { id: current.userId },
    select: { emailVerifiedAt: true },
  });
  return NextResponse.json({ verified: !!user?.emailVerifiedAt });
}

// Redeem a verification link. Works without a session, so the link can be
// opened on any device.
export async function POST(request: NextRequest) {
  const limited = enforceRateLimit("verify-email", ipKey(request), 10, 15 * 60_000);
  if (limited) return limited;

  const { token } = await request.json().catch(() => ({}));
  const userId = await consumeAuthToken(token, "VERIFY_EMAIL");
  if (!userId) {
    return NextResponse.json(
      { error: "This verification link is invalid or has expired." },
      { status: 400 }
    );
  }

  const user = await prisma.user.update({
    where: { id: userId },
    data: { emailVerifiedAt: new Date() },
    select: { id: true, name: true, householdId: true },
  });

  await audit({
    category: "AUTH",
    action: "EMAIL_VERIFIED",
    summary: `${user.name} verified their email`,
    actorUserId: user.id,
    actorName: user.name,
    householdId: user.householdId,
    ip: clientIp(request),
  });

  return NextResponse.json({ ok: true });
}
