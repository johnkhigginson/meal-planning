// DRY RUN ONLY. This script reads the database and writes a report of
// PROPOSED ingredient cleanups to local files. It never writes to the
// database: there is no code path that does, not even behind a flag.
//
// Every query goes through selectOnly(), which throws unless the SQL is a
// single SELECT. All reads run inside one transaction that is always rolled
// back. The connection also asks for read-only intent.
//
// Proposals come from the app's own parser (src/lib/ingredient-format.ts), so
// they match what a fresh import of the same line would save.
//
// Run:
//   npx tsx scripts/cleanup-ingredients-preview.ts --out <dir>
//   npx tsx scripts/cleanup-ingredients-preview.ts --self-test [--out <dir>]   (no database)
//   npx tsx scripts/cleanup-ingredients-preview.ts --from-csv <proposed-changes.csv> [--out <dir>]   (no database)
//
// scripts/cleanup-ingredients-apply.ts imports the analysis from here. The
// CLI below only runs when this file is the one run.

import { createRequire } from "node:module";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import {
  cleanIngredientName,
  cleanIngredientText,
  formatAmount,
  ingredientKey,
  makeUnitLookup,
  parseIngredientText,
  pickIngredientMatch,
  splitNameAndNote,
  tidyIngredientNote,
} from "../src/lib/ingredient-format";

// Packages resolve from this file's folder, then from the app it is run
// from (the current directory), so a copy outside the app still finds them.
export function appRequire(name: string): unknown {
  try {
    return createRequire(import.meta.url)(name);
  } catch {
    return createRequire(join(process.cwd(), "package.json"))(name);
  }
}
// The app's .env, as `import "dotenv/config"` loads it.
appRequire("dotenv/config");

// ─── Rows as loaded ─────────────────────────────────────────────

export interface UnitRow { id: number; name: string; abbreviation: string; unitType: string }
export interface IngredientRow { id: number; name: string }
export interface RecipeRow { id: number; householdId: number; name: string }
export interface LibraryRecipeRow { id: number; name: string }
// RecipeIngredient and LibraryRecipeIngredient; recipeId is libraryRecipeId
// for the library table.
export interface LineRow { id: number; recipeId: number; ingredientId: number; quantity: number; unitId: number; notes: string | null }
export interface GroceryListRow { id: number; householdId: number; mealPlanId: number | null; name: string }
export interface GroceryItemRow { id: number; groceryListId: number; ingredientId: number; quantity: number; unitId: number }
export interface InventoryRow { id: number; householdId: number; ingredientId: number; quantity: number; unitId: number }
export interface StorePriceRow { id: number; storeId: number; ingredientId: number; quantity: number; unitId: number }
export interface MealPlanRow { id: number; householdId: number; weekStartDate: Date }
export interface MealPlanEntryRow { mealPlanId: number; recipeId: number | null }

export interface Snapshot {
  units: UnitRow[];
  ingredients: IngredientRow[];
  recipes: RecipeRow[];
  recipeLines: LineRow[];
  libraryRecipes: LibraryRecipeRow[];
  libraryLines: LineRow[];
  groceryLists: GroceryListRow[];
  groceryItems: GroceryItemRow[];
  inventory: InventoryRow[];
  storePrices: StorePriceRow[];
  mealPlans: MealPlanRow[];
  mealPlanEntries: MealPlanEntryRow[];
}

// ─── The query guard ────────────────────────────────────────────

// Words that have no place in a read. Matched as whole words, any case, so a
// column like "updatedAt" is fine and "UPDATE" is not.
const FORBIDDEN_WORDS =
  /\b(?:insert|update|delete|merge|exec|execute|alter|drop|create|truncate|into|grant|revoke|deny|dbcc|bulk|openrowset|openquery|opendatasource|backup|restore|shutdown|kill|declare|set|use|waitfor|begin|commit|rollback|save)\b/i;

// Throws unless the SQL is one SELECT and nothing else: no second statement,
// no comments that could hide one, no write or control keyword anywhere.
export function selectOnly(sql: string): string {
  const text = sql.trim();
  if (!/^select\b/i.test(text)) throw new Error("Query guard: only SELECT is allowed");
  if (/;|--|\/\*/.test(text)) throw new Error("Query guard: semicolons and comments are not allowed");
  const hit = text.match(FORBIDDEN_WORDS);
  if (hit) throw new Error(`Query guard: "${hit[0]}" is not allowed`);
  if (/\b(?:sp|xp)_\w+/i.test(text)) throw new Error("Query guard: stored procedures are not allowed");
  if ((text.match(/\bselect\b/gi) ?? []).length !== 1) throw new Error("Query guard: one SELECT per query");
  return text;
}

// ─── Reading the database ───────────────────────────────────────

// The parts of the mssql package this script uses. It ships no types.
interface SqlRequest { query<T>(command: string): Promise<{ recordset: T[] }> }
interface SqlPool { connect(): Promise<SqlPool>; close(): Promise<void> }
interface SqlTransaction { begin(isolationLevel?: number): Promise<SqlTransaction>; rollback(): Promise<void> }
interface MssqlModule {
  ConnectionPool: new (config: object) => SqlPool;
  Transaction: new (pool: SqlPool) => SqlTransaction;
  Request: new (parent: SqlPool | SqlTransaction) => SqlRequest;
  ISOLATION_LEVEL: { READ_COMMITTED: number; SNAPSHOT: number };
}

// Every query the script runs. Ids only for households; no emails or names
// of people.
export const QUERIES = {
  snapshotState: "SELECT snapshot_isolation_state AS snapshot FROM sys.databases WHERE name = DB_NAME()",
  units: "SELECT id, name, abbreviation, unitType FROM [Unit]",
  ingredients: "SELECT id, name FROM [Ingredient]",
  recipes: "SELECT id, householdId, name FROM [Recipe]",
  recipeLines: "SELECT id, recipeId, ingredientId, quantity, unitId, notes FROM [RecipeIngredient]",
  libraryRecipes: "SELECT id, name FROM [LibraryRecipe]",
  libraryLines:
    "SELECT id, libraryRecipeId AS recipeId, ingredientId, quantity, unitId, notes FROM [LibraryRecipeIngredient]",
  groceryLists: "SELECT id, householdId, mealPlanId, name FROM [GroceryList]",
  groceryItems: "SELECT id, groceryListId, ingredientId, quantity, unitId FROM [GroceryListItem]",
  inventory: "SELECT id, householdId, ingredientId, quantity, unitId FROM [InventoryItem]",
  storePrices: "SELECT id, storeId, ingredientId, quantity, unitId FROM [StorePrice]",
  mealPlans: "SELECT id, householdId, weekStartDate FROM [MealPlan]",
  mealPlanEntries: "SELECT mealPlanId, recipeId FROM [MealPlanEntry]",
};

interface LoadResult { snapshot: Snapshot; isolation: string }

// Same settings as src/lib/prisma.ts. The preview always asks for read-only
// intent; the apply script asks for it on a dry run.
export function connectionConfig(readOnlyIntent: boolean): object {
  return {
    server: process.env.DB_HOST!,
    port: parseInt(process.env.DB_PORT || "1433", 10),
    database: process.env.DB_NAME!,
    user: process.env.DB_USER!,
    password: process.env.DB_PASSWORD!,
    options: { encrypt: true, trustServerCertificate: true, ...(readOnlyIntent ? { readOnlyIntent: true } : {}) },
  };
}

// Every table the analysis reads, through the caller's read function, in
// the order the preview has always read them.
export async function readSnapshot(read: <T>(sql: string) => Promise<T[]>): Promise<Snapshot> {
  return {
    units: await read(QUERIES.units),
    ingredients: await read(QUERIES.ingredients),
    recipes: await read(QUERIES.recipes),
    recipeLines: await read(QUERIES.recipeLines),
    libraryRecipes: await read(QUERIES.libraryRecipes),
    libraryLines: await read(QUERIES.libraryLines),
    groceryLists: await read(QUERIES.groceryLists),
    groceryItems: await read(QUERIES.groceryItems),
    inventory: await read(QUERIES.inventory),
    storePrices: await read(QUERIES.storePrices),
    mealPlans: await read(QUERIES.mealPlans),
    mealPlanEntries: await read(QUERIES.mealPlanEntries),
  };
}

async function loadSnapshot(): Promise<LoadResult> {
  const mssql = appRequire("mssql") as MssqlModule;
  // Same settings as src/lib/prisma.ts, plus read-only intent.
  const pool = new mssql.ConnectionPool(connectionConfig(true));
  await pool.connect();
  let tx: SqlTransaction | null = null;
  try {
    const read = async <T>(parent: SqlPool | SqlTransaction, sql: string) =>
      (await new mssql.Request(parent).query<T>(selectOnly(sql))).recordset;

    // Snapshot gives every table read the same point in time. It needs
    // ALLOW_SNAPSHOT_ISOLATION on the database; READ COMMITTED otherwise.
    const [state] = await read<{ snapshot: number }>(pool, QUERIES.snapshotState);
    const snapshotOn = state?.snapshot === 1;
    const isolation = snapshotOn ? "SNAPSHOT" : "READ COMMITTED";
    tx = new mssql.Transaction(pool);
    // The driver sends "SET TRANSACTION ISOLATION LEVEL ...;BEGIN TRAN".
    await tx.begin(snapshotOn ? mssql.ISOLATION_LEVEL.SNAPSHOT : mssql.ISOLATION_LEVEL.READ_COMMITTED);
    const t = tx;

    const snapshot = await readSnapshot((sql) => read(t, sql));
    return { snapshot, isolation };
  } finally {
    // Always rolled back, even after a clean read. Nothing was written, and
    // this makes sure nothing could be kept.
    if (tx) await tx.rollback().catch(() => undefined);
    await pool.close();
  }
}

// ─── Reading names ──────────────────────────────────────────────
//
// Word lists for spotting bad names. They follow the lists in
// ingredient-format.ts, which doesn't export them.

const COLOR_WORDS = ["red", "green", "yellow", "orange", "white", "black", "purple", "brown", "golden"];
const SIZE_WORDS = ["large", "small", "medium", "big", "jumbo", "very", "extra"];
// A name made only of these has lost its noun ("large red").
const NOUNLESS_WORDS = new Set([...COLOR_WORDS, ...SIZE_WORDS]);
// A name ending in one of these was cut off mid-phrase ("chicken boneless").
const TRAILING_DESCRIPTORS = new Set([
  ...NOUNLESS_WORDS, "boneless", "skinless", "bone-in", "skin-on", "fresh", "frozen", "uncooked", "cooked",
  "unsalted", "salted", "lean", "whole", "raw",
]);
const PREP_WORDS = new Set([
  "chopped", "diced", "minced", "sliced", "cubed", "grated", "shredded", "crushed", "peeled", "cut",
  "halved", "quartered", "beaten", "melted", "softened", "divided", "rinsed", "drained", "thawed",
  "trimmed", "seeded", "cored", "pitted", "julienned", "mashed", "zested", "juiced", "sifted", "toasted",
  "deveined", "torn", "finely", "thinly", "roughly", "coarsely", "fairly", "lightly",
]);
// Prep done to a fresh whole thing, not a jar or a mix.
const FRESH_PREP = /\b(?:minced|crushed|chopped|diced|sliced|quartered|peeled|grated|halved|smashed|pressed|julienned|cubed)\b/i;
// Words that make a name a product rather than a plain ingredient.
const PRODUCT_WORDS = new Set([
  "breading", "sauce", "seasoning", "mix", "powder", "paste", "dressing", "soup", "blend", "spread",
  "salt", "crumbs", "flakes", "extract", "bread", "butter", "oil", "rub", "marinade", "dip", "chips",
]);
// The last word of a product made from X ("garlic powder", "ginger garlic
// paste"). A line on one is never moved to bare X.
const PRODUCT_FORMS = new Set(["powder", "paste", "salt", "oil", "sauce", "juice", "extract"]);
// Units that only fit some ingredients: "2 cloves" is garlic.
const UNIT_NOUNS: Record<string, string[]> = {
  clove: ["garlic"],
  head: ["garlic", "lettuce", "cabbage", "cauliflower", "broccoli"],
  stalk: ["celery", "lemongrass"],
  sprig: ["thyme", "rosemary", "parsley", "cilantro", "mint", "dill", "oregano", "basil"],
};
// Descriptors a name can carry after its noun ("chicken boneless"); the
// parser moves them to the front.
const AFTER_NOUN_DESCRIPTORS = new Set([
  "boneless", "skinless", "fresh", "frozen", "dried", "ground", "cooked", "raw", "unsalted", "salted",
  "low-sodium",
]);
// A leading word an old contains-match could have added: "uncooked penne
// pasta" for a line that said "penne pasta".
const STATE_LEAD = /^(uncooked)\s+(.+)$/i;
// "cooked rice" is its own ingredient, not "rice" with a stray word. Lines
// keep their link; the report asks once per name.
export const COOKED_LEAD = /^cooked\s+(.+)$/i;
const OF_CHOICE = /^\s*of\s+(?:your\s+)?choice$/i;
// "Your Favorite Pie Crust Recipe": a line that points to another recipe.
// It stays as written; the report asks.
const RECIPE_REFERENCE = /\brecipes?\b/i;
// "your favorite salsa" is salsa, with the choice in the note.
const FAVORITE_LEAD = /^\s*((?:your|my)\s+favou?rite)\s+(?=\S)/i;
// Containers at the front of a name ("package feta cheese"). After a weight
// or volume they describe the amount and are not the unit.
const CONTAINER_LEAD = /^(?:package|packages|pkg|pkgs|can|cans|jar|jars|box|boxes|bag|bags|bottle|bottles|carton|cartons|tub|tubs)\.?(?:\s+of)?\s/i;
// The tidy name for a cooked-X row, and the prep the parser takes off it:
// "cooked and cubed chicken breast" -> "cooked chicken breast", "cubed".
// Null when the prep follows the noun ("cooked chicken cut into pieces");
// that one is a line fix, not a naming question.
export function cookedTidy(name: string): { name: string; note: string } | null {
  const clean = cleanIngredientName(name);
  if (!COOKED_LEAD.test(clean)) return null;
  const split = splitNameAndNote(clean);
  if (!COOKED_LEAD.test(split.name)) return null;
  // "cooked rice of choice" is cooked rice with a note, not a line fix.
  const after = clean.slice(split.name.length);
  if (split.name !== clean && clean.toLowerCase().startsWith(split.name.toLowerCase()) && !OF_CHOICE.test(after)) return null;
  return { name: split.name, note: split.notes.join(", ") };
}
// "large or 40 small tomatoes": a second amount inside the name.
const ALT_AMOUNT = /^(large|small|medium)\s+or\s+(\d+(?:\.\d+)?)\s+(large|small|medium)\s+(.+)$/i;

const bare = (word: string) => word.toLowerCase().replace(/^[^a-z0-9]+|[^a-z0-9-]+$/g, "");
const wordsOf = (text: string) => text.toLowerCase().split(/[^a-z0-9-]+/).filter(Boolean);

function onlyNounless(name: string): boolean {
  const list = name.split(/[\s,]+/).map(bare).filter((w) => w && w !== "and" && w !== "or");
  return list.length > 0 && list.every((w) => NOUNLESS_WORDS.has(w));
}

function unbalanced(text: string): boolean {
  let depth = 0;
  for (const ch of text) {
    if (ch === "(") depth++;
    else if (ch === ")" && --depth < 0) return true;
  }
  return depth !== 0;
}

// Parens left open at the end, and ")" with no "(" before it.
function parenCounts(text: string): { open: number; stray: number } {
  let open = 0;
  let stray = 0;
  for (const ch of text) {
    if (ch === "(") open++;
    else if (ch === ")") {
      if (open > 0) open--;
      else stray++;
    }
  }
  return { open, stray };
}

// "(Preferably thighs, or breasts)": one paren group from start to end.
function wholeParen(text: string): boolean {
  const t = text.trim();
  if (!t.startsWith("(") || !t.endsWith(")")) return false;
  let depth = 0;
  for (let i = 0; i < t.length; i++) {
    if (t[i] === "(") depth++;
    else if (t[i] === ")" && --depth === 0 && i < t.length - 1) return false;
  }
  return depth === 0;
}

// The name with its paren groups taken out, to look for a dash or "or"
// that isn't inside one.
const outsideParens = (text: string) => {
  let t = text;
  while (/\([^()]*\)/.test(t)) t = t.replace(/\([^()]*\)/g, " ");
  return t;
};

export type UnitLookup = (word: string) => UnitRow | null;

// A unit as the first word of a name: "teaspoon(s) baking powder", "pkg
// cheese". One-letter words ("t", "c") are left alone unless written "c(s)".
function leadingUnit(name: string, lookup: UnitLookup): { unit: UnitRow; rest: string } | null {
  const m = name.trim().match(/^(\S+)\s+(.+)$/);
  if (!m) return null;
  const word = m[1].toLowerCase().replace(/\((e?s)\)$/, "").replace(/\.$/, "");
  if (word.length < 2 && !/\(e?s\)$/i.test(m[1])) return null;
  const unit = lookup(word);
  return unit ? { unit, rest: m[2] } : null;
}

interface NameProblems {
  // Reasons the row is junk (category E): "(", "(s)", "*", "$", parens,
  // a leading unit, descriptors only, a second amount.
  junk: string[];
  nounless: boolean;
  // The prep phrase the parser would move to the note ("sliced fairly thin").
  prep: string;
  // A note written into the name some other way: " - chopped", "or Swiss
  // chard", "lg.", "chicken boneless".
  layout: string[];
}

