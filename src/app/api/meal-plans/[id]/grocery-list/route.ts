import { NextRequest, NextResponse } from "next/server";
import { requireHouseholdId } from "@/lib/auth";
import { generateGroceryList, saveGroceryList } from "@/lib/grocery";

type RouteParams = { params: Promise<{ id: string }> };

export async function POST(_request: NextRequest, { params }: RouteParams) {
  const householdId = await requireHouseholdId();
  const { id } = await params;
  const mealPlanId = parseInt(id, 10);
  if (Number.isNaN(mealPlanId)) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Scoped to the caller's household, so another household's plan is a 404.
  const generated = await generateGroceryList(mealPlanId, householdId);
  if (!generated) return NextResponse.json({ error: "Meal plan not found" }, { status: 404 });
  const { items } = generated;
  const groceryListId = await saveGroceryList(mealPlanId, householdId, items);

  return NextResponse.json({ groceryListId, items }, { status: 201 });
}
