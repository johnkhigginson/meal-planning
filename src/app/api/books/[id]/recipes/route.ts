import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireHouseholdId } from "@/lib/auth";

type RouteParams = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, { params }: RouteParams) {
  const householdId = await requireHouseholdId();
  const { id } = await params;
  const bookId = parseInt(id, 10);
  const { recipeId } = await request.json();

  if (typeof recipeId !== "number" || !Number.isInteger(recipeId)) {
    return NextResponse.json({ error: "Valid recipeId required" }, { status: 400 });
  }

  const book = await prisma.recipeBook.findFirst({ where: { id: bookId, householdId } });
  if (!book) return NextResponse.json({ error: "Book not found" }, { status: 404 });

  // The recipe must belong to the same household (no cross-household linking).
  const recipe = await prisma.recipe.findFirst({ where: { id: recipeId, householdId }, select: { id: true } });
  if (!recipe) return NextResponse.json({ error: "Recipe not found" }, { status: 404 });

  const maxSort = await prisma.recipeBookEntry.findFirst({
    where: { recipeBookId: bookId },
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  });

  const entry = await prisma.recipeBookEntry.create({
    data: { recipeBookId: bookId, recipeId, sortOrder: (maxSort?.sortOrder ?? -1) + 1 },
    include: { recipe: true },
  });
  return NextResponse.json(entry, { status: 201 });
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const householdId = await requireHouseholdId();
  const { id } = await params;
  const bookId = parseInt(id, 10);
  const { searchParams } = new URL(request.url);
  const recipeId = parseInt(searchParams.get("recipeId") || "0", 10);

  const book = await prisma.recipeBook.findFirst({ where: { id: bookId, householdId } });
  if (!book) return NextResponse.json({ error: "Book not found" }, { status: 404 });

  await prisma.recipeBookEntry.deleteMany({ where: { recipeBookId: bookId, recipeId } });
  return NextResponse.json({ success: true });
}
