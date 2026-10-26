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

// Salt and pepper, which a recipe seasons to taste when it gives no amount.
const SEASONING =
  /^(?:(?:kosher|sea|table|fine|flaky|coarse)\s+)?salt\b|^(?:freshly\s+)?(?:ground\s+)?(?:black|white)\s+pepper\b/i;
// Names that never take a count. Older imports saved these as "1 each", which
// showed as "1 Salt and freshly ground black pepper".
const UNMEASURED_NAME = new RegExp(
  `\\b(?:to taste|as needed|for serving|for garnish|optional)\\b|^(?:an?\\s+)?(?:pinch|dash) of\\b|${SEASONING.source}`,
  "i"
);

// "salt and pepper" with no amount -> "Salt and pepper, to taste". It starts
// the line, so it starts with a capital; the rest keeps its case.
function seasonToTaste(name: string): string {
  const named = name.charAt(0).toUpperCase() + name.slice(1);
  return /\b(?:to taste|as needed)\b/i.test(named) ? named : `${named}, to taste`;
}

// A size in parens at the front of a saved name: "(8 oz.) packages cream
// cheese" -> "8 oz", "packages cream cheese". Older imports saved these.
function takeLeadingParen(name: string, into: string[]): string {
  const paren = name.match(/^\(([^()]+)\)\s*(.+)$/);
  if (!paren) return name;
  into.push(parenNote(paren[1]));
  return paren[2];
}

// A unit at the front of a saved name: "cup(s)", "pkg", "Tbsp.".
function nameUnit(word: string): string | null {
  return unitWord(word) ?? UNIT_ABBREVIATIONS[word.toLowerCase().replace(/\.$/, "")] ?? null;
}

