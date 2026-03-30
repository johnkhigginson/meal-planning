import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireHouseholdId } from "@/lib/auth";
import { upsertInventorySchema } from "@/lib/validators";

export async function GET() {
  const householdId = await requireHouseholdId();
  const items = await prisma.inventoryItem.findMany({
    where: { householdId },
    include: { ingredient: true, unit: true },
    orderBy: { ingredient: { name: "asc" } },
  });
  return NextResponse.json(items);
}

export async function POST(request: NextRequest) {
  const householdId = await requireHouseholdId();
  const body = await request.json();
  const parsed = upsertInventorySchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const item = await prisma.inventoryItem.upsert({
    where: { householdId_ingredientId: { householdId, ingredientId: parsed.data.ingredientId } },
    update: {
      quantity: parsed.data.quantity,
      unitId: parsed.data.unitId,
      expirationDate: parsed.data.expirationDate ? new Date(parsed.data.expirationDate) : null,
    },
    create: {
      householdId,
      ingredientId: parsed.data.ingredientId,
      quantity: parsed.data.quantity,
      unitId: parsed.data.unitId,
      expirationDate: parsed.data.expirationDate ? new Date(parsed.data.expirationDate) : null,
    },
    include: { ingredient: true, unit: true },
  });

  return NextResponse.json(item, { status: 201 });
}
