import { prisma } from "@/lib/prisma";

// Helpers for cookbook collaboration: users from other households who can help
// with a specific cookbook (and its recipes) without joining the owner's
// household.

// Cookbook ids the user collaborates on (not counting their own household's).
export async function collaboratorBookIds(userId: number): Promise<number[]> {
  const rows = await prisma.recipeBookCollaborator.findMany({
    where: { userId },
    select: { recipeBookId: true },
  });
  return rows.map((r) => r.recipeBookId);
}

// Can this user open/manage the cookbook? True for the owning household or a
// collaborator.
export async function canAccessBook(
  bookId: number,
  user: { userId: number; householdId: number }
): Promise<boolean> {
  const book = await prisma.recipeBook.findFirst({
    where: {
      id: bookId,
      OR: [{ householdId: user.householdId }, { collaborators: { some: { userId: user.userId } } }],
    },
    select: { id: true },
  });
  return !!book;
}

// Can this user edit/delete the recipe? True if it's in their household, or it
// belongs to a cookbook they collaborate on.
export async function canEditRecipe(
  recipeId: number,
  user: { userId: number; householdId: number }
): Promise<boolean> {
  const recipe = await prisma.recipe.findFirst({
    where: {
      id: recipeId,
      OR: [
        { householdId: user.householdId },
        { bookEntries: { some: { recipeBook: { collaborators: { some: { userId: user.userId } } } } } },
      ],
    },
    select: { id: true },
  });
  return !!recipe;
}

// Is `authorId` a valid author for a recipe in `householdId` that belongs to the
// given cookbooks? Valid = a member of the recipe's household, or a collaborator
// on one of the cookbooks the recipe is in.
export async function isValidAuthor(
  authorId: number,
  recipeHouseholdId: number,
  bookIds: number[]
): Promise<boolean> {
  const inHousehold = await prisma.user.findFirst({
    where: { id: authorId, householdId: recipeHouseholdId },
    select: { id: true },
  });
  if (inHousehold) return true;
  if (bookIds.length === 0) return false;
  const collab = await prisma.recipeBookCollaborator.findFirst({
    where: { userId: authorId, recipeBookId: { in: bookIds } },
    select: { id: true },
  });
  return !!collab;
}

// Eligible authors for a cookbook: its household members + its collaborators.
export async function eligibleAuthorsForBook(bookId: number) {
  const book = await prisma.recipeBook.findUnique({ where: { id: bookId }, select: { householdId: true } });
  if (!book) return [];
  const [members, collaborators] = await Promise.all([
    prisma.user.findMany({ where: { householdId: book.householdId }, select: { id: true, name: true } }),
    prisma.recipeBookCollaborator.findMany({
      where: { recipeBookId: bookId },
      select: { user: { select: { id: true, name: true } } },
    }),
  ]);
  const byId = new Map<number, { id: number; name: string }>();
  for (const m of members) byId.set(m.id, m);
  for (const c of collaborators) byId.set(c.user.id, c.user);
  return Array.from(byId.values()).sort((a, b) => a.name.localeCompare(b.name));
}

// The users who may be credited as author of a recipe: the recipe's household
// members plus collaborators of any cookbook it belongs to.
export async function eligibleAuthorsForRecipe(recipeId: number, householdId: number) {
  const bookIds = (
    await prisma.recipeBookEntry.findMany({ where: { recipeId }, select: { recipeBookId: true } })
  ).map((e) => e.recipeBookId);

  const [members, collaborators] = await Promise.all([
    prisma.user.findMany({ where: { householdId }, select: { id: true, name: true } }),
    bookIds.length
      ? prisma.recipeBookCollaborator.findMany({
          where: { recipeBookId: { in: bookIds } },
          select: { user: { select: { id: true, name: true } } },
        })
      : Promise.resolve([]),
  ]);

  const byId = new Map<number, { id: number; name: string }>();
  for (const m of members) byId.set(m.id, m);
  for (const c of collaborators) byId.set(c.user.id, c.user);
  return Array.from(byId.values()).sort((a, b) => a.name.localeCompare(b.name));
}
