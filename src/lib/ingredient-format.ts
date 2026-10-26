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

// Fractions cooks measure with. 0.33 and 0.333 both snap to 1/3.
const DENOMINATORS = [2, 3, 4, 8];
const FRACTION_TOLERANCE = 0.01;

// Kitchen fractions as plain text: 2, 1/2, 1 1/2, 2/3. Anything that isn't
// near a half, third, quarter or eighth shows as up to 2 decimals (0.2,
// 1.15). Nothing for a missing or zero amount. Scaled amounts and grocery
// totals come through here too.
export function formatQuantity(quantity: number): string {
  if (!Number.isFinite(quantity) || quantity <= 0) return "";
  let whole = Math.floor(quantity);
  const part = quantity - whole;
  if (part > 1 - FRACTION_TOLERANCE) whole += 1;
  if (part < FRACTION_TOLERANCE || part > 1 - FRACTION_TOLERANCE) {
    if (whole > 0) return String(whole);
  } else {
    for (const den of DENOMINATORS) {
      const num = Math.round(part * den);
      if (num > 0 && num < den && Math.abs(part - num / den) <= FRACTION_TOLERANCE) {
        return whole > 0 ? `${whole} ${num}/${den}` : `${num}/${den}`;
      }
    }
  }
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

// Prices some recipe sites print beside each line: "($0.20)", "($1.17*)",
// "( $2.50 )", or a bare "$0.43". Other parentheticals ("(15 oz can)") stay.
const COST_IN_PARENS = /\(\s*\$\s*\d+(?:[.,]\d+)?\s*\**\s*\)/g;
const BARE_COST = /\$\s*\d+(?:[.,]\d+)?\**/g;

// Costs and "*" footnote markers out, then the spaces, commas and empty
// parens they leave behind. Used on imported lines and again on display, so
// recipes saved before this cleanup read cleanly too.
export function cleanIngredientText(text: string): string {
  return text
    .replace(COST_IN_PARENS, " ")
    .replace(BARE_COST, " ")
    .replace(/\*+/g, "")
    .replace(/\s+/g, " ")
    .replace(/\(\s*\)/g, "")
    .replace(/\(\s+/g, "(")
    .replace(/\s+([,;)])/g, "$1")
    .replace(/([,;])(?:\s*[,;])+/g, "$1")
    .replace(/\s+/g, " ")
    .replace(/^[\s,;]+|[\s,;]+$/g, "");
}

function words(text: string): string[] {
  return text.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
}

// True when every word of the note is already in the name: "uncooked" beside
// "uncooked penne pasta".
function repeatsName(note: string, name: string): boolean {
  const noteWords = words(note);
  if (noteWords.length === 0) return false;
  const nameWords = new Set(words(name));
  return noteWords.every((w) => nameWords.has(w));
}

// "garlic, " -> "garlic", "uncooked penne pasta (uncooked)" -> "uncooked
// penne pasta". Trailing commas, prices and repeated notes come in with
// imported lines.
export function cleanIngredientName(name: string): string {
  const cleaned = cleanIngredientText(name);
  const paren = cleaned.match(/^(.*\S)\s*\(([^()]*)\)$/);
  return paren && repeatsName(paren[2], paren[1]) ? paren[1] : cleaned;
}

// A note as it should show beside its ingredient: costs and markers out, and
// any comma-separated part that only repeats the name dropped. Empty when
// nothing is left.
export function cleanIngredientNote(note: string | null | undefined, name: string): string {
  if (!note) return "";
  const cleaned = cleanIngredientText(note).replace(/^\(([^()]*)\)$/, "$1");
  return cleanIngredientText(
    cleaned
      .split(",")
      .filter((part) => !repeatsName(part, name))
      .join(",")
  );
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
