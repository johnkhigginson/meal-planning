import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";

export async function GET() {
  const { householdId } = await requireUser();

  const invites = await prisma.householdInvite.findMany({
    where: { householdId },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(invites);
}

export async function POST(request: NextRequest) {
  const { userId, householdId } = await requireUser();
  const { email } = await request.json();

  if (!email || typeof email !== "string") {
    return NextResponse.json({ error: "Email is required" }, { status: 400 });
  }

  // Check if user is owner
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (user?.role !== "OWNER") {
    return NextResponse.json(
      { error: "Only household owners can send invites" },
      { status: 403 }
    );
  }

  // Check if already a member
  const existingMember = await prisma.user.findFirst({
    where: { email, householdId },
  });
  if (existingMember) {
    return NextResponse.json(
      { error: "This person is already in your household" },
      { status: 409 }
    );
  }

  // Check for existing pending invite
  const existingInvite = await prisma.householdInvite.findUnique({
    where: { householdId_email: { householdId, email } },
  });
  if (existingInvite && existingInvite.status === "PENDING") {
    return NextResponse.json(
      { error: "An invite has already been sent to this email" },
      { status: 409 }
    );
  }

  const invite = await prisma.householdInvite.upsert({
    where: { householdId_email: { householdId, email } },
    update: { status: "PENDING", invitedBy: userId },
    create: { householdId, email, invitedBy: userId },
  });

  return NextResponse.json(invite, { status: 201 });
}

export async function DELETE(request: NextRequest) {
  const { householdId } = await requireUser();
  const { searchParams } = new URL(request.url);
  const inviteId = parseInt(searchParams.get("id") || "0", 10);

  if (!inviteId) {
    return NextResponse.json({ error: "Invite ID required" }, { status: 400 });
  }

  await prisma.householdInvite.deleteMany({
    where: { id: inviteId, householdId },
  });

  return NextResponse.json({ success: true });
}
