import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireHouseholdId } from "@/lib/auth";

type RouteParams = { params: Promise<{ id: string }> };

export async function PUT(request: NextRequest, { params }: RouteParams) {
  const householdId = await requireHouseholdId();
  const { id } = await params;
  const storeId = parseInt(id, 10);
  if (Number.isNaN(storeId)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const body = await request.json();

  const existing = await prisma.store.findFirst({ where: { id: storeId, householdId } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const data: Record<string, unknown> = {};
  if (typeof body.name === "string") data.name = body.name.slice(0, 200);
  if (typeof body.isFavorite === "boolean") data.isFavorite = body.isFavorite;
  if (body.krogerLocationId === null || typeof body.krogerLocationId === "string") {
    data.krogerLocationId = body.krogerLocationId;
  }

  const store = await prisma.store.update({ where: { id: storeId }, data });
  return NextResponse.json(store);
}

export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  const householdId = await requireHouseholdId();
  const { id } = await params;
  const storeId = parseInt(id, 10);
  if (Number.isNaN(storeId)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const existing = await prisma.store.findFirst({ where: { id: storeId, householdId } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await prisma.store.delete({ where: { id: storeId } });
  return NextResponse.json({ success: true });
}
