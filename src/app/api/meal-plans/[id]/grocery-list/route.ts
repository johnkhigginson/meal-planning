import { NextRequest, NextResponse } from "next/server";
import { requireUserId } from "@/lib/auth";
import { generateGroceryList, saveGroceryList } from "@/lib/grocery";

type RouteParams = { params: Promise<{ id: string }> };

export async function POST(_request: NextRequest, { params }: RouteParams) {
  const userId = await requireUserId();
  const { id } = await params;
  const mealPlanId = parseInt(id, 10);

  const { items } = await generateGroceryList(mealPlanId, userId);
  const groceryListId = await saveGroceryList(mealPlanId, userId, items);

  return NextResponse.json({ groceryListId, items }, { status: 201 });
}
