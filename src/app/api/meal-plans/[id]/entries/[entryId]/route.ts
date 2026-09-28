import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireHouseholdId } from "@/lib/auth";
import { moveMealPlanEntrySchema } from "@/lib/validators";

type RouteParams = { params: Promise<{ id: string; entryId: string }> };

const DAY_MS = 24 * 60 * 60 * 1000;

// Move a meal to another day or slot. The target date has to fall inside the
// entry's own plan week, since each week is a separate MealPlan.
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const householdId = await requireHouseholdId();
  const { entryId } = await params;
  const id = parseInt(entryId, 10);
  if (Number.isNaN(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const parsed = moveMealPlanEntrySchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const entry = await prisma.mealPlanEntry.findFirst({
    where: { id, mealPlan: { householdId } },
    select: { id: true, mealPlan: { select: { weekStartDate: true } } },
  });
  if (!entry) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const date = new Date(parsed.data.date);
  const offset = date.getTime() - entry.mealPlan.weekStartDate.getTime();
  if (offset < 0 || offset >= 7 * DAY_MS) {
    return NextResponse.json({ error: "That day isn't in this week's plan" }, { status: 400 });
  }

  const updated = await prisma.mealPlanEntry.update({
    where: { id },
    data: { date, mealSlot: parsed.data.mealSlot },
    include: { recipe: true },
  });
  return NextResponse.json(updated);
}

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
