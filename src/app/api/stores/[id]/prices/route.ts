import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { storePriceSchema } from "@/lib/validators";

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  const prices = await prisma.storePrice.findMany({
    where: { storeId: parseInt(id, 10) },
    include: { ingredient: true, unit: true },
    orderBy: { ingredient: { name: "asc" } },
  });
  return NextResponse.json(prices);
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  const storeId = parseInt(id, 10);
  const body = await request.json();
  const parsed = storePriceSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const price = await prisma.storePrice.upsert({
    where: {
      storeId_ingredientId: {
        storeId,
        ingredientId: parsed.data.ingredientId,
      },
    },
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
