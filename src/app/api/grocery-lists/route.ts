import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireHouseholdId } from "@/lib/auth";

// The household's saved grocery lists, newest first, for reopening one later.
export async function GET() {
  const householdId = await requireHouseholdId();
  const lists = await prisma.groceryList.findMany({
    where: { householdId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: 30,
    select: {
      id: true,
      name: true,
      createdAt: true,
      mealPlanId: true,
      _count: { select: { items: true } },
    },
  });
  return NextResponse.json(lists);
}
