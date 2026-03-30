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
  const { userId } = await requireUser();
  const body = await request.json();

  const data: Record<string, unknown> = {};
  if (body.name) data.name = body.name;
  if (body.enabledMealSlots) data.enabledMealSlots = body.enabledMealSlots;

  const user = await prisma.user.update({
    where: { id: userId },
    data,
    select: { id: true, name: true, email: true, enabledMealSlots: true, role: true },
  });

  return NextResponse.json(user);
}
