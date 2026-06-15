import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { createTagSchema } from "@/lib/validators";
import { findOrCreateHouseholdTag, visibleTagWhere } from "@/lib/tags";
import { canAccessBook, canEditRecipe } from "@/lib/collab";

// Categories visible to the caller: standard ones plus their household's (and
// any cookbook they collaborate on). Standard categories sort first.
export async function GET() {
  const user = await requireUser();
  const tags = await prisma.tag.findMany({
    where: await visibleTagWhere(user),
    orderBy: { name: "asc" },
  });
  tags.sort((a, b) => {
    const std = (a.householdId === null ? 0 : 1) - (b.householdId === null ? 0 : 1);
    return std !== 0 ? std : a.name.localeCompare(b.name);
  });
  return NextResponse.json(tags);
}

export async function POST(request: NextRequest) {
  const user = await requireUser();

  const body = await request.json();
  const parsed = createTagSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  // A new category belongs to the caller's household by default. When the user
  // is tagging a recipe inside someone else's cookbook (as a collaborator), the
  // category should belong to that cookbook's household instead, so it's usable
  // on those recipes. Resolve the target household from bookId/recipeId.
  let targetHouseholdId = user.householdId;
  const { bookId, recipeId } = parsed.data;
  if (bookId != null) {
    const book = await prisma.recipeBook.findUnique({ where: { id: bookId }, select: { householdId: true } });
    if (!book || !(await canAccessBook(bookId, user))) {
      return NextResponse.json({ error: "Cookbook not found" }, { status: 404 });
    }
    targetHouseholdId = book.householdId;
  } else if (recipeId != null) {
    const recipe = await prisma.recipe.findUnique({ where: { id: recipeId }, select: { householdId: true } });
    if (!recipe || !(await canEditRecipe(recipeId, user))) {
      return NextResponse.json({ error: "Recipe not found" }, { status: 404 });
    }
    targetHouseholdId = recipe.householdId;
  }

  const id = await findOrCreateHouseholdTag(parsed.data.name, targetHouseholdId);
  const tag = await prisma.tag.findUnique({ where: { id } });
  return NextResponse.json(tag, { status: 201 });
}