function nameProblems(name: string, lookup: UnitLookup): NameProblems {
  const junk: string[] = [];
  if (/^\s*\(/.test(name)) junk.push("starts with a parenthetical");
  if (/\(e?s\)/i.test(name)) junk.push('has "(s)"');
  if (name.includes("*")) junk.push('has "*"');
  if (name.includes("$")) junk.push('has "$"');
  if (unbalanced(name)) junk.push("unbalanced parens");
  if (/\(\s*\)/.test(name)) junk.push("empty parens");
  if (leadingUnit(name, lookup)) junk.push("starts with a unit word");
  const nounless = onlyNounless(name);
  if (nounless) junk.push("only size or color words");
  if (ALT_AMOUNT.test(name)) junk.push("has a second amount");
  if (/^\s*[-\u2013]\s*\d/.test(name)) junk.push("starts with the end of a range");
  const clean = cleanIngredientName(name);
  const split = splitNameAndNote(clean);
  const prep = split.notes.find((n) => PREP_WORDS.has(bare(n.split(/\s+/)[0]))) ?? "";
  const layout: string[] = [];
  const open = outsideParens(clean);
  if (/\s[-\u2013\u2014]\s/.test(open)) layout.push('has " - "');
  if (/\sor\s/i.test(open)) layout.push('has "or"');
  if (/^(?:lg|sm|med)\.\s/i.test(clean)) layout.push("abbreviated size");
  if (FAVORITE_LEAD.test(clean)) layout.push('starts with "your favorite"');
  const nameWords = clean.split(/\s+/);
  if (nameWords.length > 1 && AFTER_NOUN_DESCRIPTORS.has(bare(nameWords[nameWords.length - 1]))) {
    layout.push("descriptor after the noun");
  }
  return { junk, nounless, prep, layout };
}

// A proposed name that still looks wrong after the parser, for the last
// check on every proposal. Empty when it looks fine.
const NAME_ONLY_DESCRIPTORS = new Set([...TRAILING_DESCRIPTORS, ...PREP_WORDS]);
function badNameReasons(name: string, lookup: UnitLookup): string[] {
  const t = name.trim();
  const reasons: string[] = [];
  if (/^[^\p{L}\p{N}]|[^\p{L}\p{N})]$/u.test(t)) reasons.push("leading or trailing punctuation");
  if (unbalanced(t)) reasons.push("unbalanced parens");
  if (/^\d/.test(t)) reasons.push("starts with a digit");
  if (/\sor\s/i.test(t)) reasons.push('has " or "');
  if (/\s[-\u2013\u2014]\s/.test(t)) reasons.push('has " - "');
  if (leadingUnit(t, lookup)) reasons.push("starts with a unit word");
  // "A and B" counts as one word, so "salt and freshly ground black pepper"
  // and "long grain and wild rice" pass.
  const counted = t.split(/\s+/).filter((w, i, all) => w.toLowerCase() !== "and" && all[i - 1]?.toLowerCase() !== "and");
  if (counted.length > 5) reasons.push("more than 5 words");
  const list = t.split(/[\s,]+/).map(bare).filter((w) => w && w !== "and" && w !== "or");
  if (list.length && list.every((w) => NAME_ONLY_DESCRIPTORS.has(w))) reasons.push("only descriptor or color words");
  if (/[$*]/.test(t)) reasons.push('has "$" or "*"');
  if (/^(?:zest|juice|peel|rind)$/i.test(t)) reasons.push("names a part without its fruit");
  return reasons;
}

// ─── Spelling new names ─────────────────────────────────────────

// Proper and brand words a new name keeps capitalized. Every other word is
// lower case: "Soy Sauce" -> "soy sauce", "Parmesan cheese" stays.
const PROPER_PHRASES = ["Monterey Jack", "Salad Supreme", "Old Bay", "Town House", "Granny Smith", "Yukon Gold", "Cool Whip"];
const PROPER_WORDS = new Map(
  [
    "Parmesan", "Swiss", "Monterey", "Greek", "Italian", "French", "Mexican", "Cajun", "Thai", "Vidalia", "Ritz",
    "Prego", "REESE'S", "Nestle", "Parmigiano-Reggiano", "Neufchatel", "Dijon", "Worcestershire", "Tabasco",
    "Romano", "Asiago", "Gruyere", "Gorgonzola", "Kalamata", "Roma", "Velveeta", "Bisquick", "Crisco", "Hershey's",
    "Oreo", "Nutella", "Kraft", "Rotel", "Ro-Tel",
  ].map((w) => [w.toLowerCase(), w])
);

function newIngredientName(name: string): string {
  let out = name
    .replace(/’/g, "'")
    .split(/\s+/)
    .map((w) => PROPER_WORDS.get(w.toLowerCase()) ?? w.toLowerCase())
    .join(" ");
  for (const phrase of PROPER_PHRASES) out = out.replace(new RegExp(`\\b${phrase}\\b`, "gi"), phrase);
  return out;
}

// Herbs named with their leaves: "fresh flat-leaf parsley leaves" is parsley.
const HERBS = new Set(["parsley", "cilantro", "thyme", "basil", "mint", "oregano", "rosemary", "sage", "dill", "tarragon", "chives"]);

// Shorter names a new name could mean, most words first, with the words
// that move to the note: "fresh parsley leaves" -> "parsley leaves"
// ("fresh"), then "parsley" ("fresh", "leaves").
function peeledNames(name: string): { name: string; notes: string[] }[] {
  const words = name.trim().split(/\s+/);
  const notes: string[] = [];
  const out: { name: string; notes: string[] }[] = [];
  const keep = () => out.push({ name: words.join(" "), notes: [...notes] });
  if (words.length > 1 && words[0].toLowerCase() === "fresh") {
    notes.push(words.shift()!.toLowerCase());
    keep();
  }
  if (words.length === 2 && words[0].toLowerCase() === "flat-leaf" && HERBS.has(words[1].toLowerCase())) {
    notes.push(words.shift()!.toLowerCase());
    keep();
  }
  if (words.length === 2 && /^(?:leaf|leaves)$/i.test(words[1]) && HERBS.has(words[0].toLowerCase())) {
    notes.push("leaves");
    words.pop();
    keep();
  }
  return out;
}

// Restricted Damerau-Levenshtein distance: edits, with a swap of two
// neighbors as one.
function editDistance(a: string, b: string): number {
  const d = Array.from({ length: a.length + 1 }, (_, i) => Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)));
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[a.length][b.length];
}

// Real words one letter apart, which a typo match must not join.
const NOT_TYPOS = new Set([
  ...TRAILING_DESCRIPTORS, ...PREP_WORDS, "dried", "fried", "spiced", "smoked", "baked", "roasted", "salted",
  "sweet", "sweetened", "butter", "batter", "breast", "breasts",
]);

// "mozarella" and "mozzarella", "Monterrey" and "Monterey": the same words
// but one, and that one a typo apart. Names of 6 or more letters, and never
// two words that differ by a whole word.
function typoOf(a: string, b: string): boolean {
  const x = a.trim().toLowerCase();
  const y = b.trim().toLowerCase();
  if (x === y || x.length < 6 || y.length < 6) return false;
  const xw = x.split(/\s+/);
  const yw = y.split(/\s+/);
  if (xw.length !== yw.length) return false;
  const diff = xw.map((w, i) => [w, yw[i]]).filter(([p, q]) => p !== q);
  if (diff.length !== 1) return false;
  const [p, q] = diff[0];
  if (Math.min(p.length, q.length) < 5 || NOT_TYPOS.has(p) || NOT_TYPOS.has(q)) return false;
  return editDistance(p, q) === 1;
}

// The name without stray punctuation or spacing around it: "garlic," ->
// "garlic". A closing paren stays.
export const tidyName = (name: string) => name.replace(/\s+/g, " ").replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N})]+$/gu, "");

// A name with stray punctuation, read the way a line is: "“globs” liquid
// lecithin" -> "liquid lecithin", note "globs"; "Heaping  teaspoon baking
// soda" -> "baking soda", teaspoon, note "heaping". A leading "of" ('" of
// oil') means the amount was lost, so it asks. A leading "+" adds to the
// saved amount, so its unit is a note: "+ tsp yeast in cup lukewarm water"
// -> "yeast", note "+ tsp, in cup lukewarm water". Null when the parser
// can't read it as one plain name.
interface DirtyRead { name: string; notes: string[]; unit: UnitRow | null; lost: boolean }
function readDirtyName(name: string, lookup: UnitLookup): DirtyRead | null {
  let text = name.replace(/\s+/g, " ").trim();
  const notes: string[] = [];
  const quoted = text.match(/^[“"‘']([^“”"‘’']+)[”"’']\s+(?=\S)/);
  if (quoted) {
    notes.push(quoted[1].trim().toLowerCase());
    text = text.slice(quoted[0].length);
  }
  const plus = text.startsWith("+");
  text = tidyName(text);
  const of = text.match(/^of\s+(?=\S)/i);
  if (of) text = text.slice(of[0].length);
  const parsed = text ? parseIngredientText(`1 ${text}`, lookup) : null;
  if (!parsed || parsed.quantity !== 1 || parsed.doubts.length || !parsed.name) return null;
  let unit = parsed.unit && parsed.unit.name.toLowerCase() !== "each" ? parsed.unit : null;
  if (plus && unit) {
    notes.push(`+ ${text.split(/\s+/)[0]}`);
    unit = null;
  }
  // "yeast in cup lukewarm water": a phrase whose amount was lost.
  let read = parsed.name;
  const phrase = read.match(/^(.+?)\s+(in\s+(\S+)\s+.+)$/i);
  if (phrase && lookup(phrase[3].toLowerCase())) {
    read = phrase[1];
    notes.push(phrase[2]);
  }
  if (parsed.notes) notes.push(parsed.notes);
  return { name: read, notes, unit, lost: !!of };
}

// The filter the first count used, as LIKE patterns: '(%', '%(s)%', '%*%',
// '%$%', '%()%'. Kept so the two counts can be compared.
function matchesLikeFilter(name: string): boolean {
  return name.startsWith("(") || /\(s\)/i.test(name) || /[*$]/.test(name) || name.includes("()");
}

// ─── Proposals ──────────────────────────────────────────────────

export type Category =
  | "wrong_link"
  | "cooked_separate"
  | "lost_noun"
  | "prep_in_name"
  | "garbled_name_note"
  | "junk_ingredient_repoint"
  | "rename_ingredient"
  | "deletable_after_repoint"
  | "recipe_reference";
export type Confidence = "high" | "medium" | "low";

export const CATEGORIES: Category[] = [
  "wrong_link", "cooked_separate", "lost_noun", "prep_in_name", "garbled_name_note", "junk_ingredient_repoint", "rename_ingredient",
  "deletable_after_repoint", "recipe_reference",
];

// An existing Ingredient id, or a name to create. "delete" for category F.
export type Target = { id: number; name: string } | { create: string } | { delete: true };

export interface Proposal {
  category: Category;
  confidence: Confidence;
  table: string;
  rowId: number;
  recipeId: number | null;
  recipeName: string;
  current: { quantity: number | null; unit: string; ingredientId: number; ingredientName: string; notes: string };
  proposed: { quantity: number | null; unit: string; target: Target; notes: string };
  reason: string;
  ambiguous: boolean;
  question: string;
}

function targetLabel(target: Target): string {
  if ("delete" in target) return "delete";
  if ("create" in target) return `create:${target.create}`;
  return String(target.id);
}

export function targetText(target: Target): string {
  if ("delete" in target) return "(delete row)";
  if ("create" in target) return `${target.create} (new)`;
  return `${target.name} (#${target.id})`;
}

// Same target, for counting: an id, or the key of a name to create.
function targetKey(target: Target): string {
  if ("delete" in target) return "delete";
  if ("create" in target) return `create:${ingredientKey(target.create)}`;
  return `id:${target.id}`;
}

const lower = (a: Confidence, b: Confidence): Confidence =>
  a === "low" || b === "low" ? "low" : a === "medium" || b === "medium" ? "medium" : "high";

// ─── The analysis ───────────────────────────────────────────────

interface IngredientReport {
  id: number;
  name: string;
  kind: string;
  reasons: string[];
  likeFilter: boolean;
  target: Target | null;
  targetAmbiguous: boolean;
  targets: string[];
  refs: Record<RefTable, number>;
  refsAfter: number;
  deletableAfter: boolean;
}

interface ListReport {
  id: number;
  name: string;
  householdId: number;
  mealPlanId: number | null;
  weekStart: string;
  currentPlan: string;
  itemsTotal: number;
  itemsAffected: number;
  itemsAmbiguous: number;
}

interface SanityFailure { name: string; reasons: string[]; proposal: Proposal }

export interface Report {
  proposals: Proposal[];
  // Proposals whose proposed name failed badNameReasons.
  sanityFailures: SanityFailure[];
  ingredients: IngredientReport[];
  lists: ListReport[];
  unreferencedClean: number;
  likeFilterCount: number;
  detectorCount: number;
  // Where a name points after the analysis, the way every proposal was
  // matched: an existing (or renamed) row, or a name to create. For the
  // apply script.
  targetFor: (name: string) => Target;
}

const REF_TABLES = ["RecipeIngredient", "LibraryRecipeIngredient", "GroceryListItem", "InventoryItem", "StorePrice"] as const;
type RefTable = (typeof REF_TABLES)[number];
const total = (r: Record<RefTable, number> | undefined) => (r ? REF_TABLES.reduce((n, t) => n + r[t], 0) : 0);

