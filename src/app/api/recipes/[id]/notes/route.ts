import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireHouseholdId, requireUser } from "@/lib/auth";

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: RouteParams) {
  const householdId = await requireHouseholdId();
  const { id } = await params;
  const recipeId = parseInt(id, 10);

  const recipe = await prisma.recipe.findFirst({
    where: { id: recipeId, householdId },
    select: { id: true },
  });
  if (!recipe) return NextResponse.json({ error: "Recipe not found" }, { status: 404 });

  const notes = await prisma.recipeNote.findMany({
    where: { recipeId },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(notes);
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  const user = await requireUser();
  const { id } = await params;
  const recipeId = parseInt(id, 10);

  const body = await request.json();
  const text = typeof body?.body === "string" ? body.body.trim() : "";
  if (!text) return NextResponse.json({ error: "Note cannot be empty" }, { status: 400 });

  const recipe = await prisma.recipe.findFirst({
    where: { id: recipeId, householdId: user.householdId },
    select: { id: true },
  });
  if (!recipe) return NextResponse.json({ error: "Recipe not found" }, { status: 404 });

  const author = await prisma.user.findUnique({
    where: { id: user.userId },
    select: { name: true },
  });

  const note = await prisma.recipeNote.create({
    data: {
      recipeId,
      body: text,
      createdByUserId: user.userId,
      createdByName: author?.name ?? null,
    },
  });
  return NextResponse.json(note, { status: 201 });
}
