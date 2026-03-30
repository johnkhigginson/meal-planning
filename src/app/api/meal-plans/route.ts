import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth";
import { createMealPlanSchema } from "@/lib/validators";

export async function GET(request: NextRequest) {
  const userId = await requireUserId();
  const { searchParams } = new URL(request.url);
  const weekOf = searchParams.get("weekOf");

  const where: Record<string, unknown> = { userId };
  if (weekOf) where.weekStartDate = new Date(weekOf);

  const plans = await prisma.mealPlan.findMany({
    where,
    include: {
      entries: {
        include: { recipe: true },
        orderBy: [{ date: "asc" }, { mealSlot: "asc" }],
      },
    },
    orderBy: { weekStartDate: "desc" },
    take: 10,
  });

  return NextResponse.json(plans);
}

export async function POST(request: NextRequest) {
  const userId = await requireUserId();
  const body = await request.json();
  const parsed = createMealPlanSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const weekStartDate = new Date(parsed.data.weekStartDate);
  let plan = await prisma.mealPlan.findUnique({
    where: { userId_weekStartDate: { userId, weekStartDate } },
    include: {
      entries: {
        include: { recipe: true },
        orderBy: [{ date: "asc" }, { mealSlot: "asc" }],
      },
    },
  });

  if (!plan) {
    plan = await prisma.mealPlan.create({
      data: { userId, weekStartDate },
      include: {
        entries: {
          include: { recipe: true },
          orderBy: [{ date: "asc" }, { mealSlot: "asc" }],
        },
      },
    });
  }

  return NextResponse.json(plan, { status: 201 });
}
