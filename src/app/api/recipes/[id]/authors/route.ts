import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { eligibleAuthorsForRecipe } from "@/lib/collab";

type RouteParams = { params: Promise<{ id: string }> };

// Users who may be credited as the author of this recipe: the recipe's
// household members plus collaborators on any cookbook it belongs to.
export async function GET(_request: NextRequest, { params }: RouteParams) {
  const user = await requireUser();
  const recipeId = parseInt((await params).id, 10);
  if (Number.isNaN(recipeId)) return NextResponse.json([], { status: 200 });

  // Caller must be able to see the recipe (household or collaborator).
  const recipe = await prisma.recipe.findFirst({
    where: {
      id: recipeId,
      OR: [
        { householdId: user.householdId },
        { bookEntries: { some: { recipeBook: { collaborators: { some: { userId: user.userId } } } } } },
      ],
    },
    select: { id: true, householdId: true },
  });
  if (!recipe) return NextResponse.json([], { status: 200 });

  const authors = await eligibleAuthorsForRecipe(recipeId, recipe.householdId);
  return NextResponse.json(authors);
}
