import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { addMealPlanEntrySchema } from "@/lib/validators";

type RouteParams = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  const mealPlanId = parseInt(id, 10);
  const body = await request.json();
  const parsed = addMealPlanEntrySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const entry = await prisma.mealPlanEntry.create({
    data: {
      mealPlanId,
      recipeId: parsed.data.recipeId,
      date: new Date(parsed.data.date),
      mealSlot: parsed.data.mealSlot,
      servings: parsed.data.servings,
    },
    include: { recipe: true },
  });

  return NextResponse.json(entry, { status: 201 });
}
