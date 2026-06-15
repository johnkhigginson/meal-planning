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
  const { userId, systemRole } = await request.json();

  if (!userId || !["USER", "CONTRIBUTOR", "ADMIN"].includes(systemRole)) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  // Prevent removing your own admin
  if (userId === admin.userId && systemRole !== "ADMIN") {
    return NextResponse.json({ error: "Cannot remove your own admin role" }, { status: 400 });
  }

  const user = await prisma.user.update({
    where: { id: userId },
    data: { systemRole },
    select: { id: true, name: true, email: true, systemRole: true },
  });

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

  return NextResponse.json(user);
}
