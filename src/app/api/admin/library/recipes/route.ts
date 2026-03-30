import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireContributor } from "@/lib/auth";

export async function GET() {
  await requireContributor();

  const recipes = await prisma.libraryRecipe.findMany({
    include: {
      ingredients: {
        include: { ingredient: true, unit: true },
        orderBy: { sortOrder: "asc" },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(recipes);
}

export async function POST(request: NextRequest) {
  await requireContributor();
  const body = await request.json();

  const recipe = await prisma.libraryRecipe.create({
    data: {
      name: body.name,
      description: body.description || null,
      instructions: body.instructions,
      servings: body.servings,
      prepTimeMinutes: body.prepTimeMinutes || null,
      cookTimeMinutes: body.cookTimeMinutes || null,
      sourceType: body.sourceType || "PERSONAL",
      sourceUrl: body.sourceUrl || null,
      category: body.category || null,
      ingredients: body.ingredients?.length
        ? {
            create: body.ingredients.map(
              (
                ing: { ingredientId: number; quantity: number; unitId: number; notes?: string; optional?: boolean },
                idx: number
              ) => ({
                ingredientId: ing.ingredientId,
                quantity: ing.quantity,
                unitId: ing.unitId,
                notes: ing.notes || null,
                optional: ing.optional || false,
                sortOrder: idx,
              })
            ),
          }
        : undefined,
    },
    include: {
      ingredients: {
        include: { ingredient: true, unit: true },
        orderBy: { sortOrder: "asc" },
      },
    },
  });

  return NextResponse.json(recipe, { status: 201 });
}

export async function DELETE(request: NextRequest) {
  await requireContributor();
  const { searchParams } = new URL(request.url);
  const id = parseInt(searchParams.get("id") || "0", 10);
  if (!id) return NextResponse.json({ error: "ID required" }, { status: 400 });

  await prisma.libraryRecipe.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
