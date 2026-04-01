import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireHouseholdId } from "@/lib/auth";

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: RouteParams) {
  const householdId = await requireHouseholdId();
  const { id } = await params;
  const book = await prisma.recipeBook.findFirst({
    where: { id: parseInt(id, 10), householdId },
    include: {
      entries: {
        include: {
          recipe: {
            include: {
              tags: { include: { tag: true } },
              ingredients: { include: { ingredient: true, unit: true } },
            },
          },
        },
        orderBy: { sortOrder: "asc" },
      },
    },
  });
  if (!book) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(book);
}

export async function PUT(request: NextRequest, { params }: RouteParams) {
  const householdId = await requireHouseholdId();
  const { id } = await params;
  const bookId = parseInt(id, 10);
  const body = await request.json();

  const existing = await prisma.recipeBook.findFirst({ where: { id: bookId, householdId } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const book = await prisma.recipeBook.update({
    where: { id: bookId },
    data: { name: body.name, description: body.description ?? null },
  });
  return NextResponse.json(book);
}

export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  const householdId = await requireHouseholdId();
  const { id } = await params;
  const bookId = parseInt(id, 10);

  const existing = await prisma.recipeBook.findFirst({ where: { id: bookId, householdId } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.recipeBook.delete({ where: { id: bookId } });
  return NextResponse.json({ success: true });
}
