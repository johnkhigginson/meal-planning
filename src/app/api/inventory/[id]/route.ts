import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth";
import { updateInventorySchema } from "@/lib/validators";

type RouteParams = { params: Promise<{ id: string }> };

export async function PUT(request: NextRequest, { params }: RouteParams) {
  const userId = await requireUserId();
  const { id } = await params;
  const itemId = parseInt(id, 10);
  const body = await request.json();
  const parsed = updateInventorySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const existing = await prisma.inventoryItem.findFirst({ where: { id: itemId, userId } });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const data: Record<string, unknown> = {};
  if (parsed.data.quantity !== undefined) data.quantity = parsed.data.quantity;
  if (parsed.data.unitId !== undefined) data.unitId = parsed.data.unitId;
  if (parsed.data.expirationDate !== undefined) {
    data.expirationDate = parsed.data.expirationDate
      ? new Date(parsed.data.expirationDate)
      : null;
  }

  const item = await prisma.inventoryItem.update({
    where: { id: itemId },
    data,
    include: { ingredient: true, unit: true },
  });

  return NextResponse.json(item);
}

export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  const userId = await requireUserId();
  const { id } = await params;
  const itemId = parseInt(id, 10);

  const existing = await prisma.inventoryItem.findFirst({ where: { id: itemId, userId } });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await prisma.inventoryItem.delete({ where: { id: itemId } });
  return NextResponse.json({ success: true });
}
