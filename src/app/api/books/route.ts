import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireHouseholdId } from "@/lib/auth";

export async function GET() {
  const householdId = await requireHouseholdId();
  const books = await prisma.recipeBook.findMany({
    where: { householdId },
    include: { _count: { select: { entries: true } } },
    orderBy: { updatedAt: "desc" },
  });
  return NextResponse.json(books);
}

export async function POST(request: NextRequest) {
  const householdId = await requireHouseholdId();
  const { name, description } = await request.json();
  if (!name) return NextResponse.json({ error: "Name required" }, { status: 400 });

  const book = await prisma.recipeBook.create({
    data: { householdId, name, description: description || null },
    include: { _count: { select: { entries: true } } },
  });
  return NextResponse.json(book, { status: 201 });
}
