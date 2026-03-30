import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";

export async function GET() {
  await requireAdmin();
  const stores = await prisma.libraryStore.findMany({ orderBy: { name: "asc" } });
  return NextResponse.json(stores);
}

export async function POST(request: NextRequest) {
  await requireAdmin();
  const body = await request.json();

  if (!body.name) {
    return NextResponse.json({ error: "Name required" }, { status: 400 });
  }

  const store = await prisma.libraryStore.create({ data: { name: body.name } });
  return NextResponse.json(store, { status: 201 });
}

export async function DELETE(request: NextRequest) {
  await requireAdmin();
  const { searchParams } = new URL(request.url);
  const id = parseInt(searchParams.get("id") || "0", 10);
  if (!id) return NextResponse.json({ error: "ID required" }, { status: 400 });

  await prisma.libraryStore.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
