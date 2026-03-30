import { NextRequest, NextResponse } from "next/server";
import { requireHouseholdId } from "@/lib/auth";
import { generateGroceryList, saveGroceryList } from "@/lib/grocery";

type RouteParams = { params: Promise<{ id: string }> };

export async function POST(_request: NextRequest, { params }: RouteParams) {
  const householdId = await requireHouseholdId();
  const { id } = await params;
  const mealPlanId = parseInt(id, 10);

  const { items } = await generateGroceryList(mealPlanId, householdId);
  const groceryListId = await saveGroceryList(mealPlanId, householdId, items);

  return NextResponse.json({ groceryListId, items }, { status: 201 });
}