export function analyze(snap: Snapshot, today: Date): Report {
  const lookup = makeUnitLookup(snap.units) as UnitLookup;
  const unitById = new Map(snap.units.map((u) => [u.id, u]));
  const eachUnit = snap.units.find((u) => u.name.toLowerCase() === "each") ?? null;
  const isEach = (u: UnitRow | null | undefined) => !u || u.name.toLowerCase() === "each";
  const ingById = new Map(snap.ingredients.map((i) => [i.id, i]));
  const recipeById = new Map(snap.recipes.map((r) => [r.id, r]));
  const libraryById = new Map(snap.libraryRecipes.map((r) => [r.id, r]));

  const problems = new Map(snap.ingredients.map((i) => [i.id, nameProblems(i.name, lookup)]));
  // A cooked-X row whose only problem is the prep in front ("cooked and
  // shredded chicken") is a naming question (A2), not a line fix.
  for (const ing of snap.ingredients) {
    const p = problems.get(ing.id)!;
    if (!p.junk.length && !p.layout.length && cookedTidy(ing.name)) p.prep = "";
  }
  const flagged = (id: number) => {
    const p = problems.get(id);
    return !!p && (p.junk.length > 0 || p.prep !== "" || p.layout.length > 0);
  };

  // "garlic," is garlic. The name is read the way a line is, and the read
  // name is what a match compares and what a proposal shows. The row is
  // renamed to it, and words the read took off go to its lines' notes.
  // When another row already has that name, the dirty row is junk: its
  // lines repoint and it goes.
  const tidied = new Map<number, string>();
  const reads = new Map<number, DirtyRead>();
  const tidyKeys = new Map<string, { id: number; name: string }>();
  for (const row of snap.ingredients) {
    if (!flagged(row.id) && tidyName(row.name) === row.name) tidyKeys.set(ingredientKey(row.name), row);
  }
  for (const row of [...snap.ingredients].sort((a, b) => a.id - b.id)) {
    const tidy = tidyName(row.name);
    if (flagged(row.id) || tidy === row.name || !tidy) continue;
    const read = readDirtyName(row.name, lookup);
    if (!read || badNameReasons(read.name, lookup).length) continue;
    reads.set(row.id, read);
    const same = tidyKeys.get(ingredientKey(read.name));
    if (same) {
      problems.get(row.id)!.junk.push(`stray punctuation, same name as "${same.name}" (#${same.id})`);
    } else {
      tidied.set(row.id, read.name);
      tidyKeys.set(ingredientKey(read.name), { id: row.id, name: read.name });
    }
  }
  const nameOf = (row: IngredientRow) => tidied.get(row.id) ?? row.name;

  // Rows a name can point at: clean rows only, found the way the importer
  // finds them (same name in any case, or singular/plural).
  const byKey = new Map<string, IngredientRow[]>();
  for (const ing of snap.ingredients) {
    if (flagged(ing.id)) continue;
    const row = { id: ing.id, name: nameOf(ing) };
    const key = ingredientKey(row.name);
    byKey.set(key, [...(byKey.get(key) ?? []), row]);
  }
  const findExisting = (name: string) => pickIngredientMatch(name, byKey.get(ingredientKey(name)) ?? []);
  // "water" is an ingredient on its own, so "water or chicken broth" stays water.
  const isNoun = (name: string) => byKey.has(ingredientKey(name));
  // New names that mean another name, filled once every line is read (see
  // "Spelling" below): "fresh garlic" -> garlic, note "fresh".
  const spelling = new Map<string, { target: Target; notes: string[]; typo: boolean }>();
  const respelled = (target: Target) => {
    let t = target;
    const notes: string[] = [];
    const questions: string[] = [];
    const seen = new Set<string>();
    while ("create" in t && spelling.has(ingredientKey(t.create)) && !seen.has(ingredientKey(t.create))) {
      const key = ingredientKey(t.create);
      seen.add(key);
      const next = spelling.get(key)!;
      notes.push(...next.notes);
      if (next.typo) questions.push(`Treat "${t.create}" as "${"create" in next.target ? next.target.create : "id" in next.target ? next.target.name : ""}"?`);
      t = next.target;
    }
    return { target: t, notes, questions };
  };
  // One spelling per new name, so "onion" and "onions" create one row.
  const createNames = new Map<string, string>();
  const targetFor = (name: string): Target => {
    const row = findExisting(name);
    if (row) return { id: row.id, name: row.name };
    const key = ingredientKey(name);
    if (!createNames.has(key)) createNames.set(key, newIngredientName(name));
    return respelled({ create: createNames.get(key)! }).target;
  };

  const proposals: Proposal[] = [];

  // Lines in both recipe tables, with who owns them.
  interface Line { table: "RecipeIngredient" | "LibraryRecipeIngredient"; row: LineRow; owner: string; recipeName: string }
  const lines: Line[] = [
    ...snap.libraryLines.map((row) => ({
      table: "LibraryRecipeIngredient" as const,
      row,
      owner: `L${row.recipeId}`,
      recipeName: libraryById.get(row.recipeId)?.name ?? "",
    })),
    ...snap.recipeLines.map((row) => ({
      table: "RecipeIngredient" as const,
      row,
      owner: `R${row.recipeId}`,
      recipeName: recipeById.get(row.recipeId)?.name ?? "",
    })),
  ];
  const linesByIngredient = new Map<number, Line[]>();
  for (const line of lines) {
    linesByIngredient.set(line.row.ingredientId, [...(linesByIngredient.get(line.row.ingredientId) ?? []), line]);
  }
  // The line that most likely created a row: a library line first (those
  // are seeded), then the lowest recipe line id.
  const creatorOf = (id: number) =>
    [...(linesByIngredient.get(id) ?? [])].sort(
      (a, b) => (a.table === b.table ? a.row.id - b.row.id : a.table === "LibraryRecipeIngredient" ? -1 : 1)
    )[0];

  const currentOf = (line: Line) => {
    const unit = unitById.get(line.row.unitId);
    return {
      quantity: line.row.quantity,
      unit: unit?.name ?? `#${line.row.unitId}`,
      ingredientId: line.row.ingredientId,
      ingredientName: ingById.get(line.row.ingredientId)?.name ?? `#${line.row.ingredientId}`,
      notes: line.row.notes ?? "",
    };
  };

  // ── A. Lines a contains-match tied to a longer name ──
  const wrongLink = (line: Line): Proposal | null => {
    const ing = ingById.get(line.row.ingredientId);
    const unit = unitById.get(line.row.unitId);
    if (!ing || !unit || COOKED_LEAD.test(ing.name.trim())) return null;
    const nameWords = ing.name.trim().split(/\s+/);
    if (nameWords.length < 2 || PRODUCT_FORMS.has(bare(nameWords[nameWords.length - 1]))) return null;
    const notes = line.row.notes ?? "";
    const noteWords = new Set(wordsOf(notes));
    // "(or tbsp grated ginger + ...)", "or 1 1/2 tsp crushed, real garlic":
    // the note offers another way, so it says nothing about this line's name.
    const offersAlternative = /^\s*\(?\s*or\b/i.test(notes) || /\(\s*or\s/i.test(notes);
    // The note names the shorter name only after an "or".
    const onlyAsAlternative = (inner: string) => {
      const at = notes.search(/\bor\b/i);
      if (at < 0) return false;
      const before = new Set(wordsOf(notes.slice(0, at)));
      const after = new Set(wordsOf(notes.slice(at)));
      return wordsOf(inner).some((w) => after.has(w)) && !wordsOf(inner).some((w) => before.has(w));
    };

    // Shorter names inside this one, longest first: "garlic parmesan", "garlic".
    const shorter: string[] = [];
    for (let len = nameWords.length - 1; len >= 1; len--) {
      for (let start = 0; start + len <= nameWords.length; start++) {
        shorter.push(nameWords.slice(start, start + len).join(" "));
      }
    }
    const extraWords = (inner: string) => {
      const keep = new Set(wordsOf(inner));
      return wordsOf(ing.name).filter((w) => !keep.has(w));
    };
    // Only a name whose extra words have nothing to do with the line ("garlic
    // parmesan breading" for minced garlic) came from a contains-match.
    const unrelated = (inner: string) => !extraWords(inner).some((w) => noteWords.has(w)) && !onlyAsAlternative(inner);

    // Who else uses this row, for the reason and the shared-row check.
    const shared = linesByIngredient.get(ing.id) ?? [];
    const owners = new Set(shared.map((l) => l.owner));
    const otherUnits = [...new Set(
      shared.filter((l) => l.owner !== line.owner).map((l) => unitById.get(l.row.unitId)?.name ?? "?")
    )];
    const context = owners.size > 1 ? ` Row is shared by ${owners.size} recipes; other lines use ${otherUnits.join(", ")}.` : "";

    let pick: string | null = null;
    let why = "";
    const nouns = UNIT_NOUNS[unit.name.toLowerCase()];
    if (nouns) {
      const fits = shorter.filter((s) => wordsOf(s).some((w) => nouns.includes(w)));
      const noun = fits.length ? fits[fits.length - 1] : null;
      const extras = noun ? extraWords(noun) : [];
      const meaningful = extras.filter(
        (w) => !TRAILING_DESCRIPTORS.has(w) && !PREP_WORDS.has(w) && lookup(w) === null && !nouns.includes(w)
      );
      if (noun && meaningful.length && !offersAlternative && unrelated(noun)) {
        pick = fits.find((s) => findExisting(s)) ?? noun;
        why = `unit "${unit.name}" fits "${pick}", not "${ing.name}"`;
      }
    }
    if (!pick && FRESH_PREP.test(notes) && !offersAlternative) {
      const fit = shorter.find((s) => findExisting(s) && extraWords(s).some((w) => PRODUCT_WORDS.has(w)) && unrelated(s));
      if (fit) {
        pick = fit;
        why = `note "${notes}" is prep for fresh "${fit}", but "${ing.name}" is a product`;
      }
    }

    const current = currentOf(line);
    if (pick) {
      const target = targetFor(pick);
      const exists = "id" in target;
      return {
        category: "wrong_link",
        confidence: exists ? "high" : "medium",
        table: line.table,
        rowId: line.row.id,
        recipeId: line.row.recipeId,
        recipeName: line.recipeName,
        current,
        proposed: { ...current, target, notes: tidyIngredientNote(cleanIngredientText(current.notes)) },
        reason: `Old contains-match: ${why}.${context}`,
        ambiguous: !exists,
        question: exists ? "" : `No "${pick}" row exists. Create it for this line?`,
      };
    }

    // "uncooked penne pasta" on a line from another recipe: the line may have
    // said "penne pasta". The creator line is left alone.
    const state = ing.name.match(STATE_LEAD);
    if (state && owners.size > 1 && creatorOf(ing.id)?.owner !== line.owner && !wordsOf(notes).includes(state[1].toLowerCase())) {
      const target = targetFor(state[2]);
      return {
        category: "wrong_link",
        confidence: "low",
        table: line.table,
        rowId: line.row.id,
        recipeId: line.row.recipeId,
        recipeName: line.recipeName,
        current,
        proposed: { ...current, target, notes: current.notes },
        reason: `Possible old contains-match: row "${ing.name}" starts with "${state[1]}" and is shared.${context}`,
        ambiguous: true,
        question: `Did this line say "${state[2]}" rather than "${ing.name}"? Check the source recipe.`,
      };
    }
    return null;
  };

  // The line as the source most likely wrote it, read back through the
  // importer's parser. A note that is one paren group follows the name in
  // parens, so it stays a note. A paren the import split across the name and
  // the note ("cheese (such as cheddar" + "jack, and/or fontina), grated")
  // is joined back up; any other stray paren in the note is closed.
  const lineText = (quantity: number, unit: UnitRow | null, name: string, notes: string) => {
    const amount = quantity > 0 ? String(quantity) : "";
    const unitWord = quantity > 0 && !isEach(unit) ? unit!.name : "";
    const note = notes.trim();
    const counts = parenCounts(note);
    let tail = "";
    if (!note) tail = "";
    else if (parenCounts(name).open > 0 && counts.stray > 0) tail = `, ${note}`;
    else if (wholeParen(note)) tail = ` ${note}`;
    else tail = `, ${"(".repeat(counts.stray)}${note}${")".repeat(counts.open)}`;
    return [amount, unitWord, name].filter(Boolean).join(" ") + tail;
  };

  // ── B, C, D. Lines whose saved name is broken ──
  const reparse = (line: Line): Proposal | null => {
    const ing = ingById.get(line.row.ingredientId);
    const p = problems.get(line.row.ingredientId);
    if (!ing || !p) return null;
    const notes = (line.row.notes ?? "").trim();
    // "chicken boneless" + "skinless chicken breasts": one phrase cut at its comma.
    const lastWord = bare(ing.name.trim().split(/\s+/).pop() ?? "");
    const firstNote = bare(notes.split(/[\s,]+/)[0] ?? "");
    const splitWrong = !p.nounless && TRAILING_DESCRIPTORS.has(lastWord) && TRAILING_DESCRIPTORS.has(firstNote);
    if (!p.junk.length && !p.prep && !p.layout.length && !splitWrong) return null;

    const category: Category = p.nounless
      ? "lost_noun"
      : p.junk.length || splitWrong
        ? "garbled_name_note"
        : "prep_in_name";
    const reasons = [...p.junk, ...(splitWrong ? ["name and note read as one phrase"] : []), ...p.layout];
    if (p.prep) reasons.push(`prep "${p.prep}" in name`);
    const current = currentOf(line);
    const base = {
      category,
      table: line.table,
      rowId: line.row.id,
      recipeId: line.row.recipeId,
      recipeName: line.recipeName,
      current,
    };

    if (p.nounless && !notes) {
      return {
        ...base,
        confidence: "low",
        proposed: { ...current, target: { create: "?" }, notes },
        reason: `Name "${ing.name}" has no noun and the note is empty.`,
        ambiguous: true,
        question: `What is the ingredient for "${ing.name}" in this recipe?`,
      };
    }

    const questions: string[] = [];
    let confidence: Confidence = "high";
    let unit: UnitRow | null = unitById.get(line.row.unitId) ?? null;
    let quantity = line.row.quantity;
    let name = ing.name.trim();
    let lineNotes = notes;
    // "your favorite salsa": the choice goes to the note.
    const favorite = name.match(FAVORITE_LEAD);
    if (favorite) {
      name = name.slice(favorite[0].length);
      lineNotes = [favorite[1].toLowerCase().replace(/\s+/g, " "), notes].filter(Boolean).join(", ");
    }

    // A unit at the front of the name: use it, or drop it when it repeats
    // the saved unit. A different unit means the amount was misread.
    // "6 ounce" + "package feta cheese": the package is a note, and the
    // parser keeps 6 ounce.
    const containerAfterMeasure = !isEach(unit) && CONTAINER_LEAD.test(name) && unit?.unitType !== "OTHER";
    // "sleeve Ritz crackers" on a count: the parser keeps "1 sleeve" as a note.
    const countWord = isEach(unit) && isEach(leadingUnit(name, lookup)?.unit);
    const lead = containerAfterMeasure || countWord ? null : leadingUnit(name, lookup);
    if (lead) {
      if (isEach(unit) || lead.unit.id === unit?.id) {
        name = lead.rest;
        unit = lead.unit;
      } else {
        const sticks = lead.rest.match(/\((\d+(?:\.\d+)?)\s+sticks?\)/i);
        const was = `${quantity} ${unit?.name ?? "?"}`;
        name = lead.rest;
        unit = lead.unit;
        if (sticks && lead.unit.name.toLowerCase() === "cup") {
          quantity = Number(sticks[1]) * 0.5;
          questions.push(`Saved as ${was}, but the name says "${lead.unit.name}" and ${sticks[1]} stick = ${quantity} cup. Use ${quantity} cup?`);
        } else {
          questions.push(`Saved as ${was}, but the name starts with "${lead.unit.name}". Which unit is right, and what amount?`);
        }
        confidence = "low";
      }
    }
    // Closed here unless the note holds the other half (see lineText).
    if (unbalanced(name) && !(parenCounts(name).open > 0 && parenCounts(notes).stray > 0)) {
      const open = (name.match(/\(/g) ?? []).length - (name.match(/\)/g) ?? []).length;
      name = open > 0 ? name + ")".repeat(open) : name.replace(/\)(?![^(]*\))/, "");
      confidence = lower(confidence, "medium");
    }

    // "large or 40 small tomatoes": the parser keeps the noun and notes the
    // choice, but which amount the recipe meant is a question.
    const alt = name.match(ALT_AMOUNT);
    if (alt) {
      questions.push(`"${ing.name}" holds two amounts. Keep ${quantity} ${alt[1].toLowerCase()} and note "or ${alt[2]} ${alt[3].toLowerCase()}"?`);
      confidence = "low";
    }
    // "(1 cup butter)": the whole name is a paren with its own amount.
    if (wholeParen(name)) {
      const inner = parseIngredientText(name.slice(1, -1), lookup);
      if (inner && inner.quantity > 0 && inner.unit) {
        const said = formatAmount(inner.quantity, inner.unit.abbreviation);
        questions.push(`Saved as ${quantity} ${unit?.name ?? "each"}, but the name says "${said}". Which amount is right?`);
        confidence = "low";
        name = inner.name;
        lineNotes = [said, inner.notes, notes].filter(Boolean).join(", ");
      }
    }
    // "(28 oz) can crushed tomatoes" saved as 36 ounce: two amounts.
    const sized = ing.name.match(/^\(([^()]+)\)\s*(?:can|cans|jar|jars|package|packages|pkg|box|bag)\b/i);
    if (sized && !isEach(unit) && unit?.unitType !== "OTHER") {
      questions.push(`Saved as ${quantity} ${unit?.name}, but the name says a ${sized[1].trim().replace(/\.$/, "")} container. Which amount is right?`);
      confidence = "low";
    }
    // "Tortilla chips or strips, monterrey jack cheese, sliced avocado":
    // several things on one line.
    const listed = cleanIngredientName(ing.name).split(/,\s*/).filter(Boolean);
    if (listed.length >= 3 && listed.slice(1).some((part) => !PREP_WORDS.has(bare(part.split(/\s+/)[0])) && !onlyNounless(part))) {
      questions.push(`"${cleanIngredientName(ing.name)}" lists several items. Split it into one line each, or which ingredient is it?`);
      confidence = "low";
    }
    const parsed = parseIngredientText(lineText(quantity, unit, name, lineNotes), lookup, { isNoun });
    if (!parsed) {
      return {
        ...base,
        confidence: "low",
        proposed: { ...current, target: { create: "?" }, notes },
        reason: `${reasons.join("; ")}. The parser could not read a name.`,
        ambiguous: true,
        question: "What should this line be?",
      };
    }
    const parsedName = parsed.name;
    const parsedNotes = parsed.notes;
    const parsedUnit = parsed.unit ?? (quantity > 0 ? eachUnit : unit);
    quantity = parsed.quantity || quantity;
    for (const doubt of parsed.doubts) {
      questions.push(`${doubt} Kept ${quantity} ${parsedUnit?.name ?? "each"}. Check the source recipe.`);
      confidence = "low";
    }
    // "chicken boneless" read as "boneless chicken". Not when the note
    // holds the rest of the phrase; that one is joined back up.
    const savedWords = cleanIngredientName(ing.name).split(/\s+/);
    const savedLast = savedWords[savedWords.length - 1] ?? "";
    if (!splitWrong && savedWords.length > 1 && AFTER_NOUN_DESCRIPTORS.has(bare(savedLast)) && !parsedName.toLowerCase().endsWith(bare(savedLast))) {
      questions.push(`Saved name ends in "${savedLast}"; a fresh import reads it as "${parsedName}". OK?`);
      confidence = lower(confidence, "medium");
    }

    // What the parser left still looks wrong: a trailing descriptor, no noun.
    const left = nameProblems(parsedName, lookup);
    const tail = bare(parsedName.split(/\s+/).pop() ?? "");
    if (left.junk.length || TRAILING_DESCRIPTORS.has(tail) || /^or\b/i.test(parsedName)) {
      const words = parsedName.split(/\s+/);
      const flipped = TRAILING_DESCRIPTORS.has(tail) && words.length > 1 ? `${words.pop()} ${words.join(" ")}` : "";
      questions.push(
        flipped
          ? `A fresh import names this "${parsedName}". Use "${flipped}" instead?`
          : `A fresh import names this "${parsedName}", which still looks wrong. What should it be?`
      );
      confidence = "low";
    }

    const target = ingredientKey(parsedName) === ingredientKey(ing.name) ? { id: ing.id, name: nameOf(ing) } : targetFor(parsedName);
    if (!("id" in target)) confidence = lower(confidence, "medium");
    const unitChanged = (parsedUnit?.id ?? null) !== line.row.unitId;
    const quantityChanged = Math.abs(quantity - line.row.quantity) > 1e-9;
    if ((unitChanged || quantityChanged) && !questions.length) {
      const from = `${line.row.quantity} ${current.unit}`;
      const to = `${quantity} ${parsedUnit?.name ?? "each"}`;
      questions.push(`Amount would change from ${from} to ${to}. OK?`);
      confidence = lower(confidence, "medium");
    }
    const sameIngredient = "id" in target && target.id === ing.id;
    if (sameIngredient && !unitChanged && !quantityChanged && parsedNotes === notes) return null;

    return {
      ...base,
      confidence,
      proposed: { quantity, unit: parsedUnit?.name ?? "each", target, notes: parsedNotes },
      reason: `${reasons.join("; ")}. Reparsed "${lineText(line.row.quantity, unitById.get(line.row.unitId) ?? null, ing.name, notes)}".`,
      ambiguous: questions.length > 0,
      question: questions.join(" "),
    };
  };

  // ── Lines on a dirty row: they follow the read name ──
  // The words the read took off ("heaping", "globs") go to the note, and a
  // unit it found replaces "each", which asks.
  const dirtyLine = (line: Line): Proposal | null => {
    const ing = ingById.get(line.row.ingredientId)!;
    const read = reads.get(ing.id)!;
    const current = currentOf(line);
    const junk = flagged(ing.id);
    const target: Target = junk ? targetFor(read.name) : { id: ing.id, name: nameOf(ing) };
    const have = new Set(wordsOf(current.notes));
    const moved = read.notes.filter((n) => !wordsOf(n).every((w) => have.has(w)));
    const notes = moved.length ? tidyIngredientNote([...moved, current.notes].filter(Boolean).join(", ")) : current.notes;
    const saved = unitById.get(line.row.unitId);
    const questions: string[] = [];
    let unit = current.unit;
    if (read.unit && read.unit.id !== saved?.id) {
      if (isEach(saved)) {
        unit = read.unit.name;
        questions.push(`Amount would change from ${line.row.quantity} ${current.unit} to ${line.row.quantity} ${unit}. OK?`);
      } else {
        questions.push(`Saved as ${line.row.quantity} ${current.unit}, but the name says "${read.unit.name}". Which unit is right?`);
      }
    }
    // A renamed row asks this once, on the rename.
    if (read.lost && junk) questions.push(`Name was '${ing.name}'. Which ${read.name}?`);
    const sameRow = "id" in target && target.id === ing.id;
    if (sameRow && unit === current.unit && notes === current.notes && !questions.length) return null;
    const words = moved.length ? `; "${moved.join(", ")}" moves to the note` : "";
    return {
      category: "garbled_name_note",
      confidence: questions.length || !("id" in target) ? "medium" : "high",
      table: line.table,
      rowId: line.row.id,
      recipeId: line.row.recipeId,
      recipeName: line.recipeName,
      current,
      proposed: { quantity: line.row.quantity, unit, target, notes },
      reason: sameRow
        ? `Row "${ing.name}" is renamed to "${read.name}"${words}.`
        : `Row "${ing.name}" reads as "${read.name}", which another row already is${words}.`,
      ambiguous: questions.length > 0,
      question: questions.join(" "),
    };
  };

  // A line that points to another recipe stays as written, and asks.
  const recipeReference = (line: Line): Proposal => {
    const current = currentOf(line);
    return {
      category: "recipe_reference",
      confidence: "low",
      table: line.table,
      rowId: line.row.id,
      recipeId: line.row.recipeId,
      recipeName: line.recipeName,
      current,
      proposed: { ...current, target: { id: current.ingredientId, name: current.ingredientName } },
      reason: `"${current.ingredientName}" names a recipe, not an ingredient.`,
      ambiguous: true,
      question: "This line points to another recipe. Keep it as written?",
    };
  };
  for (const line of lines) {
    const ing = ingById.get(line.row.ingredientId);
    const proposal = ing && RECIPE_REFERENCE.test(ing.name)
      ? recipeReference(line)
      : reads.has(line.row.ingredientId)
        ? dirtyLine(line)
        : flagged(line.row.ingredientId) ? reparse(line) : (wrongLink(line) ?? reparse(line));
    if (proposal) proposals.push(proposal);
  }

  // ── Spelling: new names that mean a row or another new name ──
  // Case and plural already share a key. "fresh garlic" is garlic with a
  // note, "fresh parsley leaves" is parsley. "mozarella" is a typo of
  // "mozzarella", which asks. The most used new name of a pair is kept.
  const newUses = new Map<string, { name: string; n: number }>();
  for (const x of proposals) {
    const t = x.proposed.target;
    if (!("create" in t) || t.create === "?") continue;
    const key = ingredientKey(t.create);
    newUses.set(key, { name: t.create, n: (newUses.get(key)?.n ?? 0) + 1 });
  }
  const named = (name: string, self: string): Target | null => {
    const row = findExisting(name);
    if (row) return { id: row.id, name: row.name };
    const key = ingredientKey(name);
    return key !== self && newUses.has(key) ? { create: newUses.get(key)!.name } : null;
  };
  const cleanRows = [...byKey.values()].flat();
  // On a tie, the spelling whose words the clean rows already use.
  const vocabulary = new Set(cleanRows.flatMap((r) => wordsOf(r.name)));
  const familiar = (name: string) => wordsOf(name).filter((w) => vocabulary.has(w)).length;
  const kept: string[] = [];
  const byUse = [...newUses].sort((a, b) => b[1].n - a[1].n || familiar(b[1].name) - familiar(a[1].name));
  for (const [key, { name }] of byUse) {
    const peeled = peeledNames(name).reverse().find((p) => named(p.name, key));
    if (peeled) {
      spelling.set(key, { target: named(peeled.name, key)!, notes: peeled.notes, typo: false });
      continue;
    }
    const row = cleanRows.find((r) => typoOf(name, r.name));
    const twin = row ? undefined : kept.find((k) => typoOf(name, k));
    const near: Target | null = row ? { id: row.id, name: row.name } : twin ? { create: twin } : null;
    if (near) spelling.set(key, { target: near, notes: [], typo: true });
    else kept.push(name);
  }
  for (const x of proposals) {
    const t = x.proposed.target;
    if (!("create" in t)) continue;
    const moved = respelled(t);
    if (moved.target === t) continue;
    x.proposed.target = moved.target;
    const have = new Set(wordsOf(x.proposed.notes));
    const notes = [...moved.notes.filter((n) => !have.has(n)), x.proposed.notes].filter(Boolean).join(", ");
    x.proposed.notes = tidyIngredientNote(notes);
    let question = x.question;
    if ("id" in moved.target) question = question.replace(/No "[^"]+" row exists\. Create it for this line\?\s*/, "").trim();
    if (moved.questions.length) {
      question = [question, ...moved.questions].filter(Boolean).join(" ");
      x.confidence = lower(x.confidence, "medium");
    }
    x.question = question;
    x.ambiguous = question !== "";
  }

  // ── A2. Cooked X: its own ingredient, one question per tidy name ──
  // "cooked and shredded chicken" and "cooked shredded chicken" are both
  // "cooked chicken" with a note, so they share one question.
  const cookedGroups = new Map<string, { tidy: string; rows: { ing: IngredientRow; note: string }[] }>();
  for (const ing of snap.ingredients) {
    const tidy = cookedTidy(ing.name);
    if (!tidy || flagged(ing.id) || !linesByIngredient.has(ing.id)) continue;
    const key = ingredientKey(tidy.name);
    const group = cookedGroups.get(key) ?? { tidy: tidy.name, rows: [] };
    group.rows.push({ ing, note: tidy.note });
    cookedGroups.set(key, group);
  }
  for (const { tidy, rows } of cookedGroups.values()) {
    rows.sort((a, b) => a.ing.id - b.ing.id);
    const plainName = tidy.replace(COOKED_LEAD, "$1");
    const plain = findExisting(plainName);
    const uses = rows.reduce((n, r) => n + (linesByIngredient.get(r.ing.id)?.length ?? 0), 0);
    // The row already spelled the tidy way, if any, is the one to keep.
    const keep = rows.find((r) => cleanIngredientName(r.ing.name).toLowerCase() === tidy.toLowerCase()) ?? null;
    const first = keep ?? rows[0];
    // The link stays on the row the question is about; the answer renames.
    const target: Target = { id: first.ing.id, name: nameOf(first.ing) };
    const joining = rows.filter((r) => r !== first);
    const join = joining.length
      ? ` Use "${tidy}" for ${joining.map((r) => `"${r.ing.name}" (#${r.ing.id})${r.note ? ` -> note "${r.note}"` : ""}`).join(", ")}.`
      : "";
    const rename = keep ? "" : ` Rename "${first.ing.name}" (#${first.ing.id}) to "${tidy}"${first.note ? ` and move "${first.note}" to its lines' notes` : ""}.`;
    proposals.push({
      category: "cooked_separate",
      confidence: "low",
      table: "Ingredient",
      rowId: first.ing.id,
      recipeId: null,
      recipeName: "",
      current: { quantity: null, unit: "", ingredientId: first.ing.id, ingredientName: first.ing.name, notes: "" },
      proposed: { quantity: null, unit: "", target, notes: keep ? "" : first.note },
      reason: `${uses} recipe line(s) use ${rows.map((r) => `"${r.ing.name}"`).join(", ")}. Cooked is its own ingredient, so no line is repointed off cooked.${plain ? ` "${plain.name}" (#${plain.id}) also exists.` : ""}`,
      ambiguous: true,
      question: `Keep "${tidy}" separate from "${plainName}"?${rename}${join}`,
    });
  }

  // ── Rows renamed to their read name. Their lines keep the link. ──
  for (const [id, name] of tidied) {
    const ing = ingById.get(id)!;
    const read = reads.get(id)!;
    const moved = read.notes.join(", ");
    const extra = [moved && `"${moved}" moves to each line's note`, read.unit && `the unit "${read.unit.name}" is checked on each line`].filter(Boolean);
    proposals.push({
      category: "rename_ingredient",
      confidence: read.lost ? "low" : "high",
      table: "Ingredient",
      rowId: id,
      recipeId: null,
      recipeName: "",
      current: { quantity: null, unit: "", ingredientId: id, ingredientName: ing.name, notes: "" },
      proposed: { quantity: null, unit: "", target: { id, name }, notes: moved },
      reason: `Stray punctuation or words in the name, and no other row is named "${name}". Rename the row${extra.length ? `; ${extra.join(", and ")}` : ""}; ${linesByIngredient.get(id)?.length ?? 0} recipe line(s) keep the link.`,
      ambiguous: read.lost,
      question: read.lost ? `Name was '${ing.name}'. Which ${name}?` : "",
    });
  }

  // Every proposed name gets one last look. One that still looks wrong is
  // a question, not a change.
  const sanityFailures: SanityFailure[] = [];
  const sanityChecked = new Set<Proposal>();
  const sanityCheck = (x: Proposal) => {
    if (sanityChecked.has(x)) return;
    sanityChecked.add(x);
    const t = x.proposed.target;
    const name = "create" in t ? t.create : "id" in t ? t.name : "";
    if (!name || name === "?" || x.category === "recipe_reference") return;
    const reasons = badNameReasons(name, lookup);
    if (!reasons.length) return;
    x.ambiguous = true;
    x.confidence = "low";
    x.question = [x.question, `Proposed name looks wrong: "${name}" (${reasons.join(", ")}).`].filter(Boolean).join(" ");
    sanityFailures.push({ name, reasons, proposal: x });
  };
  proposals.forEach(sanityCheck);
  const lineProposals = [...proposals];

  // ── E. Junk rows, and where everything that uses them should point ──
  const ingredientReports: IngredientReport[] = [];
  const rowTarget = new Map<number, { target: Target; ambiguous: boolean; unitChange: boolean }>();
  for (const ing of snap.ingredients) {
    const p = problems.get(ing.id)!;
    if (!p.junk.length && !p.prep && !p.layout.length) continue;
    const mine = lineProposals.filter((x) => x.current.ingredientId === ing.id && !("create" in x.proposed.target && x.proposed.target.create === "?"));
    const counts = new Map<string, { target: Target; n: number }>();
    for (const x of mine) {
      const key = targetKey(x.proposed.target);
      counts.set(key, { target: x.proposed.target, n: (counts.get(key)?.n ?? 0) + 1 });
    }
    const read = reads.get(ing.id);
    if (!counts.size && read) {
      const target = targetFor(read.name);
      counts.set(targetKey(target), { target, n: 0 });
    }
    if (!counts.size && !p.nounless) {
      // No recipe line to learn from: read the name on its own.
      const alone = parseIngredientText(lineText(1, eachUnit, cleanIngredientName(ing.name).replace(/^\S+\(e?s\)\s+/i, ""), ""), lookup);
      const leadless = leadingUnit(ing.name, lookup)?.rest;
      const name = alone && leadless ? (parseIngredientText(lineText(1, eachUnit, leadless, ""), lookup)?.name ?? alone.name) : alone?.name;
      if (name && ingredientKey(name) !== ingredientKey(ing.name) && !nameProblems(name, lookup).junk.length) {
        const target = targetFor(name);
        counts.set(targetKey(target), { target, n: 0 });
      }
    }
    const ranked = [...counts.values()].sort((a, b) => b.n - a.n);
    // A row its lines keep (a recipe reference) has nothing to follow.
    const top = ranked[0]?.target ?? null;
    const target = top && "id" in top && top.id === ing.id ? null : top;
    const ambiguous = ranked.length !== 1 || mine.some((x) => x.ambiguous);
    if (target) {
      rowTarget.set(ing.id, {
        target,
        ambiguous,
        unitChange: mine.some((x) => x.proposed.unit !== x.current.unit),
      });
    }
    ingredientReports.push({
      id: ing.id,
      name: ing.name,
      kind: p.nounless ? "lost_noun" : p.junk.length ? "junk" : "prep_in_name",
      reasons: [...p.junk, ...p.layout, ...(p.prep ? [`prep "${p.prep}" in name`] : [])],
      likeFilter: matchesLikeFilter(ing.name),
      target,
      targetAmbiguous: ambiguous,
      targets: ranked.map((r) => targetText(r.target)),
      refs: { RecipeIngredient: 0, LibraryRecipeIngredient: 0, GroceryListItem: 0, InventoryItem: 0, StorePrice: 0 },
      refsAfter: 0,
      deletableAfter: false,
    });
  }

  // Grocery, inventory and price rows follow their ingredient row.
  const listById = new Map(snap.groceryLists.map((l) => [l.id, l]));
  const itemTargetsTaken = (rows: { key: number; ingredientId: number }[]) => {
    const seen = new Set(rows.map((r) => `${r.key}:${r.ingredientId}`));
    return (key: number, target: Target) => "id" in target && seen.has(`${key}:${target.id}`);
  };
  const groceryClash = itemTargetsTaken(snap.groceryItems.map((r) => ({ key: r.groceryListId, ingredientId: r.ingredientId })));
  const inventoryClash = itemTargetsTaken(snap.inventory.map((r) => ({ key: r.householdId, ingredientId: r.ingredientId })));
  const priceClash = itemTargetsTaken(snap.storePrices.map((r) => ({ key: r.storeId, ingredientId: r.ingredientId })));

  const followRow = (
    table: RefTable,
    row: { id: number; ingredientId: number; quantity: number; unitId: number },
    clash: boolean,
    where: string
  ) => {
    const plan = rowTarget.get(row.ingredientId);
    const ing = ingById.get(row.ingredientId);
    if (!plan || !ing) return;
    const unit = unitById.get(row.unitId)?.name ?? `#${row.unitId}`;
    const questions: string[] = [];
    if (plan.ambiguous) questions.push(`Row "${ing.name}" has more than one likely target or an open question. Confirm ${targetText(plan.target)}.`);
    if (plan.unitChange) questions.push(`Recipe lines for "${ing.name}" change unit. Change this ${unit} too?`);
    if (clash) questions.push(`${where} already has ${targetText(plan.target)}. Merge the two?`);
    const p = problems.get(row.ingredientId)!;
    proposals.push({
      category: "junk_ingredient_repoint",
      confidence: questions.length ? "low" : "id" in plan.target ? "high" : "medium",
      table,
      rowId: row.id,
      recipeId: null,
      recipeName: "",
      current: { quantity: row.quantity, unit, ingredientId: ing.id, ingredientName: ing.name, notes: "" },
      proposed: { quantity: row.quantity, unit, target: plan.target, notes: "" },
      reason: `Ingredient row is ${p.junk.length ? p.junk.join(", ") : p.prep ? `prep "${p.prep}" in name` : p.layout.join(", ")}. ${where}.`,
      ambiguous: questions.length > 0,
      question: questions.join(" "),
    });
  };
  for (const item of snap.groceryItems) {
    const target = rowTarget.get(item.ingredientId)?.target;
    followRow("GroceryListItem", item, !!target && groceryClash(item.groceryListId, target), `Grocery list ${item.groceryListId}`);
  }
  for (const item of snap.inventory) {
    const target = rowTarget.get(item.ingredientId)?.target;
    followRow("InventoryItem", item, !!target && inventoryClash(item.householdId, target), `Inventory of household ${item.householdId}`);
  }
  for (const price of snap.storePrices) {
    const target = rowTarget.get(price.ingredientId)?.target;
    followRow("StorePrice", price, !!target && priceClash(price.storeId, target), `Store ${price.storeId}`);
  }

  // Grocery items for a wrongly linked row, on a list whose meal plan has a
  // recipe with that wrong line: the item most likely came from that line.
  const planRecipes = new Map<number, Set<number>>();
  for (const entry of snap.mealPlanEntries) {
    if (entry.recipeId === null) continue;
    planRecipes.set(entry.mealPlanId, (planRecipes.get(entry.mealPlanId) ?? new Set()).add(entry.recipeId));
  }
  for (const item of snap.groceryItems) {
    if (rowTarget.has(item.ingredientId)) continue;
    const list = listById.get(item.groceryListId);
    const recipes = list?.mealPlanId ? planRecipes.get(list.mealPlanId) : undefined;
    if (!recipes) continue;
    const cause = lineProposals.find(
      (x) =>
        x.category === "wrong_link" &&
        x.table === "RecipeIngredient" &&
        x.current.ingredientId === item.ingredientId &&
        recipes.has(x.recipeId ?? -1)
    );
    if (!cause) continue;
    const unit = unitById.get(item.unitId)?.name ?? `#${item.unitId}`;
    proposals.push({
      category: "wrong_link",
      confidence: "low",
      table: "GroceryListItem",
      rowId: item.id,
      recipeId: cause.recipeId,
      recipeName: cause.recipeName,
      current: { quantity: item.quantity, unit, ingredientId: item.ingredientId, ingredientName: cause.current.ingredientName, notes: "" },
      proposed: { quantity: item.quantity, unit, target: cause.proposed.target, notes: "" },
      reason: `List's meal plan includes "${cause.recipeName}", whose line is relinked.`,
      ambiguous: true,
      question: `The quantity may mix "${cause.current.ingredientName}" from other recipes. Repoint, split, or regenerate the list?`,
    });
  }

  proposals.forEach(sanityCheck);

  // ── F. Rows left with no references ──
  const refs = new Map<number, Record<RefTable, number>>();
  const bump = (id: number, table: RefTable, by: number) => {
    const row = refs.get(id) ?? { RecipeIngredient: 0, LibraryRecipeIngredient: 0, GroceryListItem: 0, InventoryItem: 0, StorePrice: 0 };
    row[table] += by;
    refs.set(id, row);
  };
  for (const r of snap.recipeLines) bump(r.ingredientId, "RecipeIngredient", 1);
  for (const r of snap.libraryLines) bump(r.ingredientId, "LibraryRecipeIngredient", 1);
  for (const r of snap.groceryItems) bump(r.ingredientId, "GroceryListItem", 1);
  for (const r of snap.inventory) bump(r.ingredientId, "InventoryItem", 1);
  for (const r of snap.storePrices) bump(r.ingredientId, "StorePrice", 1);

  const movedAway = new Map<number, { n: number; ambiguous: boolean; confidence: Confidence }>();
  const movedIn = new Map<number, number>();
  for (const x of proposals) {
    const t = x.proposed.target;
    if ("delete" in t || ("create" in t && t.create === "?")) continue;
    if ("id" in t && t.id === x.current.ingredientId) continue;
    const away = movedAway.get(x.current.ingredientId) ?? { n: 0, ambiguous: false, confidence: "high" as Confidence };
    movedAway.set(x.current.ingredientId, {
      n: away.n + 1,
      ambiguous: away.ambiguous || x.ambiguous,
      confidence: lower(away.confidence, x.confidence),
    });
    if ("id" in t) movedIn.set(t.id, (movedIn.get(t.id) ?? 0) + 1);
  }

  const reportById = new Map(ingredientReports.map((r) => [r.id, r]));
  let unreferencedClean = 0;
  for (const ing of snap.ingredients) {
    const before = total(refs.get(ing.id));
    const after = before - (movedAway.get(ing.id)?.n ?? 0) + (movedIn.get(ing.id) ?? 0);
    const report = reportById.get(ing.id);
    if (report) {
      report.refs = refs.get(ing.id) ?? report.refs;
      report.refsAfter = after;
      report.deletableAfter = after === 0;
    }
    if (after !== 0) continue;
    if (before === 0 && !report) {
      unreferencedClean++;
      continue;
    }
    if (before === 0 && !report?.deletableAfter) continue;
    const away = movedAway.get(ing.id);
    proposals.push({
      category: "deletable_after_repoint",
      // As sure as the least sure repoint it depends on.
      confidence: away?.ambiguous ? "low" : (away?.confidence ?? "high"),
      table: "Ingredient",
      rowId: ing.id,
      recipeId: null,
      recipeName: "",
      current: { quantity: null, unit: "", ingredientId: ing.id, ingredientName: ing.name, notes: "" },
      proposed: { quantity: null, unit: "", target: { delete: true }, notes: "" },
      reason: before === 0 ? "Already unreferenced, and the name is junk." : `No references left after ${before} repoint(s).`,
      ambiguous: !!away?.ambiguous,
      question: away?.ambiguous ? "Only deletable if the open questions on its repoints are approved." : "",
    });
  }

  // ── G. Grocery lists that change ──
  const todayKey = today.toISOString().slice(0, 10);
  const lists: ListReport[] = [];
  for (const list of snap.groceryLists) {
    const mine = proposals.filter(
      (x) => x.table === "GroceryListItem" && snap.groceryItems.find((i) => i.id === x.rowId)?.groceryListId === list.id
    );
    if (!mine.length) continue;
    const plan = list.mealPlanId ? snap.mealPlans.find((m) => m.id === list.mealPlanId) : undefined;
    let currentPlan = "no meal plan linked";
    let weekStart = "";
    if (plan) {
      const start = new Date(plan.weekStartDate);
      weekStart = start.toISOString().slice(0, 10);
      const end = new Date(start.getTime() + 7 * 86_400_000).toISOString().slice(0, 10);
      currentPlan = todayKey >= weekStart && todayKey < end ? "yes" : todayKey < weekStart ? "future" : "past";
    } else if (list.mealPlanId) {
      currentPlan = "unknown";
    }
    lists.push({
      id: list.id,
      name: list.name,
      householdId: list.householdId,
      mealPlanId: list.mealPlanId,
      weekStart,
      currentPlan,
      itemsTotal: snap.groceryItems.filter((i) => i.groceryListId === list.id).length,
      itemsAffected: mine.length,
      itemsAmbiguous: mine.filter((x) => x.ambiguous).length,
    });
  }

  return {
    proposals,
    sanityFailures,
    ingredients: ingredientReports,
    lists,
    unreferencedClean,
    likeFilterCount: snap.ingredients.filter((i) => matchesLikeFilter(i.name)).length,
    detectorCount: ingredientReports.filter((r) => r.kind !== "prep_in_name").length,
    targetFor,
  };
}

// ─── Writing the report ─────────────────────────────────────────

// RFC 4180: a field with a comma, quote or line break is quoted, and quotes
// inside it are doubled.
export function csvField(value: unknown): string {
  const text = value === null || value === undefined ? "" : String(value);
  return /[",\r\n]|^\s|\s$/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(header: string[], rows: unknown[][]): string {
  return [header, ...rows].map((row) => row.map(csvField).join(",")).join("\r\n") + "\r\n";
}

// A rename shows the new name, not just the id it keeps.
function renameLabel(x: Proposal): string | null {
  const t = x.proposed.target;
  return x.category === "rename_ingredient" && "id" in t ? `rename:${t.name}` : null;
}

function proposalsCsv(proposals: Proposal[]): string {
  return toCsv(
    [
      "category", "confidence", "table", "row_id", "recipe_id", "recipe_name", "current_quantity", "current_unit",
      "current_ingredient_id", "current_ingredient_name", "current_notes", "proposed_quantity", "proposed_unit",
      "proposed_ingredient", "proposed_notes", "reason", "ambiguous", "question",
    ],
    proposals.map((x) => [
      x.category, x.confidence, x.table, x.rowId, x.recipeId, x.recipeName, x.current.quantity, x.current.unit,
      x.current.ingredientId, x.current.ingredientName, x.current.notes, x.proposed.quantity, x.proposed.unit,
      renameLabel(x) ?? targetLabel(x.proposed.target), x.proposed.notes, x.reason, x.ambiguous ? "yes" : "no", x.question,
    ])
  );
}

function ingredientsCsv(rows: IngredientReport[]): string {
  return toCsv(
    [
      "ingredient_id", "name", "kind", "reasons", "in_like_filter", "proposed_target", "target_ambiguous", "all_targets",
      "recipe_ingredient_refs", "library_recipe_ingredient_refs", "grocery_list_item_refs", "inventory_item_refs",
      "store_price_refs", "refs_after", "deletable_after",
    ],
    rows.map((r) => [
      r.id, r.name, r.kind, r.reasons.join("; "), r.likeFilter ? "yes" : "no", r.target ? targetLabel(r.target) : "",
      r.targetAmbiguous ? "yes" : "no", r.targets.join(" | "), r.refs.RecipeIngredient, r.refs.LibraryRecipeIngredient,
      r.refs.GroceryListItem, r.refs.InventoryItem, r.refs.StorePrice, r.refsAfter, r.deletableAfter ? "yes" : "no",
    ])
  );
}

function listsCsv(rows: ListReport[]): string {
  return toCsv(
    [
      "grocery_list_id", "name", "household_id", "meal_plan_id", "meal_plan_week_start", "current_meal_plan",
      "items_total", "items_affected", "items_ambiguous",
    ],
    rows.map((r) => [
      r.id, r.name, r.householdId, r.mealPlanId, r.weekStart, r.currentPlan, r.itemsTotal, r.itemsAffected, r.itemsAmbiguous,
    ])
  );
}

export function describe(x: Proposal, side: "current" | "proposed"): string {
  if (side === "proposed" && "delete" in x.proposed.target) return "(delete row)";
  const s = x[side];
  const amount = s.quantity === null ? "" : `${s.quantity} ${s.unit} | `;
  const name = side === "current" ? `${x.current.ingredientName} (#${x.current.ingredientId})` : targetText(x.proposed.target);
  return `${amount}${name}${s.notes ? ` | ${s.notes}` : ""}`;
}

const countBy = <T,>(items: T[], key: (item: T) => string) => {
  const out = new Map<string, number>();
  for (const item of items) out.set(key(item), (out.get(key(item)) ?? 0) + 1);
  return out;
};

const AMBIGUOUS_SHOWN = 200;

function summaryMd(report: Report, meta: { mode: string; isolation: string; generated: string }): string {
  const { proposals } = report;
  const md: string[] = [];
  const byCategory = countBy(proposals, (x) => x.category);
  const byConfidence = countBy(proposals, (x) => x.confidence);
  const byTable = countBy(proposals, (x) => x.table);
  const ambiguous = proposals.filter((x) => x.ambiguous);

  md.push("# Ingredient cleanup preview", "");
  md.push(`Generated ${meta.generated} (${meta.mode}).`, "");
  md.push("## Dry run: nothing was written", "");
  md.push(
    "This report lists proposed changes only. The script made no changes to the database, and it has no code that could.",
    "",
    `- Every query went through a guard that throws unless the SQL is one SELECT. It rejects semicolons, comments, stored procedures and the words INSERT, UPDATE, DELETE, MERGE, EXEC, ALTER, DROP, CREATE, TRUNCATE, INTO and other write or control words, in any case.`,
    `- All table reads ran in one transaction at isolation level ${meta.isolation}, opened by the driver with SET TRANSACTION ISOLATION LEVEL, and always rolled back at the end.`,
    "- The connection asked for read-only intent.",
    "- Proposals come from the app's own parser (src/lib/ingredient-format.ts), so they match what a fresh import would save.",
    ""
  );

  md.push("## Proposed changes by category", "", "| Category | Rows | Ambiguous |", "| --- | ---: | ---: |");
  for (const c of CATEGORIES) {
    md.push(`| ${c} | ${byCategory.get(c) ?? 0} | ${proposals.filter((x) => x.category === c && x.ambiguous).length} |`);
  }
  md.push(`| total | ${proposals.length} | ${ambiguous.length} |`, "");

  md.push("## By confidence", "", "| Confidence | Rows |", "| --- | ---: |");
  for (const c of ["high", "medium", "low"]) md.push(`| ${c} | ${byConfidence.get(c) ?? 0} |`);
  md.push("");

  md.push("## Rows touched per table", "", "| Table | Rows |", "| --- | ---: |");
  for (const [table, n] of [...byTable.entries()].sort()) md.push(`| ${table} | ${n} |`);
  md.push("");

  const deletable = report.ingredients.filter((r) => r.deletableAfter);
  md.push("## Junk ingredient rows", "");
  md.push(
    "- Earlier simple LIKE filter (reported before this script): 63",
    `- The same kind of LIKE filter, rerun here ('(%', '%(s)%', '%*%', '%$%', '%()%'): ${report.likeFilterCount}`,
    `- This detector (also unbalanced parens, a leading unit word, size or color words only, a second amount): ${report.detectorCount}`,
    `- Rows with a prep phrase in the name: ${report.ingredients.filter((r) => r.kind === "prep_in_name").length}`,
    `- Flagged rows with no references after the repoints: ${deletable.filter((r) => total(r.refs) > 0).length}`,
    `- Flagged rows that are already unreferenced: ${deletable.filter((r) => total(r.refs) === 0).length}`,
    `- Clean rows that are unreferenced (not proposed for deletion): ${report.unreferencedClean}`,
    ""
  );

  const failedNames = sanityByName(report);
  md.push("## Sanity check on proposed names", "");
  md.push(
    `${report.sanityFailures.length} proposals (${failedNames.length} distinct names) have a proposed name that still looks wrong. Each is marked ambiguous with the question "Proposed name looks wrong: ...".`,
    ""
  );
  for (const f of failedNames) md.push(`- "${f.name}" (${f.reasons.join(", ")}): ${f.rows} row(s)`);
  if (failedNames.length) md.push("");

  md.push("## Examples", "");
  for (const c of CATEGORIES) {
    const sample = proposals.filter((x) => x.category === c).slice(0, 8);
    if (!sample.length) continue;
    md.push(`### ${c}`, "");
    for (const x of sample) {
      const where = x.recipeName ? ` in "${x.recipeName}"` : "";
      md.push(`- ${x.table} #${x.rowId}${where} (${x.confidence}${x.ambiguous ? ", ambiguous" : ""}): \`${describe(x, "current")}\` -> \`${describe(x, "proposed")}\``);
    }
    md.push("");
  }

  md.push("## Ambiguous cases: questions for John", "");
  if (!ambiguous.length) md.push("None.");
  for (const x of ambiguous.slice(0, AMBIGUOUS_SHOWN)) {
    const where = x.recipeName ? ` in "${x.recipeName}"` : "";
    md.push(`- ${x.category}, ${x.table} #${x.rowId}${where}: \`${describe(x, "current")}\` -> \`${describe(x, "proposed")}\`. ${x.question}`);
  }
  if (ambiguous.length > AMBIGUOUS_SHOWN) {
    md.push("", `${ambiguous.length - AMBIGUOUS_SHOWN} more are in proposed-changes.csv (ambiguous = yes).`);
  }
  md.push("");

  md.push("## Affected grocery lists", "");
  md.push(`${report.lists.length} lists have items whose ingredient would change. ${report.lists.filter((l) => l.currentPlan === "yes").length} belong to this week's meal plan. See affected-grocery-lists.csv.`, "");
  return md.join("\n");
}

// Sanity-check failures by name, most rows first.
function sanityByName(report: Report): { name: string; reasons: string[]; rows: number }[] {
  const byName = new Map<string, { name: string; reasons: string[]; rows: number }>();
  for (const f of report.sanityFailures) {
    const seen = byName.get(f.name) ?? { name: f.name, reasons: f.reasons, rows: 0 };
    seen.rows++;
    byName.set(f.name, seen);
  }
  return [...byName.values()].sort((a, b) => b.rows - a.rows || a.name.localeCompare(b.name));
}

function countsLine(report: Report): string[] {
  const byCategory = countBy(report.proposals, (x) => x.category);
  return [
    `proposals: ${report.proposals.length} (ambiguous ${report.proposals.filter((x) => x.ambiguous).length})`,
    ...CATEGORIES.map((c) => `  ${c}: ${byCategory.get(c) ?? 0}`),
    `sanity-check failures: ${report.sanityFailures.length}`,
    `junk ingredient rows: like filter ${report.likeFilterCount}, detector ${report.detectorCount}`,
    `affected grocery lists: ${report.lists.length}`,
  ];
}

function writeReport(report: Report, dir: string, meta: { mode: string; isolation: string; generated: string }) {
  mkdirSync(dir, { recursive: true });
  const files: [string, string][] = [
    ["proposed-changes.csv", proposalsCsv(report.proposals)],
    ["junk-ingredients.csv", ingredientsCsv(report.ingredients)],
    ["affected-grocery-lists.csv", listsCsv(report.lists)],
    ["summary.md", summaryMd(report, meta)],
  ];
  for (const [file, body] of files) writeFileSync(join(dir, file), body, "utf8");
  return files.map(([file]) => join(dir, file));
}

// ─── Offline input from an earlier report ──────────────────────
//
// Rebuilds the recipe lines from the current_* columns of a
// proposed-changes.csv this script wrote, so the analysis can be rerun
// without the database. Only rows the report names are known: clean rows
// come from the targets in junk-ingredients.csv and summary.md beside it, not
// the whole Ingredient table, and there are no grocery, inventory or price
// rows.

// The units prisma/seed.ts creates.
const SEED_UNITS: [string, string, string][] = [
  ["teaspoon", "tsp", "VOLUME"], ["tablespoon", "tbsp", "VOLUME"], ["cup", "cup", "VOLUME"],
  ["fluid ounce", "fl oz", "VOLUME"], ["pint", "pt", "VOLUME"], ["quart", "qt", "VOLUME"],
  ["gallon", "gal", "VOLUME"], ["milliliter", "ml", "VOLUME"], ["liter", "L", "VOLUME"],
  ["ounce", "oz", "WEIGHT"], ["pound", "lb", "WEIGHT"], ["gram", "g", "WEIGHT"], ["kilogram", "kg", "WEIGHT"],
  ["each", "ea", "COUNT"], ["dozen", "doz", "COUNT"], ["pinch", "pinch", "OTHER"], ["dash", "dash", "OTHER"],
  ["clove", "clove", "OTHER"], ["bunch", "bunch", "OTHER"], ["can", "can", "OTHER"], ["package", "pkg", "OTHER"],
  ["slice", "slice", "OTHER"],
];

// RFC 4180, the reverse of toCsv.
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += ch;
  }
  if (field || row.length) rows.push([...row, field]);
  return rows;
}

function readCsvObjects(path: string): Record<string, string>[] {
  const [header, ...rows] = parseCsv(readFileSync(path, "utf8"));
  return rows.map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ""])));
}

