import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireHouseholdId, requireUser } from "@/lib/auth";
import { updateRecipeSchema } from "@/lib/validators";
import { audit } from "@/lib/audit";

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: RouteParams) {
  const householdId = await requireHouseholdId();
  const { id } = await params;
  const recipeId = parseInt(id, 10);
  if (Number.isNaN(recipeId)) return NextResponse.json({ error: "Recipe not found" }, { status: 404 });
  const recipe = await prisma.recipe.findFirst({
    where: { id: recipeId, householdId },
    include: {
      ingredients: { include: { ingredient: true, unit: true }, orderBy: { sortOrder: "asc" } },
      tags: { include: { tag: true } },
    },
  });
  if (!recipe) return NextResponse.json({ error: "Recipe not found" }, { status: 404 });
  return NextResponse.json(recipe);
}

export async function PUT(request: NextRequest, { params }: RouteParams) {
  const user = await requireUser();
  const householdId = user.householdId;
  const { id } = await params;
  const recipeId = parseInt(id, 10);
  if (Number.isNaN(recipeId)) return NextResponse.json({ error: "Recipe not found" }, { status: 404 });
  const body = await request.json();
  const parsed = updateRecipeSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const existing = await prisma.recipe.findFirst({ where: { id: recipeId, householdId } });
  if (!existing) return NextResponse.json({ error: "Recipe not found" }, { status: 404 });

  const { ingredients, tagIds, ...recipeData } = parsed.data;

  // An author must be a member of the same household.
  if (recipeData.authorId != null) {
    const member = await prisma.user.findFirst({
      where: { id: recipeData.authorId, householdId },
      select: { id: true },
    });
    if (!member) {
      return NextResponse.json({ error: "Author must be a household member" }, { status: 400 });
    }
  }

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

  await audit({
    category: "RECIPE",
    action: "RECIPE_UPDATED",
    summary: `${user.name} edited recipe “${updated?.name ?? existing.name}”`,
    actorUserId: user.userId,
    actorName: user.name,
    householdId,
    targetType: "RECIPE",
    targetId: recipeId,
  });

  return NextResponse.json(updated);
}

export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  const user = await requireUser();
  const householdId = user.householdId;
  const { id } = await params;
  const recipeId = parseInt(id, 10);
  if (Number.isNaN(recipeId)) return NextResponse.json({ error: "Recipe not found" }, { status: 404 });
  const existing = await prisma.recipe.findFirst({ where: { id: recipeId, householdId } });
  if (!existing) return NextResponse.json({ error: "Recipe not found" }, { status: 404 });

  // Remove rows that reference this recipe with onDelete: NoAction (book
  // entries, meal-plan entries, share links) before deleting it — otherwise the
  // FK constraint blocks the delete. Ingredients/tags/notes/comments cascade.
  await prisma.$transaction([
    prisma.recipeBookEntry.deleteMany({ where: { recipeId } }),
    prisma.mealPlanEntry.deleteMany({ where: { recipeId } }),
    prisma.shareLink.deleteMany({ where: { recipeId } }),
    prisma.recipe.delete({ where: { id: recipeId } }),
  ]);

  await audit({
    category: "RECIPE",
    action: "RECIPE_DELETED",
    summary: `${user.name} deleted recipe “${existing.name}”`,
    actorUserId: user.userId,
    actorName: user.name,
    householdId,
    targetType: "RECIPE",
    targetId: recipeId,
  });

  return NextResponse.json({ success: true });
}
