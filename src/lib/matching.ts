import { prisma } from "./prisma";
import { convertQuantity } from "./units";
import type { UnitConversion } from "@/generated/prisma/client";

export interface MatchedIngredient {
  ingredientId: number;
  ingredientName: string;
  requiredQty: number;
  requiredUnitAbbr: string;
  availableQty: number | null;
  availableUnitAbbr: string | null;
  isMet: boolean;
  optional: boolean;
}

export interface RecipeMatch {
  recipeId: number;
  recipeName: string;
  description: string | null;
  servings: number;
  prepTimeMinutes: number | null;
  cookTimeMinutes: number | null;
  sourceType: string;
  isFavorite: boolean;
  matchScore: number;
  totalRequired: number;
  matchedCount: number;
  ingredients: MatchedIngredient[];
  tags: { id: number; name: string }[];
}

export async function findMatchingRecipes(
  householdId: number,
  minMatchScore: number = 0
): Promise<RecipeMatch[]> {
  const [recipes, inventory, conversions] = await Promise.all([
    prisma.recipe.findMany({
      where: { householdId },
      include: {
        ingredients: {
          include: { ingredient: true, unit: true },
          orderBy: { sortOrder: "asc" },
        },
        tags: { include: { tag: true } },
      },
    }),
    prisma.inventoryItem.findMany({
      where: { householdId },
      include: { ingredient: true, unit: true },
    }),
    prisma.unitConversion.findMany(),
  ]);

  const inventoryMap = new Map(
    inventory.map((item) => [
      item.ingredientId,
      { quantity: item.quantity, unitId: item.unitId, unitAbbr: item.unit.abbreviation },
    ])
  );

  const results: RecipeMatch[] = [];

  for (const recipe of recipes) {
    const matchedIngredients: MatchedIngredient[] = [];
    let totalRequired = 0;
    let matchedCount = 0;

    for (const ri of recipe.ingredients) {
      const invItem = inventoryMap.get(ri.ingredientId);
      let isMet = false;

      if (invItem) {
        const converted = convertQuantity(
          invItem.quantity,
          invItem.unitId,
          ri.unitId,
          conversions as UnitConversion[]
        );
        isMet = converted !== null ? converted >= ri.quantity : invItem.quantity > 0;
      }

      if (!ri.optional) {
        totalRequired++;
        if (isMet) matchedCount++;
      }

      matchedIngredients.push({
        ingredientId: ri.ingredientId,
        ingredientName: ri.ingredient.name,
        requiredQty: ri.quantity,
        requiredUnitAbbr: ri.unit.abbreviation,
        availableQty: invItem?.quantity ?? null,
        availableUnitAbbr: invItem?.unitAbbr ?? null,
        isMet,
        optional: ri.optional,
      });
    }

    const matchScore = totalRequired > 0 ? matchedCount / totalRequired : 0;

    if (matchScore >= minMatchScore) {
      results.push({
        recipeId: recipe.id,
        recipeName: recipe.name,
        description: recipe.description,
        servings: recipe.servings,
        prepTimeMinutes: recipe.prepTimeMinutes,
        cookTimeMinutes: recipe.cookTimeMinutes,
        sourceType: recipe.sourceType,
        isFavorite: recipe.isFavorite,
        matchScore,
        totalRequired,
        matchedCount,
        ingredients: matchedIngredients,
        tags: recipe.tags.map((t) => ({ id: t.tag.id, name: t.tag.name })),
      });
    }
  }

  results.sort((a, b) => b.matchScore - a.matchScore);
  return results;
}
