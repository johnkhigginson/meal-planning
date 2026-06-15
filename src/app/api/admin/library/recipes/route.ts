import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireContributor } from "@/lib/auth";

async function ensureContributor(): Promise<NextResponse | null> {
  try {
    await requireContributor();
    return null;
  } catch {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }
}

export async function GET() {
  const denied = await ensureContributor();
  if (denied) return denied;

  const recipes = await prisma.libraryRecipe.findMany({
    include: {
      ingredients: { include: { ingredient: true, unit: true }, orderBy: { sortOrder: "asc" } },
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
  });

  return NextResponse.json(recipes);
}

export async function POST(request: NextRequest) {
  const denied = await ensureContributor();
  if (denied) return denied;
  const body = await request.json();

  if (typeof body.name !== "string" || !body.name.trim() || typeof body.instructions !== "string") {
    return NextResponse.json({ error: "Name and instructions are required" }, { status: 400 });
  }
  const servings = Number.isInteger(body.servings) && body.servings > 0 ? body.servings : 1;

  const recipe = await prisma.libraryRecipe.create({
    data: {
      name: body.name.slice(0, 300),
      description: body.description || null,
      instructions: body.instructions,
      servings,
      prepTimeMinutes: Number.isInteger(body.prepTimeMinutes) ? body.prepTimeMinutes : null,
      cookTimeMinutes: Number.isInteger(body.cookTimeMinutes) ? body.cookTimeMinutes : null,
      sourceType: typeof body.sourceType === "string" ? body.sourceType : "PERSONAL",
      sourceUrl: body.sourceUrl || null,
      category: body.category || null,
      ingredients: Array.isArray(body.ingredients) && body.ingredients.length
        ? {
            create: body.ingredients
              .filter(
                (ing: { ingredientId?: number; quantity?: number; unitId?: number }) =>
                  Number.isInteger(ing.ingredientId) && typeof ing.quantity === "number" && Number.isInteger(ing.unitId)
              )
              .map(
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
      ingredients: { include: { ingredient: true, unit: true }, orderBy: { sortOrder: "asc" } },
    },
  });

  return NextResponse.json(recipe, { status: 201 });
}

export async function DELETE(request: NextRequest) {
  const denied = await ensureContributor();
  if (denied) return denied;
  const { searchParams } = new URL(request.url);
  const id = parseInt(searchParams.get("id") || "0", 10);
  if (!id) return NextResponse.json({ error: "ID required" }, { status: 400 });

  await prisma.libraryRecipe.deleteMany({ where: { id } });
  return NextResponse.json({ success: true });
}
