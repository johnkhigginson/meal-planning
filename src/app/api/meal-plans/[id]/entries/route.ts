import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireHouseholdId } from "@/lib/auth";
import { addMealPlanEntrySchema } from "@/lib/validators";

type RouteParams = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, { params }: RouteParams) {
  const householdId = await requireHouseholdId();
  const { id } = await params;
  const mealPlanId = parseInt(id, 10);
  if (Number.isNaN(mealPlanId)) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await request.json();
  const parsed = addMealPlanEntrySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { recipeId, customName } = parsed.data;

  // The meal plan must belong to the caller's household.
  const plan = await prisma.mealPlan.findFirst({ where: { id: mealPlanId, householdId }, select: { id: true } });
  if (!plan) return NextResponse.json({ error: "Meal plan not found" }, { status: 404 });

  // A recipe-backed entry's recipe must belong to the household too. Free-text
  // meals reference nothing, so there's nothing further to authorize.
  if (recipeId != null) {
    const recipe = await prisma.recipe.findFirst({
      where: { id: recipeId, householdId },
      select: { id: true },
    });
    if (!recipe) return NextResponse.json({ error: "Recipe not found" }, { status: 404 });
  }

  const entry = await prisma.mealPlanEntry.create({
    data: {
      mealPlanId,
      recipeId: recipeId ?? null,
      customName: recipeId != null ? null : customName!.trim(),
      date: new Date(parsed.data.date),
      mealSlot: parsed.data.mealSlot,
      servings: parsed.data.servings,
    },
    include: { recipe: true },
  });

  return NextResponse.json(entry, { status: 201 });
}
