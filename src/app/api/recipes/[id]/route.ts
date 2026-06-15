import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { updateRecipeSchema } from "@/lib/validators";
import { audit } from "@/lib/audit";
import { isValidAuthor } from "@/lib/collab";
import { tagsAllowedForHousehold } from "@/lib/tags";

type RouteParams = { params: Promise<{ id: string }> };

// A recipe is accessible to its household, or to a collaborator on a cookbook
// that contains it.
function recipeAccessWhere(recipeId: number, user: { userId: number; householdId: number }) {
  return {
    id: recipeId,
    OR: [
      { householdId: user.householdId },
      { bookEntries: { some: { recipeBook: { collaborators: { some: { userId: user.userId } } } } } },
    ],
  };
}

export async function GET(_request: NextRequest, { params }: RouteParams) {
  const user = await requireUser();
  const { id } = await params;
  const recipeId = parseInt(id, 10);
  if (Number.isNaN(recipeId)) return NextResponse.json({ error: "Recipe not found" }, { status: 404 });
  const recipe = await prisma.recipe.findFirst({
    where: recipeAccessWhere(recipeId, user),
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
  const { id } = await params;
  const recipeId = parseInt(id, 10);
  if (Number.isNaN(recipeId)) return NextResponse.json({ error: "Recipe not found" }, { status: 404 });
  const body = await request.json();
  const parsed = updateRecipeSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  // Editable by the owning household or a collaborator on a containing cookbook.
  const existing = await prisma.recipe.findFirst({
    where: recipeAccessWhere(recipeId, user),
    select: { id: true, householdId: true, name: true, bookEntries: { select: { recipeBookId: true } } },
  });
  if (!existing) return NextResponse.json({ error: "Recipe not found" }, { status: 404 });

  const { ingredients, tagIds, ...recipeData } = parsed.data;

  // The author must be a member of the recipe's household OR a collaborator on
  // one of its cookbooks (so cross-household contributors can be credited).
  if (recipeData.authorId != null) {
    const bookIds = existing.bookEntries.map((e) => e.recipeBookId);
    if (!(await isValidAuthor(recipeData.authorId, existing.householdId, bookIds))) {
      return NextResponse.json({ error: "Author must be a household member or cookbook collaborator" }, { status: 400 });
    }
  }

  // Every category must be standard or owned by the recipe's household.
  if (tagIds && !(await tagsAllowedForHousehold(tagIds, existing.householdId))) {
    return NextResponse.json({ error: "A selected category isn't available for this recipe" }, { status: 400 });
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
    householdId: existing.householdId,
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
