import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

type RouteParams = { params: Promise<{ token: string }> };

// Get shared content (public — no auth required for viewing)
export async function GET(_request: NextRequest, { params }: RouteParams) {
  const { token } = await params;

  const link = await prisma.shareLink.findUnique({ where: { token } });
  if (!link) return NextResponse.json({ error: "Link not found" }, { status: 404 });

  if (link.shareType === "RECIPE" && link.recipeId) {
    const recipe = await prisma.recipe.findUnique({
      where: { id: link.recipeId },
      include: {
        ingredients: { include: { ingredient: true, unit: true }, orderBy: { sortOrder: "asc" } },
        tags: { include: { tag: true } },
      },
    });
    return NextResponse.json({ type: "RECIPE", recipe });
  }

  if (link.shareType === "BOOK" && link.recipeBookId) {
    const book = await prisma.recipeBook.findUnique({
      where: { id: link.recipeBookId },
      include: {
        entries: {
          include: {
            recipe: {
              include: {
                ingredients: { include: { ingredient: true, unit: true }, orderBy: { sortOrder: "asc" } },
                tags: { include: { tag: true } },
              },
            },
          },
          orderBy: { sortOrder: "asc" },
        },
      },
    });
    return NextResponse.json({ type: "BOOK", book });
  }

  return NextResponse.json({ error: "Invalid share link" }, { status: 400 });
}

// Import shared content into user's household
export async function POST(_request: NextRequest, { params }: RouteParams) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in to import" }, { status: 401 });

  const { token } = await params;
  const link = await prisma.shareLink.findUnique({ where: { token } });
  if (!link) return NextResponse.json({ error: "Link not found" }, { status: 404 });

  if (link.shareType === "RECIPE" && link.recipeId) {
    const source = await prisma.recipe.findUnique({
      where: { id: link.recipeId },
      include: { ingredients: true, tags: true },
    });
    if (!source) return NextResponse.json({ error: "Recipe not found" }, { status: 404 });

    const recipe = await prisma.recipe.create({
      data: {
        householdId: user.householdId,
        name: source.name,
        description: source.description,
        instructions: source.instructions,
        servings: source.servings,
        prepTimeMinutes: source.prepTimeMinutes,
        cookTimeMinutes: source.cookTimeMinutes,
        sourceType: source.sourceType,
        sourceUrl: source.sourceUrl,
        sourceBookTitle: source.sourceBookTitle,
        sourceBookPage: source.sourceBookPage,
        ingredients: {
          create: source.ingredients.map((i) => ({
            ingredientId: i.ingredientId,
            quantity: i.quantity,
            unitId: i.unitId,
            notes: i.notes,
            optional: i.optional,
            sortOrder: i.sortOrder,
          })),
        },
        tags: { create: source.tags.map((t) => ({ tagId: t.tagId })) },
      },
    });
    return NextResponse.json({ imported: 1, recipeId: recipe.id });
  }

  if (link.shareType === "BOOK" && link.recipeBookId) {
    const source = await prisma.recipeBook.findUnique({
      where: { id: link.recipeBookId },
      include: {
        entries: { include: { recipe: { include: { ingredients: true, tags: true } } } },
      },
    });
    if (!source) return NextResponse.json({ error: "Book not found" }, { status: 404 });

    // Create the book
    const book = await prisma.recipeBook.create({
      data: { householdId: user.householdId, name: source.name, description: source.description },
    });

    // Clone each recipe and add to book
    let imported = 0;
    for (const entry of source.entries) {
      const r = entry.recipe;
      const recipe = await prisma.recipe.create({
        data: {
          householdId: user.householdId,
          name: r.name,
          description: r.description,
          instructions: r.instructions,
          servings: r.servings,
          prepTimeMinutes: r.prepTimeMinutes,
          cookTimeMinutes: r.cookTimeMinutes,
          sourceType: r.sourceType,
          sourceUrl: r.sourceUrl,
          sourceBookTitle: r.sourceBookTitle,
          sourceBookPage: r.sourceBookPage,
          ingredients: {
            create: r.ingredients.map((i) => ({
              ingredientId: i.ingredientId,
              quantity: i.quantity,
              unitId: i.unitId,
              notes: i.notes,
              optional: i.optional,
              sortOrder: i.sortOrder,
            })),
          },
          tags: { create: r.tags.map((t) => ({ tagId: t.tagId })) },
        },
      });
      await prisma.recipeBookEntry.create({
        data: { recipeBookId: book.id, recipeId: recipe.id, sortOrder: entry.sortOrder },
      });
      imported++;
    }

    return NextResponse.json({ imported, bookId: book.id });
  }

  return NextResponse.json({ error: "Invalid share" }, { status: 400 });
}
