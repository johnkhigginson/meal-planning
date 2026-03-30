import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";

export async function GET() {
  await requireAdmin();

  const users = await prisma.user.findMany({
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      isAdmin: true,
      createdAt: true,
      household: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  const stats = {
    totalUsers: users.length,
    totalHouseholds: new Set(users.map((u) => u.household.id)).size,
  };

  return NextResponse.json({ users, stats });
}
