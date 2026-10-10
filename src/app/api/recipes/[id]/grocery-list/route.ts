import { NextRequest, NextResponse } from "next/server";
import { requireHouseholdId } from "@/lib/auth";
import { addRecipeToGroceryList } from "@/lib/grocery";

type RouteParams = { params: Promise<{ id: string }> };

// Adds the recipe's ingredients the pantry doesn't cover to the grocery list.
// Body (optional): { servings } to scale the recipe first.
export async function POST(request: NextRequest, { params }: RouteParams) {
  const householdId = await requireHouseholdId();
  const { id } = await params;
  const recipeId = parseInt(id, 10);
  if (Number.isNaN(recipeId)) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await request.json().catch(() => ({}));
  const servings = body?.servings;
  if (servings !== undefined && !(typeof servings === "number" && Number.isFinite(servings) && servings > 0)) {
    return NextResponse.json({ error: "servings must be a positive number" }, { status: 400 });
  }

  // Scoped to the caller's household, so another household's recipe is a 404.
  const result = await addRecipeToGroceryList(recipeId, householdId, servings);
  if (!result) return NextResponse.json({ error: "Recipe not found" }, { status: 404 });
  return NextResponse.json(result);
}
