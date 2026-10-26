import { prisma } from "@/lib/prisma";
import { normalizeImportedIngredients } from "@/lib/recipe-sections";
import { guessIngredientCategory } from "@/lib/ingredient-category";
import { makeUnitLookup, parseIngredientText } from "@/lib/ingredient-format";

// Parses free-text ingredient lines ("2 cups flour", "1/2 tsp salt (fine)")
// into structured rows, matching/creating Ingredient records and resolving
// units. Shared by the /api/ingredients/parse route and the blog AI importer.

export interface ParsedIngredient {
  ingredientId: number;
  ingredientName: string;
  quantity: number;
  unitId: number;
  unitName: string;
  notes: string;
  optional: boolean;
  // Ingredient group the line came from ("Cheddar Bay Biscuits"), when the
  // source recipe split its list into sections.
  section: string | null;
}

// Accepts plain lines or `{ text, section }` rows, which is what the scraper and
// the AI importers produce for a sectioned recipe.
export async function parseIngredientLines(
  rawList: (string | { text: string; section?: string | null })[]
): Promise<ParsedIngredient[]> {
  const lines = normalizeImportedIngredients(rawList);
  const units = await prisma.unit.findMany({ select: { id: true, name: true, abbreviation: true } });
  const lookup = makeUnitLookup(units);
  const eachUnit = lookup("each");

  const results: ParsedIngredient[] = [];

  for (const line of lines) {
    // The amount, unit, name and note, read the same way the verify script
    // checks them (lib/ingredient-format.ts).
    const parsed = parseIngredientText(line.text, lookup);
    if (!parsed) continue;
    const unit = parsed.unit ?? { id: eachUnit?.id ?? 1, name: "each", abbreviation: "ea" };
    const ingredientText = parsed.name;

    let ingredient = await prisma.ingredient.findFirst({
      where: { name: { equals: ingredientText } },
    });
    if (!ingredient) {
      ingredient = await prisma.ingredient.findFirst({
        where: { name: { contains: ingredientText } },
      });
    }
    if (!ingredient) {
      ingredient = await prisma.ingredient.create({
        data: { name: ingredientText, category: guessIngredientCategory(ingredientText) },
      });
    }

    results.push({
      ingredientId: ingredient.id,
      ingredientName: ingredient.name,
      quantity: parsed.quantity,
      unitId: unit.id,
      unitName: unit.name,
      notes: parsed.notes,
      optional: parsed.optional,
      section: line.section,
    });
  }

  return results;
}
