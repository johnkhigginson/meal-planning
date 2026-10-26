import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { createIngredientSchema } from "@/lib/validators";
import { guessIngredientCategory } from "@/lib/ingredient-category";
import { findIngredient } from "@/lib/ingredient-parse";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q") || "";

  const ingredients = await prisma.ingredient.findMany({
    where: q ? { name: { contains: q } } : undefined,
    include: { defaultUnit: true },
    orderBy: { name: "asc" },
    take: 50,
  });
  return NextResponse.json(ingredients);
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const body = await request.json();
  const parsed = createIngredientSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  // An existing row with the same name (any case, singular or plural) is
  // returned instead of a duplicate. A new ingredient gets a best-guess aisle
  // for the grocery list.
  const existing = await findIngredient(parsed.data.name);
  if (existing) return NextResponse.json(existing, { status: 201 });

  // Upsert so two saves adding the same new name at once both get the row,
  // not a 500.
  const ingredient = await prisma.ingredient.upsert({
    where: { name: parsed.data.name },
    update: {},
    create: {
      ...parsed.data,
      category: parsed.data.category ?? guessIngredientCategory(parsed.data.name),
    },
    include: { defaultUnit: true },
  });
  return NextResponse.json(ingredient, { status: 201 });
}
