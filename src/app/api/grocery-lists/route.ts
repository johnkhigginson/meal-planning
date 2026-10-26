import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireHouseholdId } from "@/lib/auth";
import { createBlankList, findCurrentPlan, parseWeekOf } from "@/lib/grocery";

// The household's saved grocery lists, newest first, for reopening one later,
// plus the plan the page should follow (?weekOf=YYYY-MM-DD, this week's Monday)
// and the newest list made from it.
export async function GET(request: NextRequest) {
  const householdId = await requireHouseholdId();
  const weekOf = parseWeekOf(request.nextUrl.searchParams.get("weekOf"));
  const [lists, currentPlan] = await Promise.all([
    prisma.groceryList.findMany({
      where: { householdId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 30,
      select: {
        id: true,
        name: true,
        createdAt: true,
        mealPlanId: true,
        mealPlan: { select: { weekStartDate: true } },
        _count: { select: { items: true } },
      },
    }),
    findCurrentPlan(householdId, weekOf),
  ]);

  // Not limited to the 30 above, so an old plan still finds its list.
  const currentList = currentPlan.id
    ? await prisma.groceryList.findFirst({
        where: { householdId, mealPlanId: currentPlan.id },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        select: { id: true },
      })
    : null;

  return NextResponse.json({ lists, currentPlan, currentListId: currentList?.id ?? null });
}

// Starts a blank list to fill in by hand.
export async function POST() {
  const householdId = await requireHouseholdId();
  const groceryListId = await createBlankList(householdId);
  return NextResponse.json({ groceryListId }, { status: 201 });
}
