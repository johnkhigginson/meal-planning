import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { audit } from "@/lib/audit";

export async function GET() {
  await requireAdmin();

  const users = await prisma.user.findMany({
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      systemRole: true,
      aiEnabled: true,
      enabledMealSlots: true,
      lastLogin: true,
      createdAt: true,
      household: {
        select: {
          id: true,
          name: true,
          _count: { select: { members: true, recipes: true } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  const stats = {
    totalUsers: users.length,
    totalHouseholds: new Set(users.map((u) => u.household.id)).size,
  };

  return NextResponse.json({ users, stats });
}

export async function PUT(request: NextRequest) {
  const admin = await requireAdmin();
  const { userId, systemRole, aiEnabled } = await request.json();

  if (typeof userId !== "number" || !Number.isInteger(userId) || userId <= 0) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  // One call changes the role, AI access, or both — but at least one.
  const changingRole = systemRole !== undefined;
  const changingAi = aiEnabled !== undefined;
  if (!changingRole && !changingAi) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }
  if (changingRole && !["USER", "CONTRIBUTOR", "ADMIN"].includes(systemRole)) {
    return NextResponse.json({ error: "Invalid role" }, { status: 400 });
  }
  if (changingAi && typeof aiEnabled !== "boolean") {
    return NextResponse.json({ error: "aiEnabled must be a boolean" }, { status: 400 });
  }

  // Prevent removing your own admin
  if (changingRole && userId === admin.userId && systemRole !== "ADMIN") {
    return NextResponse.json({ error: "Cannot remove your own admin role" }, { status: 400 });
  }

  const user = await prisma.user.update({
    where: { id: userId },
    data: {
      ...(changingRole ? { systemRole } : {}),
      ...(changingAi ? { aiEnabled } : {}),
    },
    select: { id: true, name: true, email: true, systemRole: true, aiEnabled: true },
  });

  if (changingRole) {
    await audit({
      category: "ADMIN",
      action: "ROLE_CHANGED",
      summary: `${admin.name} set ${user.name}'s role to ${systemRole}`,
      actorUserId: admin.userId,
      actorName: admin.name,
      targetType: "USER",
      targetId: user.id,
      metadata: { systemRole },
    });
  }

  if (changingAi) {
    await audit({
      category: "ADMIN",
      action: aiEnabled ? "AI_ENABLED" : "AI_DISABLED",
      summary: `${admin.name} ${aiEnabled ? "enabled" : "disabled"} AI features for ${user.name}`,
      actorUserId: admin.userId,
      actorName: admin.name,
      targetType: "USER",
      targetId: user.id,
      metadata: { aiEnabled },
    });
  }

  return NextResponse.json(user);
}
