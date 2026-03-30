import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth";

type RouteParams = { params: Promise<{ id: string }> };

export async function PUT(request: NextRequest, { params }: RouteParams) {
  const userId = await requireUserId();
  const { id } = await params;
  const storeId = parseInt(id, 10);
  const body = await request.json();

  const existing = await prisma.store.findFirst({ where: { id: storeId, userId } });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const store = await prisma.store.update({
    where: { id: storeId },
    data: { name: body.name, isFavorite: body.isFavorite },
  });

  return NextResponse.json(store);
}

export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  const userId = await requireUserId();
  const { id } = await params;
  const storeId = parseInt(id, 10);

  const existing = await prisma.store.findFirst({ where: { id: storeId, userId } });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await prisma.store.delete({ where: { id: storeId } });
  return NextResponse.json({ success: true });
}
