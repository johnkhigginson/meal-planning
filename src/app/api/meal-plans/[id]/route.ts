import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireHouseholdId } from "@/lib/auth";

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: RouteParams) {
  const householdId = await requireHouseholdId();
  const { id } = await params;
  const plan = await prisma.mealPlan.findFirst({
    where: { id: parseInt(id, 10), householdId },
    include: { entries: { include: { recipe: true }, orderBy: [{ date: "asc" }, { mealSlot: "asc" }] } },
  });
  if (!plan) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(plan);
}

export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  const householdId = await requireHouseholdId();
  const { id } = await params;
  const existing = await prisma.mealPlan.findFirst({ where: { id: parseInt(id, 10), householdId } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await prisma.mealPlan.delete({ where: { id: parseInt(id, 10) } });
  return NextResponse.json({ success: true });
}
