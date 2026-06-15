import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { normalizeEmail } from "@/lib/email-normalize";
import { verifyTurnstile } from "@/lib/turnstile";
import { audit } from "@/lib/audit";

export async function POST(request: NextRequest) {
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

  if (password.length < 6) {
    return NextResponse.json(
      { error: "Password must be at least 6 characters" },
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

  // Check if there's a pending invite for this email
  const invite = await prisma.householdInvite.findFirst({
    where: { email, status: "PENDING" },
  });

  let householdId: number;

  if (invite) {
    // Join existing household
    householdId = invite.householdId;
    await prisma.householdInvite.update({
      where: { id: invite.id },
      data: { status: "ACCEPTED" },
    });
  } else {
    // Create new household
    const household = await prisma.household.create({
      data: { name: `${name}'s Kitchen` },
    });
    householdId = household.id;
  }

  const user = await prisma.user.create({
    data: {
      name,
      email,
      passwordHash,
      householdId,
      role: invite ? "MEMBER" : "OWNER",
    },
  });

  await audit({
    category: "AUTH",
    action: "REGISTER",
    summary: `${user.name} created an account`,
    actorUserId: user.id,
    actorName: user.name,
    householdId,
  });

  return NextResponse.json(
    { id: user.id, name: user.name, email: user.email },
    { status: 201 }
  );
}
