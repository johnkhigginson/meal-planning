import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireHouseholdId } from "@/lib/auth";

type RouteParams = { params: Promise<{ id: string }> };

export async function PUT(request: NextRequest, { params }: RouteParams) {
  const householdId = await requireHouseholdId();
  const { id } = await params;
  const storeId = parseInt(id, 10);
  const body = await request.json();

  const existing = await prisma.store.findFirst({ where: { id: storeId, householdId } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const data: Record<string, unknown> = {};
  if (body.name !== undefined) data.name = body.name;
  if (body.isFavorite !== undefined) data.isFavorite = body.isFavorite;
  if (body.krogerLocationId !== undefined) data.krogerLocationId = body.krogerLocationId;

  const store = await prisma.store.update({ where: { id: storeId }, data });
  return NextResponse.json(store);
}

export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  const householdId = await requireHouseholdId();
  const { id } = await params;
  const storeId = parseInt(id, 10);
  const existing = await prisma.store.findFirst({ where: { id: storeId, householdId } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await prisma.store.delete({ where: { id: storeId } });
  return NextResponse.json({ success: true });
}
