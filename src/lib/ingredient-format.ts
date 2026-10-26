// One way to show "quantity unit name" everywhere an ingredient is listed:
// the grocery list, recipe pages, shared recipes and the shopping-list API.
// No server imports, so client components can use it too.

// Word units by singular, with their plural. Abbreviations (tsp, oz, lb, g)
// are left as they are; "1.5 tsp" reads fine and "tsps" doesn't.
const UNIT_WORDS: Record<string, string> = {
  cup: "cups",
  teaspoon: "teaspoons",
  tablespoon: "tablespoons",
  "fluid ounce": "fluid ounces",
  pint: "pints",
  quart: "quarts",
  gallon: "gallons",
  milliliter: "milliliters",
  liter: "liters",
  ounce: "ounces",
  pound: "pounds",
  gram: "grams",
  kilogram: "kilograms",
  dozen: "dozen",
  pinch: "pinches",
  dash: "dashes",
  clove: "cloves",
  bunch: "bunches",
  can: "cans",
  package: "packages",
  slice: "slices",
  stick: "sticks",
  head: "heads",
  sprig: "sprigs",
  stalk: "stalks",
  jar: "jars",
  bottle: "bottles",
  bag: "bags",
  box: "boxes",
  piece: "pieces",
};

const SINGULAR = new Map<string, string>();
for (const [one, many] of Object.entries(UNIT_WORDS)) {
  SINGULAR.set(one, one);
  SINGULAR.set(many, one);
}

// A count with no real unit shows as just the number: "3 eggs", not "3 ea eggs".
const COUNT_UNITS = new Set(["each", "ea", ""]);

// "cup(s)", "Cups.", "cloves" -> the singular word, or null for anything else.
function unitWord(unit: string): string | null {
  const key = unit.trim().toLowerCase().replace(/\((e?s)\)$/, "").replace(/\.$/, "");
  return SINGULAR.get(key) ?? null;
}

// Trimmed decimals: 2, 1.5, 0.33. Nothing for a missing or zero amount.
export function formatQuantity(quantity: number): string {
  if (!Number.isFinite(quantity) || quantity <= 0) return "";
  return String(Math.round(quantity * 100) / 100);
}

// The unit as it should read beside this quantity: "1 cup", "1.5 cups".
export function formatUnit(unit: string, quantity: number): string {
  const cleaned = unit.trim().replace(/\((e?s)\)$/i, "").trim();
  if (COUNT_UNITS.has(cleaned.toLowerCase())) return "";
  const word = unitWord(cleaned);
  if (!word) return cleaned;
  return quantity > 1 ? UNIT_WORDS[word] : word;
}

// "garlic, " -> "garlic". Trailing commas and stray spaces come in with
// imported lines.
export function cleanIngredientName(name: string): string {
  return name.replace(/\s+/g, " ").replace(/[\s,;]+$/, "").trim();
}

// Drops the unit from the front of a name that repeats it, as in
// "cup(s) powdered sugar" stored with the unit "cup".
function stripLeadingUnit(name: string, unit: string): string {
  const word = unitWord(unit);
  const first = name.match(/^(\S+)\s+(.+)$/);
  if (!first) return name;
  const lead = first[1];
  const sameWord = word !== null && unitWord(lead) === word;
  const sameAbbr = lead.toLowerCase().replace(/\.$/, "") === unit.trim().toLowerCase();
  return sameWord || (sameAbbr && !COUNT_UNITS.has(unit.trim().toLowerCase())) ? first[2] : name;
}

// "1.5 cups", "3 cloves", "2" (a plain count). Empty when there's no amount.
export function formatAmount(quantity: number, unit: string): string {
  const qty = formatQuantity(quantity);
  if (!qty) return "";
  const u = formatUnit(unit, quantity);
  return u ? `${qty} ${u}` : qty;
}

// The amount and the name apart, so a page can style them differently. A
// line the importer couldn't read a unit from was saved as a plain count with
// the unit left in the name ("cup(s) powdered sugar"); that unit is used.
export function formatIngredient(quantity: number, unit: string, name: string): { amount: string; name: string } {
  const cleaned = cleanIngredientName(name);
  const lead = cleaned.match(/^(\S+)\s+(.+)$/);
  if (COUNT_UNITS.has(unit.trim().toLowerCase()) && lead && unitWord(lead[1])) {
    return { amount: formatAmount(quantity, lead[1]), name: lead[2] };
  }
  return { amount: formatAmount(quantity, unit), name: stripLeadingUnit(cleaned, unit) };
}

// "1.5 cups powdered sugar", for plain-text uses like JSON-LD.
export function formatIngredientLine(quantity: number, unit: string, name: string): string {
  const parts = formatIngredient(quantity, unit, name);
  return [parts.amount, parts.name].filter(Boolean).join(" ");
}
