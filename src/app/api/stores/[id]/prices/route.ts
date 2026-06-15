import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireHouseholdId } from "@/lib/auth";
import { storePriceSchema } from "@/lib/validators";

type RouteParams = { params: Promise<{ id: string }> };

// Confirms the store belongs to the caller's household; returns its id or null.
async function ownedStoreId(id: string, householdId: number): Promise<number | null> {
  const storeId = parseInt(id, 10);
  if (Number.isNaN(storeId)) return null;
  const store = await prisma.store.findFirst({ where: { id: storeId, householdId }, select: { id: true } });
  return store ? storeId : null;
}

export async function GET(_request: NextRequest, { params }: RouteParams) {
  const householdId = await requireHouseholdId();
  const { id } = await params;
  const storeId = await ownedStoreId(id, householdId);
  if (storeId === null) return NextResponse.json({ error: "Store not found" }, { status: 404 });

  const prices = await prisma.storePrice.findMany({
    where: { storeId },
    include: { ingredient: true, unit: true },
    orderBy: { ingredient: { name: "asc" } },
  });
  return NextResponse.json(prices);
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  const householdId = await requireHouseholdId();
  const { id } = await params;
  const storeId = await ownedStoreId(id, householdId);
  if (storeId === null) return NextResponse.json({ error: "Store not found" }, { status: 404 });

  const body = await request.json();
  const parsed = storePriceSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const price = await prisma.storePrice.upsert({
    where: { storeId_ingredientId: { storeId, ingredientId: parsed.data.ingredientId } },
    update: {
      price: parsed.data.price,
      quantity: parsed.data.quantity,
      unitId: parsed.data.unitId,
      lastUpdated: new Date(),
    },
    create: {
      storeId,
      ingredientId: parsed.data.ingredientId,
      price: parsed.data.price,
      quantity: parsed.data.quantity,
      unitId: parsed.data.unitId,
    },
    include: { ingredient: true, unit: true },
  });

  return NextResponse.json(price, { status: 201 });
}

export async function DELETE(request: NextRequest) {
  const householdId = await requireHouseholdId();
  const { searchParams } = new URL(request.url);
  const priceId = parseInt(searchParams.get("priceId") || "0", 10);
  if (!priceId) return NextResponse.json({ error: "Price ID required" }, { status: 400 });

  // Only delete a price whose store belongs to the caller's household.
  const result = await prisma.storePrice.deleteMany({
    where: { id: priceId, store: { householdId } },
  });
  if (result.count === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ success: true });
}
