import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { sendEmailVerification } from "@/lib/email-verification";
import { enforceRateLimit } from "@/lib/rate-limit";

// Send the signed-in user a new verification link.
export async function POST() {
  const current = await getCurrentUser();
  if (!current) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const limited = enforceRateLimit("resend-verification", current.userId, 3, 60 * 60_000);
  if (limited) return limited;

  const user = await prisma.user.findUnique({
    where: { id: current.userId },
    select: { id: true, name: true, email: true, emailVerifiedAt: true },
  });
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (user.emailVerifiedAt) return NextResponse.json({ ok: true, alreadyVerified: true });

  try {
    await sendEmailVerification(user);
  } catch (err) {
    console.error("verification email failed", err);
    return NextResponse.json({ error: "Could not send the verification email." }, { status: 502 });
  }

  return NextResponse.json({ ok: true });
}
