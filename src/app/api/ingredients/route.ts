import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { createIngredientSchema } from "@/lib/validators";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q") || "";

  const ingredients = await prisma.ingredient.findMany({
    where: q ? { name: { contains: q } } : undefined,
    include: { defaultUnit: true },
    orderBy: { name: "asc" },
    take: 50,
  });
  return NextResponse.json(ingredients);
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const body = await request.json();
  const parsed = createIngredientSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  // Upsert by unique name so duplicates return the existing row, not a 500.
  const ingredient = await prisma.ingredient.upsert({
    where: { name: parsed.data.name },
    update: {},
    create: parsed.data,
    include: { defaultUnit: true },
  });
  return NextResponse.json(ingredient, { status: 201 });
}
