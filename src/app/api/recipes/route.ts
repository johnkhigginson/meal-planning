import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireHouseholdId, requireUser } from "@/lib/auth";
import { createRecipeSchema } from "@/lib/validators";
import { audit } from "@/lib/audit";
import { isValidAuthor } from "@/lib/collab";
import { tagsAllowedForHousehold } from "@/lib/tags";
import { sendNewRecipeEmail } from "@/lib/email";
import { absoluteUrl, getSiteUrl } from "@/lib/site";

export async function GET(request: NextRequest) {
  const householdId = await requireHouseholdId();
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q") || "";
  const sourceType = searchParams.get("sourceType");
  const tagIds = searchParams.get("tagIds");
  const favoritesOnly = searchParams.get("favorites") === "true";
  const page = parseInt(searchParams.get("page") || "1", 10);
  const limit = parseInt(searchParams.get("limit") || "20", 10);

  const where: Record<string, unknown> = { householdId };

  if (q) {
    where.OR = [
      { name: { contains: q } },
      { description: { contains: q } },
    ];
  }
  if (sourceType) where.sourceType = sourceType;
  if (favoritesOnly) where.isFavorite = true;
  if (tagIds) {
    const ids = tagIds.split(",").map(Number).filter(Boolean);
    if (ids.length > 0) where.tags = { some: { tagId: { in: ids } } };
  }

  const [recipes, total] = await Promise.all([
    prisma.recipe.findMany({
      where,
      include: {
        ingredients: { include: { ingredient: true, unit: true }, orderBy: { sortOrder: "asc" } },
        tags: { include: { tag: true } },
        author: { select: { id: true, name: true } },
      },
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.recipe.count({ where }),
  ]);

  return NextResponse.json({ recipes, total, page, limit });
}

export async function POST(request: NextRequest) {
  const user = await requireUser();
  const householdId = user.householdId;
  const body = await request.json();
  const parsed = createRecipeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { ingredients, tagIds, bookId, ...recipeData } = parsed.data;

  // When creating directly into a cookbook (a collaborator contributing to
  // someone else's blog), the recipe lives in that cookbook's household and is
  // credited to the contributor by default.
  let targetHouseholdId = householdId;
  let targetBookId: number | null = null;
  let targetBook: { name: string; slug: string | null; isPublished: boolean } | null = null;
  if (bookId != null) {
    const book = await prisma.recipeBook.findFirst({
      where: {
        id: bookId,
        OR: [{ householdId: user.householdId }, { collaborators: { some: { userId: user.userId } } }],
      },
      select: { id: true, householdId: true, name: true, slug: true, isPublished: true },
    });
    if (!book) return NextResponse.json({ error: "Cookbook not found" }, { status: 404 });
    targetHouseholdId = book.householdId;
    targetBookId = book.id;
    targetBook = { name: book.name, slug: book.slug, isPublished: book.isPublished };
    if (recipeData.authorId == null) recipeData.authorId = user.userId;
  }

  // An author must be a member of the recipe's household OR a collaborator on
  // the target cookbook.
  if (recipeData.authorId != null) {
    if (!(await isValidAuthor(recipeData.authorId, targetHouseholdId, targetBookId ? [targetBookId] : []))) {
      return NextResponse.json({ error: "Author must be a household member or cookbook collaborator" }, { status: 400 });
    }
  }

  // Every category must be standard or owned by the recipe's household.
  if (!(await tagsAllowedForHousehold(tagIds, targetHouseholdId))) {
    return NextResponse.json({ error: "A selected category isn't available for this recipe" }, { status: 400 });
  }

  const recipe = await prisma.recipe.create({
    data: {
      ...recipeData,
      householdId: targetHouseholdId,
      ingredients: {
        create: ingredients.map((ing, idx) => ({
          ingredientId: ing.ingredientId,
          quantity: ing.quantity,
          unitId: ing.unitId,
          notes: ing.notes,
          optional: ing.optional,
          sortOrder: ing.sortOrder ?? idx,
        })),
      },
      tags: { create: tagIds.map((tagId) => ({ tagId })) },
    },
    include: {
      ingredients: { include: { ingredient: true, unit: true }, orderBy: { sortOrder: "asc" } },
      tags: { include: { tag: true } },
    },
  });

  // Add it to the target cookbook.
  if (targetBookId != null) {
    const maxSort = await prisma.recipeBookEntry.findFirst({
      where: { recipeBookId: targetBookId },
      orderBy: { sortOrder: "desc" },
      select: { sortOrder: true },
    });
    await prisma.recipeBookEntry.create({
      data: { recipeBookId: targetBookId, recipeId: recipe.id, sortOrder: (maxSort?.sortOrder ?? -1) + 1 },
    });
  }

  await audit({
    category: "RECIPE",
    action: "RECIPE_CREATED",
    summary: `${user.name} added recipe “${recipe.name}”`,
    actorUserId: user.userId,
    actorName: user.name,
    householdId: targetHouseholdId,
    targetType: "RECIPE",
    targetId: recipe.id,
  });

  // Posting a new recipe to a PUBLISHED cookbook notifies its followers. Bulk
  // blog imports go through a different route, so they never trigger this.
  if (targetBookId != null && targetBook?.isPublished && targetBook.slug) {
    await notifyFollowers(targetBookId, targetBook.name, targetBook.slug, recipe).catch((e) =>
      console.error("follower notification failed", e)
    );
  }

  return NextResponse.json(recipe, { status: 201 });
}

// Email every follower of a published cookbook about a newly posted recipe.
// Best-effort: never blocks or fails recipe creation.
async function notifyFollowers(
  bookId: number,
  bookName: string,
  bookSlug: string,
  recipe: { id: number; name: string; slug: string | null; imageUrl: string | null }
) {
  const subscribers = await prisma.blogSubscriber.findMany({
    where: { recipeBookId: bookId },
    select: { user: { select: { email: true } } },
  });
  if (subscribers.length === 0) return;

  const site = getSiteUrl();
  const recipeUrl = `${site}/blog/${bookSlug}/${recipe.slug ?? recipe.id}`;
  const blogUrl = `${site}/blog/${bookSlug}`;
  const imageUrl = absoluteUrl(recipe.imageUrl) ?? null;

  await Promise.allSettled(
    subscribers.map((s) =>
      sendNewRecipeEmail({
        toEmail: s.user.email,
        blogName: bookName,
        recipeName: recipe.name,
        recipeUrl,
        blogUrl,
        imageUrl,
      })
    )
  );
}
