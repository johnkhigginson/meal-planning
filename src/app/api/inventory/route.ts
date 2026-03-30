import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth";
import { upsertInventorySchema } from "@/lib/validators";

export async function GET() {
  const userId = await requireUserId();
  const items = await prisma.inventoryItem.findMany({
    where: { userId },
    include: { ingredient: true, unit: true },
    orderBy: { ingredient: { name: "asc" } },
  });
  return NextResponse.json(items);
}

export async function POST(request: NextRequest) {
  const userId = await requireUserId();
  const body = await request.json();
  const parsed = upsertInventorySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const item = await prisma.inventoryItem.upsert({
    where: {
      userId_ingredientId: {
        userId,
        ingredientId: parsed.data.ingredientId,
      },
    },
    update: {
      quantity: parsed.data.quantity,
      unitId: parsed.data.unitId,
      expirationDate: parsed.data.expirationDate
        ? new Date(parsed.data.expirationDate)
        : null,
    },
    create: {
      userId,
      ingredientId: parsed.data.ingredientId,
      quantity: parsed.data.quantity,
      unitId: parsed.data.unitId,
      expirationDate: parsed.data.expirationDate
        ? new Date(parsed.data.expirationDate)
        : null,
    },
    include: { ingredient: true, unit: true },
  });

  return NextResponse.json(item, { status: 201 });
}
