import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

interface ParsedIngredient {
  ingredientId: number;
  ingredientName: string;
  quantity: number;
  unitId: number;
  unitName: string;
  notes: string;
  optional: boolean;
}

// Common fractions
const FRACTIONS: Record<string, number> = {
  "½": 0.5, "⅓": 0.333, "⅔": 0.667, "¼": 0.25, "¾": 0.75,
  "⅛": 0.125, "⅜": 0.375, "⅝": 0.625, "⅞": 0.875,
  "⅕": 0.2, "⅖": 0.4, "⅗": 0.6, "⅘": 0.8, "⅙": 0.167, "⅚": 0.833,
};

function parseQuantity(str: string): { quantity: number; rest: string } {
  let s = str.trim();
  let qty = 0;

  // Replace unicode fractions
  for (const [frac, val] of Object.entries(FRACTIONS)) {
    if (s.includes(frac)) {
      s = s.replace(frac, "");
      qty += val;
    }
  }

  // Match leading number(s): "1 1/2", "2.5", "1/4", "12"
  const match = s.match(/^(\d+)\s+(\d+)\/(\d+)/);
  if (match) {
    qty += parseInt(match[1]) + parseInt(match[2]) / parseInt(match[3]);
    s = s.slice(match[0].length);
  } else {
    const fracMatch = s.match(/^(\d+)\/(\d+)/);
    if (fracMatch) {
      qty += parseInt(fracMatch[1]) / parseInt(fracMatch[2]);
      s = s.slice(fracMatch[0].length);
    } else {
      const numMatch = s.match(/^(\d+\.?\d*)/);
      if (numMatch) {
        qty += parseFloat(numMatch[1]);
        s = s.slice(numMatch[0].length);
      }
    }
  }

  return { quantity: qty || 1, rest: s.trim() };
}

// Unit aliases mapping to canonical names
const UNIT_ALIASES: Record<string, string> = {
  // Volume
  "tsp": "teaspoon", "tsps": "teaspoon", "teaspoons": "teaspoon", "t": "teaspoon",
  "tbsp": "tablespoon", "tbsps": "tablespoon", "tablespoons": "tablespoon", "tbs": "tablespoon",
  "cup": "cup", "cups": "cup", "c": "cup",
  "fl oz": "fluid ounce", "fluid ounces": "fluid ounce",
  "pint": "pint", "pints": "pint", "pt": "pint",
  "quart": "quart", "quarts": "quart", "qt": "quart",
  "gallon": "gallon", "gallons": "gallon", "gal": "gallon",
  "ml": "milliliter", "milliliters": "milliliter", "mls": "milliliter",
  "l": "liter", "liters": "liter", "litres": "liter", "liter": "liter",
  // Weight
  "oz": "ounce", "ounces": "ounce",
  "lb": "pound", "lbs": "pound", "pounds": "pound",
  "g": "gram", "grams": "gram", "gram": "gram",
  "kg": "kilogram", "kilograms": "kilogram",
  // Count
  "each": "each",
  "dozen": "dozen",
  // Other
  "pinch": "pinch", "pinches": "pinch",
  "dash": "dash", "dashes": "dash",
  "clove": "clove", "cloves": "clove",
  "bunch": "bunch", "bunches": "bunch",
  "can": "can", "cans": "can",
  "package": "package", "packages": "package", "pkg": "package", "pkgs": "package",
  "slice": "slice", "slices": "slice",
  // Containers (map to each)
  "jar": "each", "jars": "each",
  "bottle": "each", "bottles": "each",
  "bag": "each", "bags": "each",
  "box": "each", "boxes": "each",
  "stick": "each", "sticks": "each",
  "head": "each", "heads": "each",
  "sprig": "each", "sprigs": "each",
  "stalk": "each", "stalks": "each",
};

function parseUnit(str: string, unitMap: Map<string, { id: number; name: string }>): { unitId: number; unitName: string; rest: string } {
  const s = str.trim();
  const words = s.split(/\s+/);

  // Try matching 2-word units first ("fl oz", "fluid ounce"), then 1-word
  for (const len of [2, 1]) {
    if (words.length < len) continue;
    const candidate = words.slice(0, len).join(" ").toLowerCase().replace(/\.$/, "");

    // Direct match in DB
    const dbUnit = unitMap.get(candidate);
    if (dbUnit) {
      return { unitId: dbUnit.id, unitName: dbUnit.name, rest: words.slice(len).join(" ") };
    }

    // Alias match
    const alias = UNIT_ALIASES[candidate];
    if (alias) {
      const aliasUnit = unitMap.get(alias);
      if (aliasUnit) {
        return { unitId: aliasUnit.id, unitName: aliasUnit.name, rest: words.slice(len).join(" ") };
      }
    }
  }

  // No unit found — default to "each"
  const eachUnit = unitMap.get("each");
  return { unitId: eachUnit?.id ?? 1, unitName: "each", rest: s };
}

function extractNotes(name: string): { cleanName: string; notes: string } {
  // Extract parenthetical notes: "chicken breast (boneless, skinless)"
  const parenMatch = name.match(/^(.+?)\s*\((.+?)\)\s*$/);
  if (parenMatch) {
    return { cleanName: parenMatch[1].trim(), notes: parenMatch[2].trim() };
  }

  // Extract comma-separated notes: "chicken breast, diced"
  const commaIdx = name.indexOf(",");
  if (commaIdx > 0) {
    return {
      cleanName: name.slice(0, commaIdx).trim(),
      notes: name.slice(commaIdx + 1).trim(),
    };
  }

  return { cleanName: name, notes: "" };
}

export async function POST(request: NextRequest) {
  const { ingredients: rawList } = await request.json();

  if (!Array.isArray(rawList) || rawList.length === 0) {
    return NextResponse.json({ error: "ingredients array required" }, { status: 400 });
  }

  // Load all units into a lookup map
  const units = await prisma.unit.findMany();
  const unitMap = new Map<string, { id: number; name: string }>();
  for (const unit of units) {
    unitMap.set(unit.name.toLowerCase(), { id: unit.id, name: unit.name });
    unitMap.set(unit.abbreviation.toLowerCase(), { id: unit.id, name: unit.name });
  }

  const results: ParsedIngredient[] = [];

  for (const raw of rawList) {
    if (typeof raw !== "string" || !raw.trim()) continue;

    let text = raw.trim();
    const optional = /\boptional\b/i.test(text);
    text = text.replace(/\(?\boptional\b\)?/i, "").trim();

    // 1. Parse quantity
    const { quantity, rest: afterQty } = parseQuantity(text);

    // 2. Parse unit
    const { unitId, unitName, rest: afterUnit } = parseUnit(afterQty, unitMap);

    // 3. Clean up ingredient name and extract notes
    let ingredientText = afterUnit
      .replace(/^(of|the)\s+/i, "") // strip leading "of" / "the"
      .trim();

    const { cleanName, notes } = extractNotes(ingredientText);
    ingredientText = cleanName;

    if (!ingredientText) continue;

    // 4. Find or create ingredient
    let ingredient = await prisma.ingredient.findFirst({
      where: { name: { equals: ingredientText } },
    });

    if (!ingredient) {
      // Try case-insensitive partial match
      ingredient = await prisma.ingredient.findFirst({
        where: { name: { contains: ingredientText } },
      });
    }

    if (!ingredient) {
      ingredient = await prisma.ingredient.create({
        data: { name: ingredientText },
      });
    }

    results.push({
      ingredientId: ingredient.id,
      ingredientName: ingredient.name,
      quantity,
      unitId,
      unitName,
      notes,
      optional,
    });
  }

  return NextResponse.json(results);
}
