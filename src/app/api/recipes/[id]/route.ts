import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireHouseholdId } from "@/lib/auth";
import { updateRecipeSchema } from "@/lib/validators";

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: RouteParams) {
  const householdId = await requireHouseholdId();
  const { id } = await params;
  const recipe = await prisma.recipe.findFirst({
    where: { id: parseInt(id, 10), householdId },
    include: {
      ingredients: { include: { ingredient: true, unit: true }, orderBy: { sortOrder: "asc" } },
      tags: { include: { tag: true } },
    },
  });
  if (!recipe) return NextResponse.json({ error: "Recipe not found" }, { status: 404 });
  return NextResponse.json(recipe);
}

export async function PUT(request: NextRequest, { params }: RouteParams) {
  const householdId = await requireHouseholdId();
  const { id } = await params;
  const recipeId = parseInt(id, 10);
  const body = await request.json();
  const parsed = updateRecipeSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const existing = await prisma.recipe.findFirst({ where: { id: recipeId, householdId } });
  if (!existing) return NextResponse.json({ error: "Recipe not found" }, { status: 404 });

  const { ingredients, tagIds, ...recipeData } = parsed.data;
  await prisma.recipe.update({ where: { id: recipeId }, data: recipeData });

  if (ingredients) {
    await prisma.recipeIngredient.deleteMany({ where: { recipeId } });
    await prisma.recipeIngredient.createMany({
      data: ingredients.map((ing, idx) => ({
        recipeId, ingredientId: ing.ingredientId, quantity: ing.quantity,
        unitId: ing.unitId, notes: ing.notes, optional: ing.optional, sortOrder: ing.sortOrder ?? idx,
      })),
    });
  }
  if (tagIds) {
    await prisma.recipeTag.deleteMany({ where: { recipeId } });
    if (tagIds.length > 0) await prisma.recipeTag.createMany({ data: tagIds.map((tagId) => ({ recipeId, tagId })) });
  }

  const updated = await prisma.recipe.findUnique({
    where: { id: recipeId },
    include: {
      ingredients: { include: { ingredient: true, unit: true }, orderBy: { sortOrder: "asc" } },
      tags: { include: { tag: true } },
    },
  });
  return NextResponse.json(updated);
}

export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  const householdId = await requireHouseholdId();
  const { id } = await params;
  const recipeId = parseInt(id, 10);
  const existing = await prisma.recipe.findFirst({ where: { id: recipeId, householdId } });
  if (!existing) return NextResponse.json({ error: "Recipe not found" }, { status: 404 });
  await prisma.recipe.delete({ where: { id: recipeId } });
  return NextResponse.json({ success: true });
}
