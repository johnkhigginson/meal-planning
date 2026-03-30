import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";

export async function POST(request: NextRequest) {
  const { name, email, password } = await request.json();

  if (!name || !email || !password) {
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

  return NextResponse.json(
    { id: user.id, name: user.name, email: user.email },
    { status: 201 }
  );
}
