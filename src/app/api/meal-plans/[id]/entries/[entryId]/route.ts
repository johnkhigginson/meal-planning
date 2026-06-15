import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireHouseholdId } from "@/lib/auth";

type RouteParams = { params: Promise<{ id: string; entryId: string }> };

export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  const householdId = await requireHouseholdId();
  const { entryId } = await params;
  const id = parseInt(entryId, 10);
  if (Number.isNaN(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Scope the delete to entries whose meal plan belongs to the caller.
  const result = await prisma.mealPlanEntry.deleteMany({
    where: { id, mealPlan: { householdId } },
  });
  if (result.count === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ success: true });
}
