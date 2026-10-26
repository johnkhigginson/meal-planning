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

// Spoon units read as the abbreviations the units table uses, so a unit
// recovered from a name ("teaspoon cinnamon") matches the rest of the list.
const SHORT_UNITS: Record<string, string> = { teaspoon: "tsp", tablespoon: "tbsp" };

const SINGULAR = new Map<string, string>();
for (const [one, many] of Object.entries(UNIT_WORDS)) {
  SINGULAR.set(one, one);
  SINGULAR.set(many, one);
}
for (const [word, short] of Object.entries(SHORT_UNITS)) SINGULAR.set(short, word);

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
  return SHORT_UNITS[word] ?? (quantity > 1 ? UNIT_WORDS[word] : word);
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

// "1/2 to 1 tsp": both ends, with the unit once.
export function formatRange(low: number, high: number, unit: string): string {
  return `${formatQuantity(low)} to ${formatAmount(high, unit)}`;
}

// Words that size a measure ("heaping teaspoon", "large can"). They only count
// as a size when a unit follows; "2 medium onions" keeps "medium" in the name.
const SIZE_WORDS = /^(heaping|heaped|level|scant|rounded|generous|large|small|medium)\s+(.+)$/i;

// Names that never take a count. Older imports saved these as "1 each", which
// showed as "1 Salt and freshly ground black pepper".
const UNMEASURED_NAME =
  /\b(?:to taste|as needed|for serving|for garnish|optional)\b|^(?:an?\s+)?(?:pinch|dash) of\b|^(?:(?:kosher|sea|table|fine|flaky|coarse)\s+)?salt\b|^(?:freshly\s+)?(?:ground\s+)?(?:black|white)\s+pepper\b/i;

// The amount and the name apart, so a page can style them differently. A
// line the importer couldn't read a unit from was saved as a plain count with
// the unit left in the name ("cup(s) powdered sugar"); that unit is used.
// Older imports also left the end of a range ("to 1 teaspoon red pepper
// flakes") or a size word ("Heaping teaspoon ground cinnamon") in the name;
// those are read back out here too.
export function formatIngredient(quantity: number, unit: string, name: string): { amount: string; name: string } {
  let rest = cleanIngredientName(name);
  let upper = 0;
  const range = rest.match(RANGE_IN_NAME);
  if (range) {
    upper = numberValue(range[1]);
    rest = range[2];
  }
  let size = "";
  const sized = rest.match(SIZE_WORDS);
  if (sized) {
    const next = sized[2].split(/\s+/)[0];
    if (unitWord(next) || next.toLowerCase().replace(/\.$/, "") === unit.trim().toLowerCase()) {
      size = sized[1].toLowerCase();
      rest = sized[2];
    }
  }

  let shownUnit = unit;
  let shownName = stripLeadingUnit(rest, unit);
  const lead = rest.match(/^(\S+)\s+(.+)$/);
  if (COUNT_UNITS.has(unit.trim().toLowerCase()) && lead && unitWord(lead[1])) {
    shownUnit = lead[1];
    shownName = lead[2];
  }
  if (size) shownName = `${shownName} (${size})`;

  let amount = formatAmount(quantity, shownUnit);
  if (COUNT_UNITS.has(shownUnit.trim().toLowerCase()) && UNMEASURED_NAME.test(shownName)) amount = "";
  else if (quantity > 0 && upper > quantity) amount = formatRange(quantity, upper, shownUnit);
  return { amount, name: shownName };
}

// "1.5 cups powdered sugar", for plain-text uses like JSON-LD.
export function formatIngredientLine(quantity: number, unit: string, name: string): string {
  const parts = formatIngredient(quantity, unit, name);
  return [parts.amount, parts.name].filter(Boolean).join(" ");
}

// Reading a typed or imported line ("1/2 to 1 tsp red pepper flakes") into an
// amount, a unit and a name. The importer passes its own unit lookup (the
// units table); formatIngredientText uses the unit words above.

const UNICODE_FRACTIONS: Record<string, number> = {
  "½": 0.5, "⅓": 0.333, "⅔": 0.667, "¼": 0.25, "¾": 0.75,
  "⅛": 0.125, "⅜": 0.375, "⅝": 0.625, "⅞": 0.875,
  "⅕": 0.2, "⅖": 0.4, "⅗": 0.6, "⅘": 0.8, "⅙": 0.167, "⅚": 0.833,
};
const FRACTION_CHARS = Object.keys(UNICODE_FRACTIONS).join("");

// One amount: "1 1/2", "1-1/2", "1/2", "1½", "1 ½", "½", "1.5", "2".
const NUMBER = `(?:\\d+(?:\\s+|-)\\d+/\\d+|\\d+/\\d+|\\d*\\s*[${FRACTION_CHARS}]|\\d+(?:\\.\\d+)?)`;
const LEADING_NUMBER = new RegExp(`^(${NUMBER})\\s*`);
// The second half of a range: "to 1", "-2", "–1" (en dash).
const RANGE_END = new RegExp(`^(?:[-–]|to\\b)\\s*(${NUMBER})(?![\\d/])\\s*`, "i");
// The same, left at the front of a saved name by older imports.
const RANGE_IN_NAME = new RegExp(`^(?:[-–]|to\\b)\\s*(${NUMBER})\\s+(.+)$`, "i");

