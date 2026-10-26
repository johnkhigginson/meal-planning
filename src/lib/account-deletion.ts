import { prisma } from "@/lib/prisma";

export interface DeleteAccountResult {
  householdId: number;
  householdDeleted: boolean;
  newOwner: { id: number; name: string } | null;
}

// Permanently delete a user. If they're the last member of their household,
// the household and everything in it goes too. Otherwise only the user is
// removed, and ownership passes to the longest-standing remaining member when
// the user was the only owner. Content in other households (recipes they
// authored as a collaborator, comments, notes) is kept, minus the link to the
// account.
export async function deleteUserAccount(userId: number): Promise<DeleteAccountResult> {
  return prisma.$transaction(
    async (tx) => {
      const user = await tx.user.findUniqueOrThrow({
        where: { id: userId },
        select: { id: true, role: true, householdId: true },
      });
      const householdId = user.householdId;
      const others = await tx.user.findMany({
        where: { householdId, id: { not: userId } },
        select: { id: true, name: true, role: true },
        orderBy: { createdAt: "asc" },
      });

      // References to the user from anywhere. These are NO ACTION foreign keys
      // (or plain ids), so clear them before the user row goes.
      await tx.recipe.updateMany({ where: { authorId: userId }, data: { authorId: null } });
      await tx.recipeBookCollaborator.deleteMany({ where: { userId } });
      await tx.blogSubscriber.deleteMany({ where: { userId } });
      await tx.comment.updateMany({ where: { userId }, data: { userId: null } });
      await tx.recipeNote.updateMany({ where: { createdByUserId: userId }, data: { createdByUserId: null } });
      await tx.uploadedImage.updateMany({ where: { uploadedBy: userId }, data: { uploadedBy: null } });

      if (others.length === 0) {
        // Clear NO ACTION references into the household's recipes, books and
        // meal plans first, or SQL Server rejects the cascading delete.
        await tx.shareLink.deleteMany({
          where: { OR: [{ recipe: { householdId } }, { recipeBook: { householdId } }] },
        });
        await tx.recipeBookEntry.deleteMany({
          where: { OR: [{ recipe: { householdId } }, { recipeBook: { householdId } }] },
        });
        await tx.mealPlanEntry.deleteMany({
          where: { OR: [{ recipe: { householdId } }, { mealPlan: { householdId } }] },
        });
        await tx.groceryList.updateMany({
          where: { mealPlan: { householdId } },
          data: { mealPlanId: null },
        });
        // Tags don't cascade from the household (see the Tag model).
        await tx.tag.deleteMany({ where: { householdId } });
        await tx.household.delete({ where: { id: householdId } });
        return { householdId, householdDeleted: true, newOwner: null };
      }

      let newOwner: { id: number; name: string } | null = null;
      if (user.role === "OWNER" && !others.some((o) => o.role === "OWNER")) {
        const next = others[0];
        await tx.user.update({ where: { id: next.id }, data: { role: "OWNER" } });
        newOwner = { id: next.id, name: next.name };
      }

      await tx.user.delete({ where: { id: userId } });
      return { householdId, householdDeleted: false, newOwner };
    },
    { timeout: 30_000 }
  );
}
