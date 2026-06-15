import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";

export async function GET() {
  const { userId } = await requireUser();
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      email: true,
      enabledMealSlots: true,
      hiddenNavItems: true,
      bio: true,
      avatarUrl: true,
      role: true,
      household: {
        select: {
          id: true,
          name: true,
          members: { select: { id: true, name: true, email: true, role: true } },
        },
      },
    },
  });
  return NextResponse.json(user);
}

export async function PUT(request: NextRequest) {
  const { userId, householdId } = await requireUser();
  const body = await request.json();

  const data: Record<string, unknown> = {};
  if (body.name) data.name = body.name;
  if (body.enabledMealSlots) data.enabledMealSlots = body.enabledMealSlots;
  if (typeof body.hiddenNavItems === "string") data.hiddenNavItems = body.hiddenNavItems;
  if (typeof body.bio === "string") data.bio = body.bio || null;
  if (typeof body.avatarUrl === "string") data.avatarUrl = body.avatarUrl || null;

  const user = await prisma.user.update({
    where: { id: userId },
    data,
    select: { id: true, name: true, email: true, enabledMealSlots: true, hiddenNavItems: true, bio: true, avatarUrl: true, role: true },
  });

  // Update household name if provided (owners only)
  if (body.householdName) {
    const currentUser = await prisma.user.findUnique({ where: { id: userId } });
    if (currentUser?.role === "OWNER") {
      await prisma.household.update({
        where: { id: householdId },
        data: { name: body.householdName },
      });
    }
  }

  return NextResponse.json(user);
}
