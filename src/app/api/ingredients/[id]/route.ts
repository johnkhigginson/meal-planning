import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { INGREDIENT_CATEGORIES } from "@/lib/constants";

type RouteParams = { params: Promise<{ id: string }> };

const updateCategorySchema = z.object({ category: z.enum(INGREDIENT_CATEGORIES) });

// Move an ingredient to another grocery aisle. Ingredients are shared across
// households, the same as creating one, so any signed-in user may set this.
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { id } = await params;
  const ingredientId = parseInt(id, 10);
  if (Number.isNaN(ingredientId)) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const parsed = updateCategorySchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const result = await prisma.ingredient.updateMany({
    where: { id: ingredientId },
    data: { category: parsed.data.category },
  });
  if (result.count === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ id: ingredientId, category: parsed.data.category });
}
