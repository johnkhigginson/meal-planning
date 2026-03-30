import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireHouseholdId } from "@/lib/auth";

export async function GET(request: NextRequest) {
  await requireHouseholdId();
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q") || "";

  const where = q ? { name: { contains: q } } : {};

  const recipes = await prisma.libraryRecipe.findMany({
    where,
    include: {
      ingredients: {
        include: { ingredient: true, unit: true },
        orderBy: { sortOrder: "asc" },
      },
    },
    orderBy: { name: "asc" },
  });

  return NextResponse.json(recipes);
}

// Import a library recipe into the user's household
export async function POST(request: NextRequest) {
  const householdId = await requireHouseholdId();
  const { libraryRecipeId } = await request.json();

  const libRecipe = await prisma.libraryRecipe.findUnique({
    where: { id: libraryRecipeId },
    include: { ingredients: true },
  });

  if (!libRecipe) {
    return NextResponse.json({ error: "Recipe not found" }, { status: 404 });
  }

  const recipe = await prisma.recipe.create({
    data: {
      householdId,
      name: libRecipe.name,
      description: libRecipe.description,
      instructions: libRecipe.instructions,
      servings: libRecipe.servings,
      prepTimeMinutes: libRecipe.prepTimeMinutes,
      cookTimeMinutes: libRecipe.cookTimeMinutes,
      sourceType: libRecipe.sourceType,
      sourceUrl: libRecipe.sourceUrl,
      ingredients: {
        create: libRecipe.ingredients.map((ing) => ({
          ingredientId: ing.ingredientId,
          quantity: ing.quantity,
          unitId: ing.unitId,
          notes: ing.notes,
          optional: ing.optional,
          sortOrder: ing.sortOrder,
        })),
      },
    },
  });

  return NextResponse.json(recipe, { status: 201 });
}