function numberValue(text: string): number {
  let total = 0;
  const parts = text
    .replace(/(\d)-(?=\d+\/)/, "$1 ")
    .replace(new RegExp(`([${FRACTION_CHARS}])`), " $1")
    .trim()
    .split(/\s+/);
  for (const part of parts) {
    if (part in UNICODE_FRACTIONS) total += UNICODE_FRACTIONS[part];
    else if (part.includes("/")) {
      const [num, den] = part.split("/").map(Number);
      if (den) total += num / den;
    } else total += Number(part) || 0;
  }
  return total;
}

// The amount at the start of a line. A line with no leading number has no
// amount (quantity 0), never a made-up 1. A range keeps both ends.
export function readQuantity(text: string): { quantity: number; quantityMax: number; rest: string } {
  const s = text.trim().replace(/\u2044/g, "/");
  const first = s.match(LEADING_NUMBER);
  if (!first) return { quantity: 0, quantityMax: 0, rest: s };
  const quantity = numberValue(first[1]);
  const rest = s.slice(first[0].length);
  const second = rest.match(RANGE_END);
  if (second) {
    const high = numberValue(second[1]);
    if (high > quantity) return { quantity, quantityMax: high, rest: rest.slice(second[0].length) };
  }
  return { quantity, quantityMax: quantity, rest };
}

// A unit of one or two words at the start of text, via the caller's lookup.
function readUnit<U>(text: string, lookup: (word: string) => U | null): { unit: U | null; rest: string } {
  const words = text.trim().split(/\s+/);
  for (const len of [2, 1]) {
    if (words.length < len) continue;
    // "cup(s)" and "clove(s)" are written by some recipe sites.
    const candidate = words
      .slice(0, len)
      .join(" ")
      .toLowerCase()
      .replace(/\.$/, "")
      .replace(/\((e?s)\)$/, "");
    const unit = lookup(candidate);
    if (unit !== null) return { unit, rest: words.slice(len).join(" ") };
  }
  return { unit: null, rest: text.trim() };
}

// "a pinch of salt" with no number: no amount, and "a pinch" kept as a note.
const SMALL_AMOUNT = /^(?:an?\s+)?(pinch|dash|splash|handful)(?:es)?\s+of\s+(.+)$/i;
// "salt, to taste", "parsley (for garnish)", "plus more as needed".
const UNMEASURED_TAIL =
  /[\s,;]*\(?\s*((?:(?:plus|and|or)\s+(?:more\s+|extra\s+)?)?(?:to taste|as needed|for serving|for garnish|optional))\s*\)?\s*$/i;

export interface IngredientLine<U> {
  // 0 when the line has no amount ("Salt and freshly ground black pepper").
  quantity: number;
  // The top of a range ("1/2 to 1"); the same as quantity otherwise.
  quantityMax: number;
  unit: U | null;
  // The rest of the line: the name and any comma or paren notes.
  name: string;
  // Size words and to-taste phrases taken off the line: "heaping", "to taste".
  notes: string[];
}

export function readIngredientLine<U>(text: string, lookup: (word: string) => U | null): IngredientLine<U> {
  const { quantity, quantityMax, rest: afterQty } = readQuantity(text);
  const notes: string[] = [];
  let unit: U | null = null;
  let rest = afterQty;

  if (quantity > 0) {
    const sized = afterQty.match(SIZE_WORDS);
    const afterSize = sized ? readUnit(sized[2], lookup) : null;
    if (sized && afterSize?.unit != null) {
      notes.push(sized[1].toLowerCase());
      ({ unit, rest } = afterSize);
    } else {
      ({ unit, rest } = readUnit(afterQty, lookup));
    }
  } else {
    const small = afterQty.match(SMALL_AMOUNT);
    if (small) {
      notes.push(`a ${small[1].toLowerCase()}`);
      rest = small[2];
    }
  }

  rest = rest.replace(/^(of|the)\s+/i, "");
  const tail = rest.match(UNMEASURED_TAIL);
  if (tail && tail.index) {
    notes.push(tail[1].toLowerCase());
    rest = rest.slice(0, tail.index);
  }
  return { quantity, quantityMax, unit, name: rest.trim(), notes };
}

// Unit words and the common abbreviations, for reading a line without the
// units table.
const UNIT_ABBREVIATIONS: Record<string, string> = {
  tsp: "tsp", tsps: "tsp", tbsp: "tbsp", tbsps: "tbsp", tbs: "tbsp",
  oz: "oz", "fl oz": "fl oz", lb: "lb", lbs: "lb", g: "g", kg: "kg", ml: "ml",
  pt: "pt", qt: "qt", gal: "gal", doz: "doz", pkg: "pkg",
};
function displayUnit(word: string): string | null {
  return UNIT_ABBREVIATIONS[word] ?? unitWord(word);
}

// A raw line as it should read on a list: "1/2 to 1 tsp red pepper flakes",
// "1/4 tsp ground cinnamon (heaping)", "Salt and freshly ground black pepper".
export function formatIngredientText(text: string): string {
  const line = readIngredientLine(cleanIngredientText(text), displayUnit);
  const unit = line.unit ?? "";
  const amount =
    line.quantityMax > line.quantity
      ? formatRange(line.quantity, line.quantityMax, unit)
      : formatAmount(line.quantity, unit);
  const name = line.notes.length ? `${line.name} (${line.notes.join(", ")})` : line.name;
  return [amount, name].filter(Boolean).join(" ");
}