// The amount and the name apart, so a page can style them differently. A
// line the importer couldn't read a unit from was saved as a plain count with
// the unit left in the name ("cup(s) powdered sugar"); that unit is used.
// Older imports also left the end of a range ("to 1 teaspoon red pepper
// flakes"), a size word ("Heaping teaspoon ground cinnamon") or a size in
// parens ("(8 oz.) packages cream cheese") in the name; those are read back
// out here too. Salt and pepper with no amount read "to taste".
export function formatIngredient(quantity: number, unit: string, name: string): { amount: string; name: string } {
  const sizes: string[] = [];
  let rest = takeLeadingParen(cleanIngredientName(name), sizes);
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
  if (COUNT_UNITS.has(unit.trim().toLowerCase()) && lead && nameUnit(lead[1])) {
    shownUnit = lead[1];
    shownName = lead[2];
  }
  // "cup(s) (1 stick) unsalted butter": the size can follow the unit.
  shownName = takeLeadingParen(shownName, sizes);
  if (size) sizes.push(size);
  if (sizes.length) shownName = `${shownName} (${sizes.join(", ")})`;

  let amount = formatAmount(quantity, shownUnit);
  if (COUNT_UNITS.has(shownUnit.trim().toLowerCase()) && UNMEASURED_NAME.test(shownName)) amount = "";
  else if (quantity > 0 && upper > quantity) amount = formatRange(quantity, upper, shownUnit);
  if (!amount && SEASONING.test(shownName)) shownName = seasonToTaste(shownName);
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
  // Size words, a size in parens after the amount and to-taste phrases taken
  // off the line: "heaping", "8 oz", "to taste".
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
    // "2 (8 oz.) packages cream cheese", "1.5 lb (700 grams) chicken": a size
    // in parens right after the amount is a note, and the unit can follow it.
    const paren = rest.match(/^\(([^()]+)\)\s*/);
    if (paren) {
      notes.push(parenNote(paren[1]));
      rest = rest.slice(paren[0].length);
      if (unit === null) ({ unit, rest } = readUnit(rest, lookup));
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

// ─── Import parsing ─────────────────────────────────────────────
//
// What the importer saves for one line: the amount, the unit, the ingredient
// name and a note. Pure, so it can be checked without the database; the
// importer (lib/ingredient-parse.ts) adds the ingredient and unit rows.

// Unit spellings recipe sites use, to the unit names in the units table.
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

// A unit word or abbreviation ("cups", "tsp", "cloves") to its row in the
// units table, or null when it isn't one.
export function makeUnitLookup<U extends { name: string; abbreviation: string }>(
  units: U[]
): (word: string) => U | null {
  const byWord = new Map<string, U>();
  for (const unit of units) {
    byWord.set(unit.name.toLowerCase(), unit);
    byWord.set(unit.abbreviation.toLowerCase(), unit);
  }
  return (word) => {
    const alias = UNIT_ALIASES[word];
    return byWord.get(word) ?? (alias ? byWord.get(alias) : undefined) ?? null;
  };
}

const COLOR_WORDS = ["red", "green", "yellow", "orange", "white", "black", "purple", "brown", "golden"];
const SIZE_NAME_WORDS = ["large", "small", "medium", "big", "jumbo", "very", "extra"];
// Words that describe an ingredient but never name one. A list of them can
// hold commas ("boneless, skinless chicken breast") without the rest of the
// line being a note.
const DESCRIPTORS = new Set([
  ...COLOR_WORDS,
  ...SIZE_NAME_WORDS,
  "boneless", "skinless", "bone-in", "skin-on", "fresh", "frozen", "dried", "ripe", "raw",
  "uncooked", "cooked", "lean", "unsalted", "salted", "whole", "plain", "organic", "thick",
  "thin", "thick-cut", "hot", "mild", "light", "dark", "low-fat", "fat-free", "reduced-fat",
  "low-sodium", "extra-virgin", "virgin", "firm", "soft", "sharp", "baby",
]);

// Prep words that start a note when they come after the noun: "yellow onion
// sliced fairly thin", "potatoes cut in small pieces". Before the noun they
// stay in the name ("diced tomatoes", "shredded cheese").
const PREP_WORDS = new Set([
  "chopped", "diced", "minced", "sliced", "cubed", "grated", "shredded", "crushed", "peeled",
  "cut", "halved", "quartered", "beaten", "melted", "softened", "divided", "rinsed", "drained",
  "thawed", "trimmed", "seeded", "cored", "pitted", "julienned", "mashed", "zested", "juiced",
  "sifted", "toasted", "deveined", "torn",
]);
const PREP_ADVERBS = new Set([
  "finely", "thinly", "roughly", "coarsely", "very", "fairly", "lightly", "well", "freshly",
  "thickly", "evenly",
]);
// What can follow a prep word when it starts a note. Anything else means the
// prep word describes a noun after it ("fire roasted diced tomatoes").
const PREP_FOLLOWERS = new Set([
  ...PREP_ADVERBS,
  "in", "into", "to", "for", "and", "or", "then", "at", "on", "with", "about", "lengthwise",
  "crosswise", "thin", "thick", "fine", "small", "large", "bite-size", "bite-sized",
]);
// Prep and state words the note keeps when they would be in both: "uncooked
// penne pasta" with the note "uncooked" saves as "penne pasta", "uncooked".
const STATE_WORDS = new Set([...PREP_WORDS, "uncooked", "cooked", "raw", "fresh", "frozen"]);

const bare = (word: string) => word.toLowerCase().replace(/^[^a-z0-9]+|[^a-z0-9-]+$/g, "");
const isDescriptor = (word: string) => DESCRIPTORS.has(bare(word));

// True for "large red", "boneless", "red, yellow, or orange": descriptor words
// only, with "and"/"or" between them. Never a whole ingredient name.
function onlyDescriptors(text: string): boolean {
  const list = text.split(/[\s,]+/).filter((w) => w && !/^(?:and|or)$/i.test(w));
  return list.length > 0 && list.every(isDescriptor);
}

// "8 oz." -> "8 oz", for a size in parens.
function parenNote(text: string): string {
  return text.trim().replace(/\.$/, "");
}

// The words before a prep phrase that runs to the end of the name, and the
// phrase: "yellow onion sliced fairly thin" -> "yellow onion", "sliced fairly
// thin". The prep word has to follow a noun, so "diced tomatoes" stays whole.
function splitPrepPhrase(name: string): { name: string; note: string } {
  const words = name.split(/\s+/);
  for (let k = 1; k < words.length; k++) {
    if (!PREP_WORDS.has(bare(words[k]))) continue;
    const next = words[k + 1];
    if (next !== undefined && !PREP_FOLLOWERS.has(bare(next)) && !PREP_WORDS.has(bare(next))) continue;
    let start = k;
    while (start > 0 && PREP_ADVERBS.has(bare(words[start - 1]))) start--;
    if (!words.slice(0, start).some((w) => !isDescriptor(w))) continue;
    return { name: words.slice(0, start).join(" "), note: words.slice(start).join(" ") };
  }
  return { name, note: "" };
}

// Leading size words ("very large yellow onion") and a choice of colors ("red
// or green bell pepper") go to the note, so the name is the thing to buy.
// Eggs keep their size; "large eggs" is what the carton says. A name is
// never left as only colors or sizes.
const LEADING_SIZE = /^((?:(?:very|extra)[\s-]+)?(?:large|small|medium|big|jumbo)(?:-sized)?)\s+(.+)$/i;
const LEADING_COLOR_CHOICE = new RegExp(
  `^((?:${COLOR_WORDS.join("|")})(?:,?\\s+(?:(?:and|or)\\s+)?(?:${COLOR_WORDS.join("|")}))*,?\\s+or\\s+(?:${COLOR_WORDS.join("|")}))\\s+(.+)$`,
  "i"
);

function takeLeadingDescriptors(name: string): { name: string; notes: string[] } {
  const notes: string[] = [];
  let rest = name;
  const sized = rest.match(LEADING_SIZE);
  if (sized && !/^eggs?\b/i.test(sized[2]) && !onlyDescriptors(sized[2])) {
    notes.push(sized[1].toLowerCase());
    rest = sized[2];
  }
  const colors = rest.match(LEADING_COLOR_CHOICE);
  if (colors && !onlyDescriptors(colors[2])) {
    notes.push(colors[1].toLowerCase());
    rest = colors[2];
  }
  return { name: rest, notes };
}

// The name and notes of what is left of a line once the amount and unit are
// read: "boneless, skinless chicken breast (700 grams)" -> "boneless skinless
// chicken breast", ["700 grams"]. A comma starts the note, except inside a
// list of descriptors before the noun.
export function splitNameAndNote(text: string): { name: string; notes: string[] } {
  let name = text.trim();
  const tailNotes: string[] = [];

  const paren = name.match(/^(.+?)\s*\(([^()]+)\)$/);
  if (paren) {
    name = paren[1];
    tailNotes.push(parenNote(paren[2]));
  }

  const parts = name.split(",").map((p) => p.trim());
  let used = 1;
  let head = parts[0];
  while (used < parts.length && onlyDescriptors(head)) head = `${head}, ${parts[used++]}`;
  // "chicken boneless, skinless chicken breasts": the noun before the comma
  // is repeated after it, so the comma is inside one name.
  if (used === 1 && parts.length > 1) {
    const headWords = head.split(/\s+/);
    const tailWords = new Set(parts[1].split(/\s+/).map(bare));
    const nouns = headWords.filter((w) => !isDescriptor(w));
    if (isDescriptor(headWords[headWords.length - 1]) && nouns.length > 0 && nouns.every((w) => tailWords.has(bare(w)))) {
      head = [...headWords.filter(isDescriptor), parts[1]].join(" ");
      used = 2;
    }
  }
  // "boneless, skinless chicken breast" reads as one name without commas; a
  // choice ("red, yellow, or orange") keeps them.
  if (!/\b(?:and|or)\b/i.test(head)) head = head.replace(/,/g, "");
  const commaNote = parts.slice(used).join(", ").trim();
  if (commaNote) tailNotes.unshift(commaNote);

  const prep = splitPrepPhrase(head);
  const lead = takeLeadingDescriptors(prep.name);
  return { name: lead.name.trim(), notes: [...lead.notes, prep.note, ...tailNotes].filter(Boolean) };
}

// A word should be in the name or the note, not both. Prep and state words
// ("uncooked", "chopped") stay in the note and leave the front of the name;
// any other repeated part of the note is dropped. The name keeps at least
// one word.
export function dedupeNameAndNote(name: string, note: string): { name: string; note: string } {
  const noteWords = new Set(words(note));
  const nameWords = name.split(/\s+/);
  while (nameWords.length > 1 && STATE_WORDS.has(bare(nameWords[0])) && noteWords.has(bare(nameWords[0]))) {
    nameWords.shift();
  }
  const cleanName = nameWords.join(" ");
  return { name: cleanName, note: cleanIngredientNote(note, cleanName) };
}

export interface ParsedIngredientText<U> {
  // What is saved: the top of a range, or 0 for a line with no amount.
  quantity: number;
  unit: U | null;
  name: string;
  notes: string;
  optional: boolean;
}

// One imported line ("1/2 lb. penne pasta (uncooked) ($0.75)") as it will be
// saved. Null when nothing is left to name an ingredient.
export function parseIngredientText<U extends { abbreviation: string }>(
  raw: string,
  lookup: (word: string) => U | null
): ParsedIngredientText<U> | null {
  let text = raw.trim();
  const optional = /\boptional\b/i.test(text);
  text = text.replace(/\(?\boptional\b\)?/i, "").trim();
  // "($0.20)" and "garlic*" from sites that price or footnote each line.
  text = cleanIngredientText(text);
  if (!text) return null;

  // A line with no number ("Salt and freshly ground black pepper") is saved
  // with quantity 0: no amount, not a count of 1. A range ("1/2 to 1 tsp") is
  // saved at its upper end so a grocery list covers the most the recipe could
  // use, and the full range is kept in the notes.
  const line = readIngredientLine(text, lookup);
  const range =
    line.quantityMax > line.quantity
      ? formatRange(line.quantity, line.quantityMax, line.unit?.abbreviation ?? "ea")
      : "";

  const split = splitNameAndNote(line.name);
  // "garlic, (minced)" leaves "garlic," before the note.
  const name = cleanIngredientName(split.name);
  if (!name) return null;
  const deduped = dedupeNameAndNote(name, [range, ...line.notes, ...split.notes].filter(Boolean).join(", "));
  return { quantity: line.quantityMax, unit: line.unit, name: deduped.name, notes: deduped.note, optional };
}

// ─── Matching a name to the Ingredient table ────────────────────
//
// Ingredient names are unique, and SQL Server compares them without case.
// A line matches a row only when they name the same thing: the same words,
// ignoring case and a plural on the last word ("onions" is "onion"). A
// shorter name never matches a longer one, so "garlic" is never "garlic
// parmesan breading".

// "Onions" -> "Onion", "berries" -> "berry". Rough, but both sides of a
// match go through it, so it only has to be consistent.
function singular(word: string): string {
  if (/(?:ss|us|is)$/i.test(word)) return word;
  if (/ies$/i.test(word) && word.length > 4) return `${word.slice(0, -3)}y`;
  if (/(?:oes|ches|shes|xes)$/i.test(word)) return word.slice(0, -2);
  if (/s$/i.test(word) && word.length > 2) return word.slice(0, -1);
  return word;
}

// "Green  Onions" -> "green onion". Two names with the same key are the same
// ingredient.
export function ingredientKey(name: string): string {
  const parts = name.trim().toLowerCase().split(/\s+/);
  parts[parts.length - 1] = singular(parts[parts.length - 1]);
  return parts.join(" ");
}

// The spellings to look up for a name: as written, singular, and plural.
export function ingredientNameVariants(name: string): string[] {
  const clean = name.trim().replace(/\s+/g, " ");
  const parts = clean.split(" ");
  const last = parts.pop() ?? "";
  const one = singular(last);
  const stem = parts.length ? `${parts.join(" ")} ` : "";
  const forms = [last, one, `${one}s`, `${one}es`];
  if (/y$/i.test(one)) forms.push(`${one.slice(0, -1)}ies`);
  return [...new Set(forms.map((f) => stem + f))];
}

// The row a name should use: the same name exactly, then the same name in
// another case, then the same name singular or plural. Null when none is the
// same ingredient.
export function pickIngredientMatch<T extends { name: string }>(name: string, rows: T[]): T | null {
  const clean = name.trim().replace(/\s+/g, " ");
  const key = ingredientKey(clean);
  return (
    rows.find((r) => r.name === clean) ??
    rows.find((r) => r.name.toLowerCase() === clean.toLowerCase()) ??
    rows.find((r) => ingredientKey(r.name) === key) ??
    null
  );
}
