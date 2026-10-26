import { prisma } from "@/lib/prisma";
import { normalizeImportedIngredients } from "@/lib/recipe-sections";
import { guessIngredientCategory } from "@/lib/ingredient-category";
import {
  cleanIngredientName,
  cleanIngredientNote,
  cleanIngredientText,
  formatRange,
  readIngredientLine,
} from "@/lib/ingredient-format";

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

const UNIT_ALIASES: Record<string, string> = {
  "tsp": "teaspoon", "tsps": "teaspoon", "teaspoons": "teaspoon", "t": "teaspoon",
  "tbsp": "tablespoon", "tbsps": "tablespoon", "tablespoons": "tablespoon", "tbs": "tablespoon",
  "cup": "cup", "cups": "cup", "c": "cup",
  "fl oz": "fluid ounce", "fluid ounces": "fluid ounce",
  "pint": "pint", "pints": "pint", "pt": "pint",
  "quart": "quart", "quarts": "quart", "qt": "quart",
  "gallon": "gallon", "gallons": "gallon", "gal": "gallon",
  "ml": "milliliter", "milliliters": "milliliter", "mls": "milliliter",
  "l": "liter", "liters": "liter", "litres": "liter", "liter": "liter",
  "oz": "ounce", "ounces": "ounce",
  "lb": "pound", "lbs": "pound", "pounds": "pound",
  "g": "gram", "grams": "gram", "gram": "gram",
  "kg": "kilogram", "kilograms": "kilogram",
  "each": "each",
  "dozen": "dozen",
  "pinch": "pinch", "pinches": "pinch",
  "dash": "dash", "dashes": "dash",
  "clove": "clove", "cloves": "clove",
  "bunch": "bunch", "bunches": "bunch",
  "can": "can", "cans": "can",
  "package": "package", "packages": "package", "pkg": "package", "pkgs": "package",
  "slice": "slice", "slices": "slice",
  "jar": "each", "jars": "each",
  "bottle": "each", "bottles": "each",
  "bag": "each", "bags": "each",
  "box": "each", "boxes": "each",
  "stick": "each", "sticks": "each",
  "head": "each", "heads": "each",
  "sprig": "each", "sprigs": "each",
  "stalk": "each", "stalks": "each",
};

type UnitRow = { id: number; name: string; abbreviation: string };

// A unit word or abbreviation ("cups", "tsp", "cloves") to its row in the
// units table, or null when it isn't one.
function unitLookup(unitMap: Map<string, UnitRow>): (word: string) => UnitRow | null {
  return (word) => {
    const alias = UNIT_ALIASES[word];
    return unitMap.get(word) ?? (alias ? unitMap.get(alias) : undefined) ?? null;
  };
}

function extractNotes(name: string): { cleanName: string; notes: string } {
  const parenMatch = name.match(/^(.+?)\s*\((.+?)\)\s*$/);
  if (parenMatch) {
    return { cleanName: parenMatch[1].trim(), notes: parenMatch[2].trim() };
  }

  const commaIdx = name.indexOf(",");
  if (commaIdx > 0) {
    return {
      cleanName: name.slice(0, commaIdx).trim(),
      notes: name.slice(commaIdx + 1).trim(),
    };
  }

  return { cleanName: name, notes: "" };
}

// Accepts plain lines or `{ text, section }` rows, which is what the scraper and
// the AI importers produce for a sectioned recipe.
export async function parseIngredientLines(
  rawList: (string | { text: string; section?: string | null })[]
): Promise<ParsedIngredient[]> {
  const lines = normalizeImportedIngredients(rawList);
  const units = await prisma.unit.findMany();
  const unitMap = new Map<string, UnitRow>();
  for (const unit of units) {
    const row = { id: unit.id, name: unit.name, abbreviation: unit.abbreviation };
    unitMap.set(unit.name.toLowerCase(), row);
    unitMap.set(unit.abbreviation.toLowerCase(), row);
  }
  const lookup = unitLookup(unitMap);
  const eachUnit = unitMap.get("each");

  const results: ParsedIngredient[] = [];

  for (const line of lines) {
    let text = line.text.trim();
    if (!text) continue;
    const optional = /\boptional\b/i.test(text);
    text = text.replace(/\(?\boptional\b\)?/i, "").trim();
    // "($0.20)" and "garlic*" from sites that price or footnote each line.
    text = cleanIngredientText(text);

    // A line with no number ("Salt and freshly ground black pepper") is
    // saved with quantity 0: no amount, not a count of 1. A range ("1/2 to 1
    // tsp") is saved at its upper end so a grocery list covers the most the
    // recipe could use, and the full range is kept in the notes.
    const parsed = readIngredientLine(text, lookup);
    const unit = parsed.unit ?? { id: eachUnit?.id ?? 1, name: "each", abbreviation: "ea" };
    const range =
      parsed.quantityMax > parsed.quantity ? formatRange(parsed.quantity, parsed.quantityMax, unit.abbreviation) : "";

    const { cleanName, notes: rawNotes } = extractNotes(parsed.name);
    // "garlic, (minced)" leaves "garlic," before the note.
    const ingredientText = cleanIngredientName(cleanName);
    const notes = cleanIngredientNote([range, ...parsed.notes, rawNotes].filter(Boolean).join(", "), ingredientText);

    if (!ingredientText) continue;

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
      quantity: parsed.quantityMax,
      unitId: unit.id,
      unitName: unit.name,
      notes,
      optional,
      section: line.section,
    });
  }

  return results;
}
