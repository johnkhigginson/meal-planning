import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireHouseholdId, requireUser } from "@/lib/auth";

export async function GET() {
  const user = await requireUser();
  const books = await prisma.recipeBook.findMany({
    // Own cookbooks plus ones the user collaborates on.
    where: {
      OR: [{ householdId: user.householdId }, { collaborators: { some: { userId: user.userId } } }],
    },
    include: { _count: { select: { entries: true } } },
    orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
  });
  // Flag collaborator cookbooks (not owned by the caller's household).
  return NextResponse.json(
    books.map((b) => ({ ...b, isCollaboration: b.householdId !== user.householdId }))
  );
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
