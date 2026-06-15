import { prisma } from "@/lib/prisma";

// Categories ("tags") are scoped so they aren't shared across unrelated users.
// A tag with householdId = null is a STANDARD category visible to everyone; a
// tag with a householdId is a custom category owned by that household. Members
// of a household — and anyone collaborating on one of its cookbooks — see its
// custom categories; nobody else does.

// The curated standard categories every user starts with. Kept in sync with the
// seed and the tag migration so "standard" means the same thing everywhere.
export const STANDARD_TAGS = [
  "Breakfast",
  "Lunch",
  "Dinner",
  "Appetizer",
  "Side Dish",
  "Salad",
  "Soup",
  "Bread",
  "Dessert",
  "Snack",
  "Drink",
  "Sauce",
  "Vegetarian",
  "Vegan",
  "Gluten-Free",
  "Quick",
  "Healthy",
  "Comfort Food",
  "Italian",
  "Mexican",
  "Asian",
];

// Household ids whose custom categories `user` may see: their own plus the
// households that own any cookbook they collaborate on.
export async function visibleHouseholdIds(user: {
  userId: number;
  householdId: number;
}): Promise<number[]> {
  const collabs = await prisma.recipeBookCollaborator.findMany({
    where: { userId: user.userId },
    select: { recipeBook: { select: { householdId: true } } },
  });
  return Array.from(new Set([user.householdId, ...collabs.map((c) => c.recipeBook.householdId)]));
}

// Prisma `where` selecting the tags a user may see: standard + visible households.
export async function visibleTagWhere(user: { userId: number; householdId: number }) {
  const householdIds = await visibleHouseholdIds(user);
  return { OR: [{ householdId: null }, { householdId: { in: householdIds } }] };
}

// True when every tag id is usable on a recipe in `householdId` — i.e. each tag
// is either standard or owned by that household. Prevents attaching one
// household's private category to another household's recipe.
export async function tagsAllowedForHousehold(tagIds: number[], householdId: number): Promise<boolean> {
  if (tagIds.length === 0) return true;
  const ids = Array.from(new Set(tagIds));
  const ok = await prisma.tag.count({
    where: { id: { in: ids }, OR: [{ householdId: null }, { householdId }] },
  });
  return ok === ids.length;
}

// Find-or-create a category in a household, de-duplicating case-insensitively
// against both that household's tags and the standard set (so users don't
// recreate "Dessert"). Returns the tag id.
export async function findOrCreateHouseholdTag(name: string, householdId: number): Promise<number> {
  const trimmed = name.trim();
  // Match an existing standard or household tag with the same name (the DB
  // collation is case-insensitive, so `equals` is a case-insensitive compare).
  const existing = await prisma.tag.findFirst({
    where: { name: { equals: trimmed }, OR: [{ householdId: null }, { householdId }] },
    select: { id: true },
  });
  if (existing) return existing.id;
  const created = await prisma.tag.create({ data: { name: trimmed, householdId } });
  return created.id;
}