export function snapshotFromCsv(path: string): Snapshot {
  const rows = readCsvObjects(path);
  const units: UnitRow[] = SEED_UNITS.map(([name, abbreviation, unitType], i) => ({ id: i + 1, name, abbreviation, unitType }));
  const unitId = (name: string) => {
    const found = units.find((u) => u.name === name);
    if (found) return found.id;
    units.push({ id: units.length + 1, name, abbreviation: name, unitType: "OTHER" });
    return units.length;
  };

  const names = new Map<number, string>();
  for (const r of rows) names.set(Number(r.current_ingredient_id), r.current_ingredient_name);
  // Clean target rows: "butter (#6)" in the report beside the CSV.
  const named = (text: string) => {
    const m = text.trim().match(/^(.+) \(#(\d+)\)$/);
    if (m && !names.has(Number(m[2]))) names.set(Number(m[2]), m[1]);
  };
  const dir = dirname(path);
  if (existsSync(join(dir, "junk-ingredients.csv"))) {
    for (const r of readCsvObjects(join(dir, "junk-ingredients.csv"))) r.all_targets.split(" | ").forEach(named);
  }
  if (existsSync(join(dir, "summary.md"))) {
    for (const quoted of readFileSync(join(dir, "summary.md"), "utf8").match(/`[^`]+`/g) ?? []) {
      quoted.slice(1, -1).split(" | ").forEach(named);
    }
  }

  const recipes = new Map<number, RecipeRow>();
  const libraryRecipes = new Map<number, LibraryRecipeRow>();
  const recipeLines: LineRow[] = [];
  const libraryLines: LineRow[] = [];
  for (const r of rows) {
    if (r.table !== "RecipeIngredient" && r.table !== "LibraryRecipeIngredient") continue;
    const recipeId = Number(r.recipe_id);
    const line: LineRow = {
      id: Number(r.row_id),
      recipeId,
      ingredientId: Number(r.current_ingredient_id),
      quantity: Number(r.current_quantity),
      unitId: unitId(r.current_unit),
      notes: r.current_notes || null,
    };
    if (r.table === "RecipeIngredient") {
      recipes.set(recipeId, { id: recipeId, householdId: 0, name: r.recipe_name });
      recipeLines.push(line);
    } else {
      libraryRecipes.set(recipeId, { id: recipeId, name: r.recipe_name });
      libraryLines.push(line);
    }
  }
  return {
    units,
    ingredients: [...names].map(([id, name]) => ({ id, name })),
    recipes: [...recipes.values()],
    recipeLines,
    libraryRecipes: [...libraryRecipes.values()],
    libraryLines,
    groceryLists: [],
    groceryItems: [],
    inventory: [],
    storePrices: [],
    mealPlans: [],
    mealPlanEntries: [],
  };
}

// ─── Self-test ──────────────────────────────────────────────────
//
// Real production lines, in memory. No database.

export function fixture(): Snapshot {
  const unitNames: [string, string, string][] = [
    ["teaspoon", "tsp", "VOLUME"], ["tablespoon", "tbsp", "VOLUME"], ["cup", "cup", "VOLUME"],
    ["ounce", "oz", "WEIGHT"], ["pound", "lb", "WEIGHT"], ["gram", "g", "WEIGHT"],
    ["each", "ea", "COUNT"], ["clove", "clove", "OTHER"], ["package", "pkg", "OTHER"], ["can", "can", "OTHER"],
    ["slice", "slice", "OTHER"],
  ];
  const units = unitNames.map(([name, abbreviation, unitType], i) => ({ id: i + 1, name, abbreviation, unitType }));
  const unitId = (name: string) => units.find((u) => u.name === name)!.id;

  const ingredients: IngredientRow[] = [];
  const ingredientId = (name: string) => {
    const found = ingredients.find((i) => i.name === name);
    if (found) return found.id;
    ingredients.push({ id: ingredients.length + 1, name });
    return ingredients.length;
  };
  // Clean rows, to be left alone or used as targets.
  for (const name of ["garlic", "large eggs", "butter", "baking powder", "Chicken Breast", "rice", "white rice", "eggs", "water", "ground beef", "lemon zest", "mozzarella", "cilantro", "thyme", "ranch dressing"]) ingredientId(name);

  const recipes: RecipeRow[] = [];
  const recipeLines: LineRow[] = [];
  const add = (recipe: string, quantity: number, unit: string, ingredient: string, notes: string | null = null) => {
    let r = recipes.find((x) => x.name === recipe);
    if (!r) {
      r = { id: recipes.length + 1, householdId: 1, name: recipe };
      recipes.push(r);
    }
    recipeLines.push({ id: recipeLines.length + 1, recipeId: r.id, ingredientId: ingredientId(ingredient), quantity, unitId: unitId(unit), notes });
  };

  add("Garlic Parmesan Chicken", 1, "cup", "garlic parmesan breading");
  add("Alfredo", 2, "clove", "garlic parmesan breading", "minced");
  add("BARLEY & CRANBERRY PORK STEW", 4, "clove", "garlic parmesan breading", "finely chopped");
  add("Baked Ziti", 1, "pound", "uncooked penne pasta");
  add("Chicken Penne", 12, "ounce", "uncooked penne pasta");
  add("Beef Stew", 3, "each", "large potatoes cut in small pieces");
  add("Baked Parmesan Chicken", 8, "each", "(700 grams) chicken boneless", "skinless chicken breasts");
  add("Chicken Tikka Masala Recipe", 1.5, "pound", "(700 grams) chicken boneless", "(Preferably thighs, or breasts)");
  add("Biscuits", 1, "teaspoon", "teaspoon(s) baking powder");
  add("Biscuits", 1.5, "teaspoon", "cup(s) (1 stick) unsalted butter");
  add("Biscuits", 2, "each", "large eggs");
  add("Biscuits", 0.5, "cup", "butter");
  add("Enchiladas", 1, "each", "cheese (such as cheddar");
  add("Curry", 1, "each", "green chilli ()");
  add("French Onion Soup", 1, "each", "very large yellow onion sliced fairly thin");
  add("Chili", 0.5, "each", "large onions chopped", "diced");
  add("Cheesecake", 1, "each", "(8 oz) pkg Neufchatel cheese*");
  add("Cheesecake", 2, "each", "(8 oz.) packages cream cheese");
  add("Shortbread", 0.5, "cup", "(1 stick) butter");
  add("Fajitas", 3, "each", "large red", "yellow, or orange bell peppers");
  add("Tomato Sauce", 20, "each", "large or 40 small tomatoes");
  add("Alfredo", 2, "clove", "garlic", "crushed");
  // Proposals the first live run got wrong.
  add("Potato Soup", 4, "each", "green onions - chopped");
  add("Potato Soup", 0.5, "pound", "smoked bacon - chopped");
  add("Potato Soup", 2, "each", "lg. russet potatoes - scrubbed clean and cubed");
  add("Potato Soup", 2, "each", "garlic cloves - peeled", "crushed");
  add("Potato Soup", 1, "each", "small onion - peeled", "chopped");
  add("Potato Soup", 2, "cup", "kale or Swiss chard - chopped or torn");
  add("Potato Soup", 0.5, "teaspoon", "rosemary - crushed");
  add("Potato Soup", 0.5, "teaspoon", "lemon peel - shredded");
  add("Chicken Parmesan", 4, "each", "-5 chicken breasts cut in pieces or 12-ish chicken tenders");
  add("Chicken Parmesan Bake", 2, "pound", "-5 chicken breasts cut in pieces or 12-ish chicken tenders");
  add("Mac and Cheese", 1, "pound", "cheese (such as cheddar", "jack, and/or fontina), grated");
  add("Tikka Gravy", 1.35, "pound", "(500 grams) tomatoes", "(pureed/chopped or 10 oz. (1 cup) tomato puree/ passata or 14 oz can peeled tomatoes, read notes)");
  add("Chicken Pot Pie", 2.5, "cup", "shredded cooked rotisserie or left-over chicken*");
  add("Ham Casserole", 1, "each", "(or so) cup cooked ham", "diced");
  add("Fried Rice", 4, "cup", "cooked rice");
  add("Rice Pudding", 1, "cup", "cooked rice", "Chilled");
  add("Burrito Bowl", 2.5, "cup", "Cooked white rice", "Shredded Chicken");
  add("Chicken Tortilla Soup", 2, "cup", "cooked chicken breasts", "shredded or cut into bite-size pieces");
  add("Zucchini Bake", 3, "cup", "(1/4-inch-thick) slices small zucchini");
  // Proposals the second live run got wrong.
  add("Soup", 4, "cup", "water or chicken broth");
  add("Stroganoff", 1.5, "pound", "button or cremini mushrooms", "quartered");
  add("Chili Dogs", 1, "each", "14 oz. jar or can chili sauce", "the chunkier, the better");
  add("Casserole", 1, "each", "sleeve Ritz or Town House crackers", "crumbled");
  add("Tacos", 1, "each", "Tortillas or taco shells", "for serving");
  add("Tacos", 1, "each", "Tortilla chips or strips, monterrey jack cheese, sliced avocado", "for serving");
  add("Meatloaf", 1, "each", "-1/2 lbs. ground beef");
  add("Cookies", 2, "each", "-4 T. milk", "for frosting");
  add("Cookies", 0.5, "each", "-10-oz. pkg. REESE'S Peanut Butter Chips");
  add("Salad", 6, "ounce", "package feta cheese", "crumbled");
  add("Salad", 12, "ounce", "can of salsa");
  add("Stuffed Shells", 12, "ounce", "box jumbo shells pasta");
  add("Stuffed Shells", 36, "ounce", "(28 oz) can crushed tomatoes");
  add("Quiche", 3, "each", "whole Eggs Beaten");
  add("Cookies", 2, "each", "(1 cup butter)");
  add("Alfredo", 2, "clove", "garlic parmesan breading", ", finely minced");
  add("Alfredo", 6, "clove", "garlic parmesan breading", "Minced");
  add("Wild Rice Soup", 1, "each", "(4.5 ounce) package quick cooking long grain and wild rice with seasoning packet");
  add("Enchiladas", 2, "cup", "cooked and shredded chicken");
  add("Enchiladas", 2, "cup", "cooked shredded chicken");
  add("Pot Pie", 2, "cup", "cooked and cubed chicken breast");
  add("Pot Pie", 2, "cup", "cooked shredded chicken breast");
  // A name still too long after the parser, for the sanity check.
  add("Crab Cakes", 1, "teaspoon", "homemade Old Bay seafood seasoning blend mix*");
  // Misses from the third live run.
  add("Lemon Bars", 1, "each", "Grated zest from one lemon");
  add("Lemon Bars", 1, "each", "zest from one lemon or orange", "for topping");
  add("Lemon Bars", 1, "tablespoon", "grated lemon zest", "2 lemons");
  add("Pizza", 2, "cup", "shredded mozarella", "the kind shaped like a ball");
  add("Nachos", 1, "cup", "shredded Monterey Jack cheese");
  add("Nachos", 1, "cup", "grated Monterey Jack cheese");
  add("Nachos", 1, "cup", "shredded Monterrey jack cheese", "divided");
  add("Pasta", 3, "clove", "minced fresh garlic");
  add("Pasta", 2, "tablespoon", "chopped fresh parsley leaves");
  add("Pasta", 2, "tablespoon", "chopped fresh flat-leaf parsley");
  add("Pasta", 1, "tablespoon", "minced parsley");
  add("Curry", 2, "tablespoon", "finely chopped fresh cilantro leaves");
  add("Curry", 1, "tablespoon", "chopped fresh cilantro,");
  add("Curry", 1, "teaspoon", "minced fresh thyme leaves");
  add("Curry", 1, "tablespoon", "minced fresh ginger");
  add("Curry", 1, "teaspoon", "grated ginger");
  add("Curry", 1, "tablespoon", "chopped fresh dill");
  add("Salad", 1, "each", "chopped Lettuce");
  add("Salad", 1, "tablespoon", "Soy Sauce - low sodium");
  add("Apple Pie", 2, "each", "Your Favorite Pie Crust Recipe - you will need 2 crusts", "one for the bottom of the pie and one for the top");
  add("Sugar Cookies", 1, "teaspoon", "almond extract or vanilla or lemon or mint or your favorite", "for icing");
  // Misses from the fourth live run.
  add("Salsa Chicken Wraps", 32, "ounce", "your favorite salsa");
  add("Salsa Chicken Wraps", 1, "each", "your favorite ranch dressing");
  // Misses from the fifth live run: products whose note offers fresh garlic.
  add("Chicken Tikka Masala Recipe", 1.75, "tablespoon", "ginger garlic paste", "(or tbsp grated ginger + ¾ tbsp grated garlic)");
  add("Homemade Spaghetti Sauce", 0.5, "teaspoon", "garlic powder", "or 1 1/2 tsp crushed, real garlic");

  const groceryLists: GroceryListRow[] = [{ id: 1, householdId: 1, mealPlanId: 1, name: "This week" }];
  const groceryItems: GroceryItemRow[] = [
    { id: 1, groceryListId: 1, ingredientId: ingredientId("garlic parmesan breading"), quantity: 2, unitId: unitId("clove") },
    { id: 2, groceryListId: 1, ingredientId: ingredientId("(700 grams) chicken boneless"), quantity: 8, unitId: unitId("each") },
    { id: 3, groceryListId: 1, ingredientId: ingredientId("butter"), quantity: 0.5, unitId: unitId("cup") },
  ];
  return {
    units,
    ingredients,
    recipes,
    recipeLines,
    libraryRecipes: [],
    libraryLines: [],
    groceryLists,
    groceryItems,
    inventory: [{ id: 1, householdId: 1, ingredientId: ingredientId("(1 stick) butter"), quantity: 1, unitId: unitId("each") }],
    storePrices: [],
    mealPlans: [{ id: 1, householdId: 1, weekStartDate: new Date("2026-10-26T00:00:00Z") }],
    mealPlanEntries: [{ mealPlanId: 1, recipeId: recipes.find((r) => r.name === "Alfredo")!.id }],
  };
}

function selfTest(out: string | undefined): number {
  let failures = 0;
  const check = (label: string, ok: boolean) => {
    if (!ok) failures++;
    console.log(`  ${ok ? "ok  " : "FAIL"} ${label}`);
  };

  console.log("Query guard:");
  for (const [label, sql] of Object.entries(QUERIES)) {
    check(`allows the ${label} query`, (() => { try { selectOnly(sql); return true; } catch { return false; } })());
  }
  for (const bad of [
    "UPDATE [Ingredient] SET name = 'x'",
    "select 1; delete from [Ingredient]",
    "SELECT * INTO backup FROM [Ingredient]",
    "SELECT 1 -- ; DROP TABLE x",
    "exec sp_who",
    "SELECT id FROM [Ingredient] WHERE 1 = (SELECT 1)",
    "  merge [Ingredient] using x on 1=1 when matched then delete",
    "SELECT 1 /* */ ",
    "with x as (select 1) select * from x",
  ]) {
    check(`rejects ${JSON.stringify(bad)}`, (() => { try { selectOnly(bad); return false; } catch { return true; } })());
  }

  const snap = fixture();
  const report = analyze(snap, new Date("2026-10-26T12:00:00Z"));

  console.log("\nProposals:");
  for (const x of report.proposals) {
    const where = x.recipeName ? ` "${x.recipeName}"` : "";
    console.log(`  [${x.category} / ${x.confidence}${x.ambiguous ? " / AMBIGUOUS" : ""}] ${x.table} #${x.rowId}${where}`);
    console.log(`      ${describe(x, "current")}`);
    console.log(`   -> ${describe(x, "proposed")}`);
    if (x.question) console.log(`      Q: ${x.question}`);
  }

  console.log("\nJunk ingredient rows:");
  for (const r of report.ingredients) {
    console.log(`  #${r.id} "${r.name}" (${r.kind}) -> ${r.target ? targetText(r.target) : "unresolved"}${r.targetAmbiguous ? " [ambiguous]" : ""}; refs ${total(r.refs)}, after ${r.refsAfter}, deletable ${r.deletableAfter ? "yes" : "no"}`);
  }
  console.log("\nAffected grocery lists:");
  for (const l of report.lists) console.log(`  #${l.id} "${l.name}" household ${l.householdId}: ${l.itemsAffected}/${l.itemsTotal} items, current plan ${l.currentPlan}`);

  console.log("\nCounts:");
  for (const line of countsLine(report)) console.log(`  ${line}`);

  console.log("\nChecks:");
  const line = (recipe: string, ingredient: string) =>
    report.proposals.find((x) => x.recipeName === recipe && x.current.ingredientName === ingredient && x.table === "RecipeIngredient");
  const target = (x: Proposal | undefined) => (x ? targetText(x.proposed.target) : "none");
  const garlicId = snap.ingredients.find((i) => i.name === "garlic")!.id;
  const alfredo = line("Alfredo", "garlic parmesan breading");
  check("Alfredo garlic -> garlic", alfredo?.category === "wrong_link" && target(alfredo) === `garlic (#${garlicId})`);
  check("stew garlic -> garlic", target(line("BARLEY & CRANBERRY PORK STEW", "garlic parmesan breading")) === `garlic (#${garlicId})`);
  check("breading line left alone", !line("Garlic Parmesan Chicken", "garlic parmesan breading"));
  check("penne creator left alone", !line("Baked Ziti", "uncooked penne pasta"));
  check("other penne line asks", !!line("Chicken Penne", "uncooked penne pasta")?.ambiguous);
  check("baking powder -> existing row", target(line("Biscuits", "teaspoon(s) baking powder")).startsWith("baking powder (#"));
  const stick = line("Biscuits", "cup(s) (1 stick) unsalted butter");
  check("stick butter is ambiguous at 0.5 cup", !!stick?.ambiguous && stick.proposed.quantity === 0.5 && stick.proposed.unit === "cup");
  check("(1 stick) butter -> butter", target(line("Shortbread", "(1 stick) butter")).startsWith("butter (#"));
  check("onion sliced -> yellow onion", target(line("French Onion Soup", "very large yellow onion sliced fairly thin")) === "yellow onion (new)");
  check("large onions chopped -> onions + notes", line("Chili", "large onions chopped")?.proposed.notes === "large, chopped, diced");
  check("large red -> bell peppers", line("Fajitas", "large red")?.category === "lost_noun" && target(line("Fajitas", "large red")) === "bell peppers (new)");
  check("chicken boneless asks", !!line("Chicken Tikka Masala Recipe", "(700 grams) chicken boneless")?.ambiguous);
  check("two amounts asks", !!line("Tomato Sauce", "large or 40 small tomatoes")?.ambiguous);
  check("Neufchatel unit change asks", !!line("Cheesecake", "(8 oz) pkg Neufchatel cheese*")?.ambiguous);
  check("clean rows untouched", !report.proposals.some((x) => ["garlic", "large eggs", "butter"].includes(x.current.ingredientName) && x.table === "RecipeIngredient"));

  // Each example as [quantity, unit, target, notes].
  const shown = (x: Proposal | undefined) => (x ? [x.proposed.quantity, x.proposed.unit, target(x), x.proposed.notes] : null);
  const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
  const chickenBreast = `Chicken Breast (#${snap.ingredients.find((i) => i.name === "Chicken Breast")!.id})`;
  const examples: [string, string, string, unknown[]][] = [
    ["green onions - chopped", "Potato Soup", "green onions - chopped", [4, "each", "green onions (new)", "chopped"]],
    ["smoked bacon - chopped", "Potato Soup", "smoked bacon - chopped", [0.5, "pound", "smoked bacon (new)", "chopped"]],
    ["lg. russet potatoes", "Potato Soup", "lg. russet potatoes - scrubbed clean and cubed", [2, "each", "russet potatoes (new)", "large, scrubbed clean and cubed"]],
    ["garlic cloves - peeled", "Potato Soup", "garlic cloves - peeled", [2, "clove", `garlic (#${garlicId})`, "peeled, crushed"]],
    // "onions": the spelling the earlier "large onions chopped" line creates.
    ["small onion - peeled", "Potato Soup", "small onion - peeled", [1, "each", "onions (new)", "small, peeled, chopped"]],
    ["kale or Swiss chard", "Potato Soup", "kale or Swiss chard - chopped or torn", [2, "cup", "kale (new)", "or Swiss chard, chopped or torn"]],
    ["rosemary - crushed", "Potato Soup", "rosemary - crushed", [0.5, "teaspoon", "rosemary (new)", "crushed"]],
    ["lemon peel - shredded", "Potato Soup", "lemon peel - shredded", [0.5, "teaspoon", "lemon peel (new)", "shredded"]],
    ["-5 chicken breasts, each", "Chicken Parmesan", "-5 chicken breasts cut in pieces or 12-ish chicken tenders", [5, "each", chickenBreast, "4 to 5, cut in pieces or 12-ish chicken tenders"]],
    ["-5 chicken breasts, pound", "Chicken Parmesan Bake", "-5 chicken breasts cut in pieces or 12-ish chicken tenders", [2, "pound", chickenBreast, "cut in pieces or 12-ish chicken tenders"]],
    ["cheese across name and note", "Mac and Cheese", "cheese (such as cheddar", [1, "pound", "cheese (new)", "such as cheddar, jack, and/or fontina, grated"]],
    ["cheese (such as cheddar", "Enchiladas", "cheese (such as cheddar", [1, "each", "cheese (new)", "such as cheddar"]],
    ["tomatoes with a nested-paren note", "Tikka Gravy", "(500 grams) tomatoes", [1.35, "pound", "tomatoes (new)", "500 grams, pureed/chopped or 10 oz. (1 cup) tomato puree/passata or 14 oz can peeled tomatoes, read notes"]],
    ["chicken boneless", "Chicken Tikka Masala Recipe", "(700 grams) chicken boneless", [1.5, "pound", "boneless chicken (new)", "700 grams, Preferably thighs, or breasts"]],
    ["chicken boneless, skinless", "Baked Parmesan Chicken", "(700 grams) chicken boneless", [8, "each", "boneless skinless chicken breasts (new)", "700 grams"]],
    ["rotisserie or left-over chicken", "Chicken Pot Pie", "shredded cooked rotisserie or left-over chicken*", [2.5, "cup", "cooked chicken (new)", "shredded, rotisserie or left-over"]],
    ["(or so) cup cooked ham", "Ham Casserole", "(or so) cup cooked ham", [1, "cup", "cooked ham (new)", "or so, diced"]],
    ["large or 40 small tomatoes", "Tomato Sauce", "large or 40 small tomatoes", [20, "each", "tomatoes (new)", "large or 40 small"]],
  ];
  for (const [label, recipe, ingredient, want] of examples) {
    const got = shown(line(recipe, ingredient));
    check(`${label}: ${JSON.stringify(want)}`, same(got, want) || (console.log(`      got ${JSON.stringify(got)}`), false));
  }
  check("garlic cloves asks about the unit", !!line("Potato Soup", "garlic cloves - peeled")?.ambiguous);
  check("-5 chicken breasts, pound asks", /end of a range/.test(line("Chicken Parmesan Bake", "-5 chicken breasts cut in pieces or 12-ish chicken tenders")?.question ?? ""));
  check("cooked ham asks about each -> cup", !!line("Ham Casserole", "(or so) cup cooked ham")?.ambiguous);
  check("plain dash lines need no question", ["green onions - chopped", "rosemary - crushed", "kale or Swiss chard - chopped or torn"].every((n) => !line("Potato Soup", n)?.ambiguous));

  console.log("\nSecond live run:");
  const want = (label: string, recipe: string, ingredient: string, expected: unknown[], ambiguous: boolean) => {
    const x = line(recipe, ingredient);
    const got = shown(x);
    check(`${label}: ${JSON.stringify(expected)}${ambiguous ? " (asks)" : ""}`, (same(got, expected) && !!x?.ambiguous === ambiguous) || (console.log(`      got ${JSON.stringify(got)} ambiguous ${x?.ambiguous} ${x?.question ?? ""}`), false));
  };
  const idOf = (name: string) => `${name} (#${snap.ingredients.find((i) => i.name === name)!.id})`;
  want("water or chicken broth", "Soup", "water or chicken broth", [4, "cup", idOf("water"), "or chicken broth"], false);
  want("button or cremini", "Stroganoff", "button or cremini mushrooms", [1.5, "pound", "button mushrooms (new)", "or cremini mushrooms, quartered"], false);
  want("jar or can chili sauce", "Chili Dogs", "14 oz. jar or can chili sauce", [1, "each", "chili sauce (new)", "14 oz jar or can, the chunkier, the better"], false);
  want("sleeve Ritz", "Casserole", "sleeve Ritz or Town House crackers", [1, "each", "Ritz crackers (new)", "1 sleeve, or Town House crackers, crumbled"], false);
  want("Tortillas or taco shells", "Tacos", "Tortillas or taco shells", [1, "each", "tortillas (new)", "or taco shells, for serving"], false);
  want("multi-item garnish asks", "Tacos", "Tortilla chips or strips, monterrey jack cheese, sliced avocado", [1, "each", "tortilla chips (new)", "or strips, monterrey jack cheese, sliced avocado, for serving"], true);
  want("-1/2 lbs. ground beef", "Meatloaf", "-1/2 lbs. ground beef", [1.5, "pound", idOf("ground beef"), ""], true);
  check("-1/2 lbs. asks 1 1/2 lb", (line("Meatloaf", "-1/2 lbs. ground beef")?.question ?? "").includes("as 1 1/2 lb?"));
  want("-4 T. milk", "Cookies", "-4 T. milk", [4, "tablespoon", "milk (new)", "2 to 4 tbsp, for frosting"], true);
  want("0.5 -10-oz. pkg.", "Cookies", "-10-oz. pkg. REESE'S Peanut Butter Chips", [0.5, "package", "REESE'S peanut butter chips (new)", "10 oz"], true);
  want("6 ounce package feta", "Salad", "package feta cheese", [6, "ounce", "feta cheese (new)", "package, crumbled"], false);
  want("12 ounce can of salsa", "Salad", "can of salsa", [12, "ounce", "salsa (new)", "can"], false);
  want("12 ounce box jumbo shells", "Stuffed Shells", "box jumbo shells pasta", [12, "ounce", "jumbo shells pasta (new)", "box"], false);
  want("36 ounce (28 oz) can asks", "Stuffed Shells", "(28 oz) can crushed tomatoes", [36, "ounce", "crushed tomatoes (new)", "28 oz can"], true);
  want("(1/4-inch-thick) slices zucchini", "Zucchini Bake", "(1/4-inch-thick) slices small zucchini", [3, "cup", "zucchini (new)", "1/4-inch-thick slices, small"], false);
  want("whole Eggs Beaten", "Quiche", "whole Eggs Beaten", [3, "each", idOf("eggs"), "whole, beaten"], false);
  want("(1 cup butter) asks", "Cookies", "(1 cup butter)", [2, "each", idOf("butter"), "1 cup"], true);
  check("wrong_link note loses its leading comma", line("Alfredo", "garlic parmesan breading")?.proposed.notes !== undefined && report.proposals.some((x) => x.recipeName === "Alfredo" && x.current.notes === ", finely minced" && x.proposed.notes === "finely minced"));
  check("wrong_link note Minced -> minced", report.proposals.some((x) => x.recipeName === "Alfredo" && x.current.notes === "Minced" && x.proposed.notes === "minced"));
  check("long grain and wild rice passes the name check", !report.sanityFailures.some((f) => f.name === "quick cooking long grain and wild rice"));

  console.log("\nCooked X:");
  const cookedNames = ["cooked rice", "Cooked white rice", "cooked chicken breasts", "cooked and shredded chicken"];
  check("no wrong_link for cooked X", !report.proposals.some((x) => x.category === "wrong_link" && cookedNames.includes(x.current.ingredientName)));
  check("no line repointed off cooked X", !report.proposals.some((x) => x.table === "RecipeIngredient" && cookedNames.includes(x.current.ingredientName)));
  const cookedQuestions = report.proposals.filter((x) => x.category === "cooked_separate");
  check("one question per tidy cooked name", same(cookedQuestions.map((x) => x.current.ingredientName).sort(), [...cookedNames].sort()));
  const cookedChicken = cookedQuestions.find((x) => x.current.ingredientName === "cooked and shredded chicken");
  check('"cooked and shredded chicken" and "cooked shredded chicken" -> "cooked chicken"', cookedChicken?.proposed.notes === "shredded" && /Rename "cooked and shredded chicken" \(#\d+\) to "cooked chicken"/.test(cookedChicken.question) && cookedChicken.question.includes('"cooked shredded chicken"'));
  const cookedBreast = cookedQuestions.find((x) => x.current.ingredientName === "cooked chicken breasts");
  check("cooked chicken breast rows join cooked chicken breasts", ["cooked and cubed chicken breast", "cooked shredded chicken breast"].every((n) => (cookedBreast?.question ?? "").includes(`"${n}"`)) && (cookedBreast?.question ?? "").includes('note "cubed"'));
  // "cooked rice," on its own snapshot, so the plain "cooked rice" question above stays as it was.
  const commaSnap = fixture();
  const riceRecipe = commaSnap.recipes[0].id;
  commaSnap.ingredients.push({ id: 9001, name: "cooked rice," });
  commaSnap.recipeLines.push({ id: 9001, recipeId: riceRecipe, ingredientId: 9001, quantity: 2, unitId: commaSnap.units.find((u) => u.name === "cup")!.id, notes: null });
  const commaReport = analyze(commaSnap, new Date("2026-10-26T12:00:00Z"));
  const commaRice = commaReport.proposals.filter((x) => x.category === "cooked_separate");
  const cookedRiceId = commaSnap.ingredients.find((i) => i.name === "cooked rice")!.id;
  check('"cooked rice," is not a second cooked question', commaRice.filter((x) => /cooked rice/.test(x.current.ingredientName)).length === 1 && !commaRice.some((x) => x.question.includes("#9001")));
  const commaLine = commaReport.proposals.find((x) => x.table === "RecipeIngredient" && x.rowId === 9001);
  check('"cooked rice," line repoints to "cooked rice"', !!commaLine && "id" in commaLine.proposed.target && commaLine.proposed.target.id === cookedRiceId && !commaLine.ambiguous);
  check('"cooked rice," row is deleted, not renamed', commaReport.proposals.some((x) => x.category === "deletable_after_repoint" && x.rowId === 9001) && !commaReport.proposals.some((x) => x.category === "rename_ingredient"));
  check('asks "Keep \'cooked rice\' separate from \'rice\'?"', cookedQuestions.some((x) => x.question === 'Keep "cooked rice" separate from "rice"?' && x.ambiguous));
  check("cooked questions keep the link", cookedQuestions.every((x) => "id" in x.proposed.target && x.proposed.target.id === x.current.ingredientId));

  console.log("\nThird live run:");
  want("Grated zest from one lemon", "Lemon Bars", "Grated zest from one lemon", [1, "each", idOf("lemon zest"), "grated, from one lemon"], false);
  want("zest from one lemon or orange", "Lemon Bars", "zest from one lemon or orange", [1, "each", idOf("lemon zest"), "from one lemon, or orange, for topping"], false);
  want("grated lemon zest", "Lemon Bars", "grated lemon zest", [1, "tablespoon", idOf("lemon zest"), "grated, 2 lemons"], false);
  check('never proposes the bare name "zest"', !report.proposals.some((x) => /^zest$/i.test(targetText(x.proposed.target).replace(/ \(.*$/, ""))));
  check('"zest" alone fails the name check', badNameReasons("zest", makeUnitLookup(snap.units) as UnitLookup).includes("names a part without its fruit"));
  want("mozarella is a typo of mozzarella", "Pizza", "shredded mozarella", [2, "cup", idOf("mozzarella"), "shredded, the kind shaped like a ball"], true);
  check('mozarella asks "Treat ... as ...?"', (line("Pizza", "shredded mozarella")?.question ?? "").includes('Treat "mozarella" as "mozzarella"?'));
  want("Monterey Jack cheese is created once", "Nachos", "shredded Monterey Jack cheese", [1, "cup", "Monterey Jack cheese (new)", "shredded"], false);
  want("Monterrey is a typo of Monterey", "Nachos", "shredded Monterrey jack cheese", [1, "cup", "Monterey Jack cheese (new)", "shredded, divided"], true);
  check('Monterrey asks "Treat ... as ...?"', (line("Nachos", "shredded Monterrey jack cheese")?.question ?? "").includes('Treat "monterrey jack cheese" as "Monterey Jack cheese"?'));
  want("fresh garlic -> garlic", "Pasta", "minced fresh garlic", [3, "clove", idOf("garlic"), "fresh, minced"], false);
  want("fresh parsley leaves -> parsley", "Pasta", "chopped fresh parsley leaves", [2, "tablespoon", "parsley (new)", "fresh, leaves, chopped"], false);
  want("fresh flat-leaf parsley -> parsley", "Pasta", "chopped fresh flat-leaf parsley", [2, "tablespoon", "parsley (new)", "fresh, flat-leaf, chopped"], false);
  want("minced parsley -> parsley", "Pasta", "minced parsley", [1, "tablespoon", "parsley (new)", "minced"], false);
  want("fresh cilantro leaves -> cilantro", "Curry", "finely chopped fresh cilantro leaves", [2, "tablespoon", idOf("cilantro"), "fresh, leaves, finely chopped"], false);
  want("fresh cilantro -> cilantro", "Curry", "chopped fresh cilantro,", [1, "tablespoon", idOf("cilantro"), "fresh, chopped"], false);
  want("fresh thyme leaves -> thyme", "Curry", "minced fresh thyme leaves", [1, "teaspoon", idOf("thyme"), "fresh, leaves, minced"], false);
  want("fresh ginger -> new ginger", "Curry", "minced fresh ginger", [1, "tablespoon", "ginger (new)", "fresh, minced"], false);
  want("fresh dill stays with no dill row", "Curry", "chopped fresh dill", [1, "tablespoon", "fresh dill (new)", "chopped"], false);
  const peeled = (name: string) => peeledNames(name).map((p) => `${p.name} | ${p.notes.join(", ")}`);
  check("fresh parsley leaves peels to parsley", same(peeled("fresh parsley leaves"), ["parsley leaves | fresh", "parsley | fresh, leaves"]));
  check("fresh flat-leaf parsley peels to parsley", same(peeled("fresh flat-leaf parsley"), ["flat-leaf parsley | fresh", "parsley | fresh, flat-leaf"]));
  check("bay leaves does not peel", same(peeled("bay leaves"), []));
  for (const [a, b, wanted] of [
    ["mozarella", "mozzarella", true],
    ["Monterrey jack cheese", "Monterey Jack cheese", true],
    ["pecans", "pecan pie", false],
    ["rice", "ice", false],
    ["garlic", "fresh garlic", false],
    ["butter", "batter", false],
    ["dried onions", "fried onions", false],
    ["canned pears", "canned peas", false],
    ["red pepper", "green pepper", false],
  ] as [string, string, boolean][]) {
    check(`typo ${JSON.stringify(a)} ~ ${JSON.stringify(b)}: ${wanted}`, typoOf(a, b) === wanted);
  }
  check("red pepper and red peppers share a key", ingredientKey("red pepper") === ingredientKey("red peppers"));
  check("bell pepper and bell peppers share a key", ingredientKey("Bell Pepper") === ingredientKey("bell peppers"));
  for (const [name, wanted] of [
    ["REESE'S Peanut Butter Chips", "REESE'S peanut butter chips"],
    ["Nestle Semi-Sweet chocolate chips", "Nestle semi-sweet chocolate chips"],
    ["Prego sauce", "Prego sauce"],
    ["Ritz crackers", "Ritz crackers"],
    ["Vidalia onion", "Vidalia onion"],
    ["Parmigiano-Reggiano cheese", "Parmigiano-Reggiano cheese"],
    ["Monterey Jack cheese", "Monterey Jack cheese"],
    ["monterey jack cheese", "Monterey Jack cheese"],
    ["Parmesan", "Parmesan"],
    ["Swiss cheese", "Swiss cheese"],
    ["Greek yogurt", "Greek yogurt"],
    ["Italian sausage", "Italian sausage"],
    ["Salad Supreme", "Salad Supreme"],
    ["Lettuce", "lettuce"],
    ["Mustard", "mustard"],
    ["Soy Sauce", "soy sauce"],
    ["Tortillas", "tortillas"],
    ["whole Eggs", "whole eggs"],
    ["Cheddar cheese", "cheddar cheese"],
    ["sharp Cheddar", "sharp cheddar"],
    ["pepper jack cheese", "pepper jack cheese"],
  ]) {
    check(`new name ${JSON.stringify(name)} -> ${JSON.stringify(wanted)}`, newIngredientName(name) === wanted);
  }
  want("chopped Lettuce -> lettuce", "Salad", "chopped Lettuce", [1, "each", "lettuce (new)", "chopped"], false);
  want("Soy Sauce -> soy sauce", "Salad", "Soy Sauce - low sodium", [1, "tablespoon", "soy sauce (new)", "low sodium"], false);
  const crust = line("Apple Pie", "Your Favorite Pie Crust Recipe - you will need 2 crusts");
  want("recipe reference stays as written", "Apple Pie", "Your Favorite Pie Crust Recipe - you will need 2 crusts", [2, "each", idOf("Your Favorite Pie Crust Recipe - you will need 2 crusts"), "one for the bottom of the pie and one for the top"], true);
  check("recipe reference asks", crust?.category === "recipe_reference" && crust.question === "This line points to another recipe. Keep it as written?");
  check("recipe reference row is not deleted", !report.proposals.some((x) => x.category === "deletable_after_repoint" && x.current.ingredientName.startsWith("Your Favorite")));
  check("a flavor choice with \"your favorite\" is not a recipe", line("Sugar Cookies", "almond extract or vanilla or lemon or mint or your favorite")?.category !== "recipe_reference");

  // "cooked rice of choice" joins "cooked rice", on its own snapshot.
  const choiceSnap = fixture();
  choiceSnap.ingredients.push({ id: 9002, name: "cooked rice of choice" });
  choiceSnap.recipeLines.push({ id: 9002, recipeId: riceRecipe, ingredientId: 9002, quantity: 2, unitId: choiceSnap.units.find((u) => u.name === "cup")!.id, notes: null });
  const choiceRice = analyze(choiceSnap, new Date("2026-10-26T12:00:00Z")).proposals.filter((x) => x.category === "cooked_separate");
  const riceQuestion = choiceRice.find((x) => x.current.ingredientName === "cooked rice");
  check('"cooked rice of choice" joins "cooked rice" with note "of choice"', choiceRice.filter((x) => /cooked rice/.test(x.current.ingredientName)).length === 1 && (riceQuestion?.question ?? "").startsWith('Keep "cooked rice" separate from "rice"?') && (riceQuestion?.question ?? "").includes('"cooked rice of choice" (#9002) -> note "of choice"'));

  console.log("\nFourth live run:");
  want("your favorite salsa -> salsa", "Salsa Chicken Wraps", "your favorite salsa", [32, "ounce", "salsa (new)", "your favorite"], false);
  want("your favorite ranch dressing -> ranch dressing", "Salsa Chicken Wraps", "your favorite ranch dressing", [1, "each", idOf("ranch dressing"), "your favorite"], false);
  check('"your favorite" without "recipe" is not a recipe reference', ["your favorite salsa", "your favorite ranch dressing"].every((n) => line("Salsa Chicken Wraps", n)?.category !== "recipe_reference"));

  // Only "garlic," and "cooked rice,", no tidy rows: each is renamed, and
  // lines link to it with no typo question and no sanity failure.
  const dirtySnap = fixture();
  const garlicRow = dirtySnap.ingredients.find((i) => i.name === "garlic")!;
  const riceRow = dirtySnap.ingredients.find((i) => i.name === "cooked rice")!;
  garlicRow.name = "garlic,";
  riceRow.name = "cooked rice,";
  const dirty = analyze(dirtySnap, new Date("2026-10-26T12:00:00Z"));
  const renames = dirty.proposals.filter((x) => x.category === "rename_ingredient");
  check('"garlic," and "cooked rice," are renamed', same(renames.map((x) => [x.rowId, x.current.ingredientName, targetText(x.proposed.target), x.ambiguous]), [
    [garlicRow.id, "garlic,", `garlic (#${garlicRow.id})`, false],
    [riceRow.id, "cooked rice,", `cooked rice (#${riceRow.id})`, false],
  ]));
  const dirtyAlfredo = dirty.proposals.find((x) => x.recipeName === "Alfredo" && x.current.ingredientName === "garlic parmesan breading" && x.table === "RecipeIngredient");
  check("garlic lines link to the renamed row", !!dirtyAlfredo && targetText(dirtyAlfredo.proposed.target) === `garlic (#${garlicRow.id})` && !dirtyAlfredo.ambiguous);
  const dirtyFresh = dirty.proposals.find((x) => x.current.ingredientName === "minced fresh garlic");
  check("fresh garlic links to the renamed row", !!dirtyFresh && targetText(dirtyFresh.proposed.target) === `garlic (#${garlicRow.id})` && !dirtyFresh.ambiguous);
  check('no "Treat garlic as garlic," question', !dirty.proposals.some((x) => x.question.includes('as "garlic,"')));
  check("no sanity failure on the dirty names", !dirty.sanityFailures.some((f) => /,$/.test(f.name)));
  const dirtyCooked = dirty.proposals.find((x) => x.category === "cooked_separate" && x.rowId === riceRow.id);
  check('cooked question shows "cooked rice"', !!dirtyCooked && targetText(dirtyCooked.proposed.target) === `cooked rice (#${riceRow.id})` && !dirtyCooked.question.includes("Proposed name looks wrong"));
  check("renamed rows are not deleted", !dirty.proposals.some((x) => x.category === "deletable_after_repoint" && [garlicRow.id, riceRow.id].includes(x.rowId)));
  check("summary counts renames", summaryMd(dirty, { mode: "self-test", isolation: "n/a", generated: "self-test" }).includes("| rename_ingredient | 2 | 0 |"));

  console.log("\nFifth live run:");
  check("ginger garlic paste with an (or ...) note is left alone", !line("Chicken Tikka Masala Recipe", "ginger garlic paste"));
  check("garlic powder with an or ... garlic note is left alone", !line("Homemade Spaghetti Sauce", "garlic powder"));
  check("no wrong_link off a garlic product", !report.proposals.some((x) => x.category === "wrong_link" && ["ginger garlic paste", "garlic powder"].includes(x.current.ingredientName)));

  // Dirty rows as the live run had them, with "garlic," as the only garlic.
  const renameSnap = fixture();
  renameSnap.ingredients.find((i) => i.name === "garlic")!.name = "garlic,";
  const unitOf = (name: string) => renameSnap.units.find((u) => u.name === name)!.id;
  const dirtyRows: [number, string, number, string, string | null][] = [
    [369, "-diced green chilies", 1, "can", null],
    [725, "- chocolate chips", 1, "cup", null],
    [726, "- nuts", 0.5, "cup", null],
    [454, "“globs” liquid lecithin", 2, "tablespoon", null],
    [805, '" of oil', 1, "each", null],
    [875, "Heaping  teaspoon baking soda", 1, "each", null],
    [878, "medium yellow onion,", 1, "each", "diced"],
    [453, "+ tsp yeast in cup lukewarm water with 1 Tbs sugar", 1.5, "tablespoon", null],
  ];
  for (const [id, name, quantity, unit, notes] of dirtyRows) {
    renameSnap.ingredients.push({ id, name });
    renameSnap.recipeLines.push({ id: 9100 + id, recipeId: riceRecipe, ingredientId: id, quantity, unitId: unitOf(unit), notes });
  }
  const renamed = analyze(renameSnap, new Date("2026-10-26T12:00:00Z"));
  const renameOf = (id: number) => renamed.proposals.find((x) => x.category === "rename_ingredient" && x.rowId === id);
  const renameCsv = proposalsCsv(renamed.proposals);
  const lineOf = (id: number) => renamed.proposals.find((x) => x.table === "RecipeIngredient" && x.rowId === 9100 + id);
  const garlicComma = renameSnap.ingredients.find((i) => i.name === "garlic,")!.id;
  for (const [id, name, notes, ambiguous] of [
    [369, "diced green chilies", "", false],
    [725, "chocolate chips", "", false],
    [726, "nuts", "", false],
    [garlicComma, "garlic", "", false],
    [454, "liquid lecithin", "globs", false],
    [805, "oil", "", true],
    [875, "baking soda", "heaping", false],
    [878, "yellow onion", "medium", false],
    [453, "yeast", "+ tsp, in cup lukewarm water, with 1 Tbs sugar", false],
  ] as [number, string, string, boolean][]) {
    const x = renameOf(id);
    const got = x ? [targetText(x.proposed.target), x.proposed.notes, x.ambiguous] : null;
    check(`rename #${id} -> ${JSON.stringify(name)}${notes ? `, note ${JSON.stringify(notes)}` : ""}`, (same(got, [`${name} (#${id})`, notes, ambiguous]) && renameCsv.includes(`,rename:${name},`)) || (console.log(`      got ${JSON.stringify(got)}`), false));
  }
  check(`'" of oil' asks which oil`, renameOf(805)?.question === `Name was '" of oil'. Which oil?`);
  check("plain renames leave their lines alone", [369, 725, 726, 805].every((id) => !lineOf(id)));
  const shownLine = (x: Proposal | undefined) => (x ? [x.proposed.quantity, x.proposed.unit, targetText(x.proposed.target), x.proposed.notes, x.ambiguous] : null);
  check('globs line gets note "globs"', same(shownLine(lineOf(454)), [2, "tablespoon", "liquid lecithin (#454)", "globs", false]));
  check("heaping line: each -> teaspoon, note heaping, asks", same(shownLine(lineOf(875)), [1, "teaspoon", "baking soda (#875)", "heaping", true]) && lineOf(875)!.question === "Amount would change from 1 each to 1 teaspoon. OK?");
  check('onion line gets note "medium, diced"', same(shownLine(lineOf(878)), [1, "each", "yellow onion (#878)", "medium, diced", false]));
  check("yeast line keeps 1.5 tablespoon, the rest in the note, no question", same(shownLine(lineOf(453)), [1.5, "tablespoon", "yeast (#453)", "+ tsp, in cup lukewarm water, with 1 Tbs sugar", false]));
  // With a "yeast" row already there, the yeast line links to it.
  const yeastSnap = fixture();
  yeastSnap.ingredients.push({ id: 452, name: "yeast" }, { id: 453, name: "+ tsp yeast in cup lukewarm water with 1 Tbs sugar" });
  yeastSnap.recipeLines.push({ id: 9453, recipeId: riceRecipe, ingredientId: 453, quantity: 1.5, unitId: yeastSnap.units.find((u) => u.name === "tablespoon")!.id, notes: null });
  const yeast = analyze(yeastSnap, new Date("2026-10-26T12:00:00Z"));
  const yeastLine = yeast.proposals.find((x) => x.table === "RecipeIngredient" && x.rowId === 9453);
  check("yeast line links to the existing yeast row", same(shownLine(yeastLine), [1.5, "tablespoon", "yeast (#452)", "+ tsp, in cup lukewarm water, with 1 Tbs sugar", false]) && yeast.proposals.some((x) => x.category === "deletable_after_repoint" && x.rowId === 453));
  check("renamed dirty rows are not deleted", !renamed.proposals.some((x) => x.category === "deletable_after_repoint" && dirtyRows.some(([id]) => id === x.rowId)));
  // With a "yellow onion" row already there, the dirty row is junk: its
  // line repoints with the note and the row goes.
  const onionSnap = fixture();
  onionSnap.ingredients.push({ id: 877, name: "yellow onion" }, { id: 878, name: "medium yellow onion," });
  onionSnap.recipeLines.push({ id: 9978, recipeId: riceRecipe, ingredientId: 878, quantity: 1, unitId: onionSnap.units.find((u) => u.name === "each")!.id, notes: null });
  const onion = analyze(onionSnap, new Date("2026-10-26T12:00:00Z"));
  const onionLine = onion.proposals.find((x) => x.table === "RecipeIngredient" && x.rowId === 9978);
  check("medium yellow onion, -> existing yellow onion, note medium", same(onionLine ? [targetText(onionLine.proposed.target), onionLine.proposed.notes, onionLine.ambiguous] : null, ["yellow onion (#877)", "medium", false]));
  check("medium yellow onion, row is deleted, not renamed", onion.proposals.some((x) => x.category === "deletable_after_repoint" && x.rowId === 878) && !onion.proposals.some((x) => x.category === "rename_ingredient" && x.rowId === 878));

  console.log("\nSanity check on proposed names:");
  for (const [name, want] of [
    ["green onions -", ["leading or trailing punctuation"]],
    ["-5 chicken breasts", ["leading or trailing punctuation"]],
    ["40 small tomatoes", ["starts with a digit"]],
    ["cheese (such as cheddar", ["unbalanced parens"]],
    ["kale or Swiss chard", ['has " or "']],
    ["lg. russet potatoes - scrubbed clean and", ['has " - "', "more than 5 words"]],
    ["can crushed tomatoes", ["starts with a unit word"]],
    ["large red", ["only descriptor or color words"]],
    ["garlic*", ["leading or trailing punctuation", 'has "$" or "*"']],
    ["boneless skinless chicken breasts", []],
    ["salt and freshly ground black pepper", []],
  ] as [string, string[]][]) {
    check(`${JSON.stringify(name)} -> ${JSON.stringify(want)}`, same(badNameReasons(name, makeUnitLookup(snap.units) as UnitLookup).filter((r) => want.includes(r) || !want.length), want));
  }
  const longName = line("Crab Cakes", "homemade Old Bay seafood seasoning blend mix*");
  check("a bad proposed name is a question", !!longName?.ambiguous && longName.question.includes("Proposed name looks wrong:"));
  check("failures are counted", report.sanityFailures.some((f) => f.proposal === longName));

  const summary = summaryMd(report, { mode: "self-test", isolation: "n/a", generated: "self-test" });
  check("summary reports sanity failures", summary.includes(`${report.sanityFailures.length} proposals (`));
  check("summary states dry run", summary.includes("Dry run: nothing was written"));
  const csvs = proposalsCsv(report.proposals) + ingredientsCsv(report.ingredients) + listsCsv(report.lists);
  check("no em dashes in output", !/\u2014/.test(summary + csvs));
  check("csv quotes commas", csvField('a, "b"') === '"a, ""b"""');

  if (out) {
    const paths = writeReport(report, resolve(out), { mode: "self-test fixture", isolation: "n/a (no database)", generated: "self-test" });
    for (const path of paths) console.log(path);
  }
  console.log(failures ? `\n${failures} check(s) failed.` : "\nAll checks passed.");
  return failures ? 1 : 0;
}

// ─── Main ───────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const outIndex = args.indexOf("--out");
  const out = outIndex >= 0 ? args[outIndex + 1] : undefined;
  if (args.includes("--self-test")) {
    process.exitCode = selfTest(out);
    return;
  }
  const csvIndex = args.indexOf("--from-csv");
  if (csvIndex >= 0) {
    const csv = resolve(args[csvIndex + 1] ?? "");
    const report = analyze(snapshotFromCsv(csv), new Date());
    for (const line of countsLine(report)) console.log(line);
    console.log("\nSanity-check failures:");
    for (const f of sanityByName(report)) console.log(`  "${f.name}" (${f.reasons.join(", ")}): ${f.rows} row(s)`);
    if (out) {
      const meta = { mode: `offline, rebuilt from ${csv}`, isolation: "n/a (no database)", generated: new Date().toISOString() };
      for (const path of writeReport(report, resolve(out), meta)) console.log(path);
    }
    return;
  }
  if (!out) {
    console.error("Usage: npx tsx scripts/cleanup-ingredients-preview.ts --out <dir> | --self-test | --from-csv <csv>");
    process.exitCode = 2;
    return;
  }
  for (const name of ["DB_HOST", "DB_NAME", "DB_USER", "DB_PASSWORD"]) {
    if (!process.env[name]) throw new Error(`${name} is not set`);
  }
  const { snapshot, isolation } = await loadSnapshot();
  const report = analyze(snapshot, new Date());
  const paths = writeReport(report, resolve(out), { mode: "live, read only", isolation, generated: new Date().toISOString() });
  for (const line of countsLine(report)) console.log(line);
  for (const path of paths) console.log(path);
}

// Only when run, not when the apply script imports this file.
if (/^cleanup-ingredients-preview(?:\.ts)?$/.test(basename(process.argv[1] ?? ""))) {
  main().catch((err: unknown) => {
    // The message only; the config holding the password is never printed.
    console.error(`Failed: ${err instanceof Error ? err.message : String(err)}`);
    process.exitCode = 1;
  });
}
