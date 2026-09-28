import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireHouseholdId } from "@/lib/auth";
import { loadGroceryList } from "@/lib/grocery";

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: RouteParams) {
  const householdId = await requireHouseholdId();
  const { id } = await params;
  const listId = parseInt(id, 10);
  if (Number.isNaN(listId)) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const list = await loadGroceryList(listId, householdId);
  if (!list) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(list);
}

export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  const householdId = await requireHouseholdId();
  const { id } = await params;
  const listId = parseInt(id, 10);
  if (Number.isNaN(listId)) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Items cascade with the list.
  const result = await prisma.groceryList.deleteMany({ where: { id: listId, householdId } });
  if (result.count === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ success: true });
}

export async function PUT(request: NextRequest, { params }: RouteParams) {
  const householdId = await requireHouseholdId();
  const { id } = await params;
  const listId = parseInt(id, 10);
  if (Number.isNaN(listId)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const body = await request.json();

  const existing = await prisma.groceryList.findFirst({ where: { id: listId, householdId } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (Number.isInteger(body.itemId) && typeof body.checked === "boolean") {
    // updateMany scopes to this list, so a foreign itemId is a no-op (not a 500).
    await prisma.groceryListItem.updateMany({
      where: { id: body.itemId, groceryListId: listId },
      data: { checked: body.checked },
    });
  }

  return NextResponse.json(await loadGroceryList(listId, householdId));
}
