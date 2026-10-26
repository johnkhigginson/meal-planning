import { NextRequest, NextResponse, after } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { normalizeEmail } from "@/lib/email-normalize";
import { verifyTurnstile } from "@/lib/turnstile";
import { enforceRateLimit, ipKey } from "@/lib/rate-limit";
import { sendEmailVerification } from "@/lib/email-verification";
import { createAccount } from "@/lib/user-registration";

export async function POST(request: NextRequest) {
  const limited = enforceRateLimit("register", ipKey(request), 5, 60 * 60_000);
  if (limited) return limited;

  const body = await request.json();
  const { name, password } = body;

  // Honeypot: a hidden field real users never see. Bots that fill every input
  // trip it. Respond with a generic error so the trap isn't obvious.
  if (typeof body.company === "string" && body.company.trim() !== "") {
    return NextResponse.json({ error: "Registration failed" }, { status: 400 });
  }

  if (!name || !body.email || !password) {
    return NextResponse.json(
      { error: "Name, email, and password are required" },
      { status: 400 }
    );
  }

  if (typeof password !== "string" || password.length < 8) {
    return NextResponse.json(
      { error: "Password must be at least 8 characters" },
      { status: 400 }
    );
  }

  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const humanVerified = await verifyTurnstile(body.turnstileToken, ip);
  if (!humanVerified) {
    return NextResponse.json(
      { error: "Verification failed. Please try again." },
      { status: 400 }
    );
  }

  const email = normalizeEmail(body.email);

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return NextResponse.json(
      { error: "An account with this email already exists" },
      { status: 409 }
    );
  }

  const passwordHash = await bcrypt.hash(password, 12);

  const user = await createAccount({ name, email, passwordHash });

  // Verification is optional and never blocks sign-in, so send it after the
  // response and don't let a mail failure affect registration.
  after(async () => {
    try {
      await sendEmailVerification(user);
    } catch (err) {
      console.error("verification email failed", err);
    }
  });

  return NextResponse.json(
    { id: user.id, name: user.name, email: user.email },
    { status: 201 }
  );
}
