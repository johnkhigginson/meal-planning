// Server-side data access for the PUBLIC recipe blog. These queries are the
// only place unauthenticated visitors touch the database, so every query is
// hard-scoped to `isPublished: true` — nothing private can leak through.

import { prisma } from "@/lib/prisma";

export async function getPublishedBooks() {
  return prisma.recipeBook.findMany({
    where: { isPublished: true, slug: { not: null } },
    select: {
      id: true,
      name: true,
      description: true,
      slug: true,
      coverImageUrl: true,
      publishedAt: true,
      _count: { select: { entries: true } },
    },
    orderBy: { publishedAt: "desc" },
  });
}

export async function getPublishedBookBySlug(slug: string) {
  const book = await prisma.recipeBook.findFirst({
    where: { isPublished: true, slug },
    select: {
      id: true,
      householdId: true,
      name: true,
      description: true,
      slug: true,
      coverImageUrl: true,
      entries: {
        orderBy: { sortOrder: "asc" },
        select: {
          recipe: {
            select: {
              id: true,
              name: true,
              slug: true,
              description: true,
              imageUrl: true,
              prepTimeMinutes: true,
              cookTimeMinutes: true,
              servings: true,
              publishedAt: true,
              author: { select: { name: true } },
              tags: { select: { tag: { select: { name: true } } } },
            },
          },
        },
      },
    },
  });
  if (!book) return null;

  // Newest posts first for the blog index feel.
  const posts = book.entries
    .map((e) => e.recipe)
    .sort((a, b) => (b.publishedAt?.getTime() ?? 0) - (a.publishedAt?.getTime() ?? 0));

  return { ...book, posts };
}

export async function getPublishedRecipe(bookSlug: string, identifier: string) {
  // The recipe must belong to a published book reachable at `bookSlug`.
  const book = await prisma.recipeBook.findFirst({
    where: { isPublished: true, slug: bookSlug },
    select: { id: true, name: true, slug: true },
  });
  if (!book) return null;

  // Recipes are addressed by slug; fall back to numeric id for entries that
  // were never slugged (e.g. recipes hand-added to a published book).
  const numericId = /^\d+$/.test(identifier) ? parseInt(identifier, 10) : null;
  const recipeWhere = numericId
    ? { OR: [{ slug: identifier }, { id: numericId }] }
    : { slug: identifier };

  const entry = await prisma.recipeBookEntry.findFirst({
    where: { recipeBookId: book.id, recipe: recipeWhere },
    select: {
      recipe: {
        select: {
          id: true,
          householdId: true,
          name: true,
          slug: true,
          description: true,
          instructions: true,
          bodyHtml: true,
          imageUrl: true,
          servings: true,
          prepTimeMinutes: true,
          cookTimeMinutes: true,
          sourceType: true,
          sourceUrl: true,
          publishedAt: true,
          author: { select: { name: true, bio: true } },
          ingredients: {
            orderBy: { sortOrder: "asc" },
            select: {
              quantity: true,
              notes: true,
              optional: true,
              unit: { select: { abbreviation: true } },
              ingredient: { select: { name: true } },
            },
          },
          tags: { select: { tag: { select: { name: true } } } },
        },
      },
    },
  });
  if (!entry) return null;

  return { book, recipe: entry.recipe };
}

// Distinct authors of the recipes in a published cookbook, for its About page.
export async function getPublishedBookAuthors(slug: string) {
  const book = await prisma.recipeBook.findFirst({
    where: { isPublished: true, slug },
    select: { id: true, name: true, slug: true, description: true },
  });
  if (!book) return null;

  const entries = await prisma.recipeBookEntry.findMany({
    where: { recipeBookId: book.id },
    select: { recipe: { select: { author: { select: { id: true, name: true, bio: true, avatarUrl: true } } } } },
  });

  const byId = new Map<number, { id: number; name: string; bio: string | null; avatarUrl: string | null }>();
  for (const e of entries) {
    const a = e.recipe.author;
    if (a && !byId.has(a.id)) byId.set(a.id, a);
  }
  return { book, authors: Array.from(byId.values()) };
}

// True when the recipe is an entry in at least one published book — i.e. it is
// publicly viewable on the blog. Gates public comment read/write.
export async function isRecipePubliclyVisible(recipeId: number): Promise<boolean> {
  const entry = await prisma.recipeBookEntry.findFirst({
    where: { recipeId, recipeBook: { isPublished: true } },
    select: { id: true },
  });
  return !!entry;
}

export function formatBlogDate(date: Date | null): string {
  if (!date) return "";
  return date.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}
