import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireHouseholdId } from "@/lib/auth";
import { createRecipeSchema } from "@/lib/validators";

export async function GET(request: NextRequest) {
  const householdId = await requireHouseholdId();
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q") || "";
  const sourceType = searchParams.get("sourceType");
  const tagIds = searchParams.get("tagIds");
  const favoritesOnly = searchParams.get("favorites") === "true";
  const page = parseInt(searchParams.get("page") || "1", 10);
  const limit = parseInt(searchParams.get("limit") || "20", 10);

  const where: Record<string, unknown> = { householdId };

  if (q) {
    where.OR = [
      { name: { contains: q } },
      { description: { contains: q } },
    ];
  }
  if (sourceType) where.sourceType = sourceType;
  if (favoritesOnly) where.isFavorite = true;
  if (tagIds) {
    const ids = tagIds.split(",").map(Number).filter(Boolean);
    if (ids.length > 0) where.tags = { some: { tagId: { in: ids } } };
  }

  const [recipes, total] = await Promise.all([
    prisma.recipe.findMany({
      where,
      include: {
        ingredients: { include: { ingredient: true, unit: true }, orderBy: { sortOrder: "asc" } },
        tags: { include: { tag: true } },
      },
      orderBy: { updatedAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.recipe.count({ where }),
  ]);

  return NextResponse.json({ recipes, total, page, limit });
}

export async function POST(request: NextRequest) {
  const householdId = await requireHouseholdId();
  const body = await request.json();
  const parsed = createRecipeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { ingredients, tagIds, ...recipeData } = parsed.data;

  // An author, if set, must be a member of the same household (mirrors PUT).
  if (recipeData.authorId != null) {
    const member = await prisma.user.findFirst({
      where: { id: recipeData.authorId, householdId },
      select: { id: true },
    });
    if (!member) {
      return NextResponse.json({ error: "Author must be a household member" }, { status: 400 });
    }
  }

  const recipe = await prisma.recipe.create({
    data: {
      ...recipeData,
      householdId,
      ingredients: {
        create: ingredients.map((ing, idx) => ({
          ingredientId: ing.ingredientId,
          quantity: ing.quantity,
          unitId: ing.unitId,
          notes: ing.notes,
          optional: ing.optional,
          sortOrder: ing.sortOrder ?? idx,
        })),
      },
      tags: { create: tagIds.map((tagId) => ({ tagId })) },
    },
    include: {
      ingredients: { include: { ingredient: true, unit: true }, orderBy: { sortOrder: "asc" } },
      tags: { include: { tag: true } },
    },
  });

  return NextResponse.json(recipe, { status: 201 });
}
