import { NextRequest, NextResponse, after } from "next/server";
import { prisma } from "@/lib/prisma";
import { normalizeEmail } from "@/lib/email-normalize";
import { createAuthToken } from "@/lib/auth-tokens";
import { sendPasswordResetEmail } from "@/lib/email";
import { getSiteUrl } from "@/lib/site";
import { audit, clientIp } from "@/lib/audit";
import { checkRateLimit, enforceRateLimit, ipKey } from "@/lib/rate-limit";

const RESET_TTL_MS = 60 * 60_000; // 1 hour

// Request a password reset link. Always answers the same way so the response
// never reveals whether an account exists for the email.
export async function POST(request: NextRequest) {
  const limited = enforceRateLimit("forgot-password", ipKey(request), 5, 15 * 60_000);
  if (limited) return limited;

  const body = await request.json().catch(() => ({}));
  if (typeof body.email !== "string" || !body.email.trim()) {
    return NextResponse.json({ error: "Email is required" }, { status: 400 });
  }
  const email = normalizeEmail(body.email);
  const ip = clientIp(request);

  // Look up the account and send after the response, so response time doesn't
  // reveal whether the email matched.
  after(async () => {
    // Cap emails per address too, so one inbox can't be flooded from many IPs.
    // Over the cap, skip quietly; the caller still sees the generic response.
    if (!checkRateLimit(`forgot-password:${email}`, 3, 60 * 60_000).ok) return;

    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, name: true, email: true, householdId: true },
    });
    if (!user) return;

    try {
      const token = await createAuthToken(user.id, "PASSWORD_RESET", RESET_TTL_MS);
      await sendPasswordResetEmail(user.email, `${getSiteUrl()}/reset-password?token=${token}`);
    } catch (err) {
      console.error("password reset email failed", err);
      return;
    }

    await audit({
      category: "AUTH",
      action: "PASSWORD_RESET_REQUESTED",
      summary: `Password reset requested for ${user.name}`,
      actorUserId: user.id,
      actorName: user.name,
      householdId: user.householdId,
      ip,
    });
  });

  return NextResponse.json({ ok: true });
}
