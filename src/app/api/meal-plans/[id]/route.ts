import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth";

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: RouteParams) {
  const userId = await requireUserId();
  const { id } = await params;
  const plan = await prisma.mealPlan.findFirst({
    where: { id: parseInt(id, 10), userId },
    include: {
      entries: {
        include: { recipe: true },
        orderBy: [{ date: "asc" }, { mealSlot: "asc" }],
      },
    },
  });

  if (!plan) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json(plan);
}

export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  const userId = await requireUserId();
  const { id } = await params;
  const planId = parseInt(id, 10);

  const existing = await prisma.mealPlan.findFirst({ where: { id: planId, userId } });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await prisma.mealPlan.delete({ where: { id: planId } });
  return NextResponse.json({ success: true });
}
