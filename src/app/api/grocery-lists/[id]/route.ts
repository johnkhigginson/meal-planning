import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireHouseholdId } from "@/lib/auth";

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: RouteParams) {
  const householdId = await requireHouseholdId();
  const { id } = await params;
  const list = await prisma.groceryList.findFirst({
    where: { id: parseInt(id, 10), householdId },
    include: { items: { include: { ingredient: true, unit: true }, orderBy: { ingredient: { name: "asc" } } } },
  });
  if (!list) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(list);
}

export async function PUT(request: NextRequest, { params }: RouteParams) {
  const householdId = await requireHouseholdId();
  const { id } = await params;
  const listId = parseInt(id, 10);
  const body = await request.json();

  const existing = await prisma.groceryList.findFirst({ where: { id: listId, householdId } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (body.itemId && body.checked !== undefined) {
    await prisma.groceryListItem.update({ where: { id: body.itemId, groceryListId: listId }, data: { checked: body.checked } });
  }

  const list = await prisma.groceryList.findUnique({
    where: { id: listId },
    include: { items: { include: { ingredient: true, unit: true }, orderBy: { ingredient: { name: "asc" } } } },
  });
  return NextResponse.json(list);
}
