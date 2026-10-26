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

import "dotenv/config";
import { createRequire } from "node:module";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import {
  cleanIngredientName,
  ingredientKey,
  makeUnitLookup,
  parseIngredientText,
  pickIngredientMatch,
  splitNameAndNote,
} from "../src/lib/ingredient-format";

// ─── Rows as loaded ─────────────────────────────────────────────

interface UnitRow { id: number; name: string; abbreviation: string; unitType: string }
interface IngredientRow { id: number; name: string }
interface RecipeRow { id: number; householdId: number; name: string }
interface LibraryRecipeRow { id: number; name: string }
// RecipeIngredient and LibraryRecipeIngredient; recipeId is libraryRecipeId
// for the library table.
interface LineRow { id: number; recipeId: number; ingredientId: number; quantity: number; unitId: number; notes: string | null }
interface GroceryListRow { id: number; householdId: number; mealPlanId: number | null; name: string }
interface GroceryItemRow { id: number; groceryListId: number; ingredientId: number; quantity: number; unitId: number }
interface InventoryRow { id: number; householdId: number; ingredientId: number; quantity: number; unitId: number }
interface StorePriceRow { id: number; storeId: number; ingredientId: number; quantity: number; unitId: number }
interface MealPlanRow { id: number; householdId: number; weekStartDate: Date }
interface MealPlanEntryRow { mealPlanId: number; recipeId: number | null }

interface Snapshot {
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
const QUERIES = {
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

async function loadSnapshot(): Promise<LoadResult> {
  const mssql = createRequire(import.meta.url)("mssql") as MssqlModule;
  // Same settings as src/lib/prisma.ts, plus read-only intent.
  const pool = new mssql.ConnectionPool({
    server: process.env.DB_HOST!,
    port: parseInt(process.env.DB_PORT || "1433", 10),
    database: process.env.DB_NAME!,
    user: process.env.DB_USER!,
    password: process.env.DB_PASSWORD!,
    options: { encrypt: true, trustServerCertificate: true, readOnlyIntent: true },
  });
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

    const snapshot: Snapshot = {
      units: await read(t, QUERIES.units),
      ingredients: await read(t, QUERIES.ingredients),
      recipes: await read(t, QUERIES.recipes),
      recipeLines: await read(t, QUERIES.recipeLines),
      libraryRecipes: await read(t, QUERIES.libraryRecipes),
      libraryLines: await read(t, QUERIES.libraryLines),
      groceryLists: await read(t, QUERIES.groceryLists),
      groceryItems: await read(t, QUERIES.groceryItems),
      inventory: await read(t, QUERIES.inventory),
      storePrices: await read(t, QUERIES.storePrices),
      mealPlans: await read(t, QUERIES.mealPlans),
      mealPlanEntries: await read(t, QUERIES.mealPlanEntries),
    };
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
const COOKED_LEAD = /^cooked\s+(.+)$/i;
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

type UnitLookup = (word: string) => UnitRow | null;

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
  // "and" doesn't count, so "salt and freshly ground black pepper" passes.
  if (t.split(/\s+/).filter((w) => w.toLowerCase() !== "and").length > 5) reasons.push("more than 5 words");
  const list = t.split(/[\s,]+/).map(bare).filter((w) => w && w !== "and" && w !== "or");
  if (list.length && list.every((w) => NAME_ONLY_DESCRIPTORS.has(w))) reasons.push("only descriptor or color words");
  if (/[$*]/.test(t)) reasons.push('has "$" or "*"');
  return reasons;
}

// The filter the first count used, as LIKE patterns: '(%', '%(s)%', '%*%',
// '%$%', '%()%'. Kept so the two counts can be compared.
function matchesLikeFilter(name: string): boolean {
  return name.startsWith("(") || /\(s\)/i.test(name) || /[*$]/.test(name) || name.includes("()");
}

// ─── Proposals ──────────────────────────────────────────────────

type Category =
  | "wrong_link"
  | "cooked_separate"
  | "lost_noun"
  | "prep_in_name"
  | "garbled_name_note"
  | "junk_ingredient_repoint"
  | "deletable_after_repoint";
type Confidence = "high" | "medium" | "low";

const CATEGORIES: Category[] = [
  "wrong_link", "cooked_separate", "lost_noun", "prep_in_name", "garbled_name_note", "junk_ingredient_repoint", "deletable_after_repoint",
];

// An existing Ingredient id, or a name to create. "delete" for category F.
type Target = { id: number; name: string } | { create: string } | { delete: true };

interface Proposal {
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

function targetText(target: Target): string {
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

interface Report {
  proposals: Proposal[];
  // Proposals whose proposed name failed badNameReasons.
  sanityFailures: SanityFailure[];
  ingredients: IngredientReport[];
  lists: ListReport[];
  unreferencedClean: number;
  likeFilterCount: number;
  detectorCount: number;
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
  const flagged = (id: number) => {
    const p = problems.get(id);
    return !!p && (p.junk.length > 0 || p.prep !== "" || p.layout.length > 0);
  };

  // Rows a name can point at: clean rows only, found the way the importer
  // finds them (same name in any case, or singular/plural).
  const byKey = new Map<string, IngredientRow[]>();
  for (const row of snap.ingredients) {
    if (flagged(row.id)) continue;
    const key = ingredientKey(row.name);
    byKey.set(key, [...(byKey.get(key) ?? []), row]);
  }
  const findExisting = (name: string) => pickIngredientMatch(name, byKey.get(ingredientKey(name)) ?? []);
  // One spelling per new name, so "onion" and "onions" create one row.
  const createNames = new Map<string, string>();
  const targetFor = (name: string): Target => {
    const row = findExisting(name);
    if (row) return { id: row.id, name: row.name };
    const key = ingredientKey(name);
    if (!createNames.has(key)) createNames.set(key, name);
    return { create: createNames.get(key)! };
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
    if (nameWords.length < 2) return null;
    const notes = line.row.notes ?? "";

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
      if (noun && meaningful.length) {
        pick = fits.find((s) => findExisting(s)) ?? noun;
        why = `unit "${unit.name}" fits "${pick}", not "${ing.name}"`;
      }
    }
    if (!pick && FRESH_PREP.test(notes)) {
      const fit = shorter.find((s) => findExisting(s) && extraWords(s).some((w) => PRODUCT_WORDS.has(w)));
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
        proposed: { ...current, target, notes: current.notes },
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

    // A unit at the front of the name: use it, or drop it when it repeats
    // the saved unit. A different unit means the amount was misread.
    const lead = leadingUnit(name, lookup);
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
    const parsed = parseIngredientText(lineText(quantity, unit, name, notes), lookup);
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

    const target = ingredientKey(parsedName) === ingredientKey(ing.name) ? { id: ing.id, name: ing.name } : targetFor(parsedName);
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

  for (const line of lines) {
    const proposal = flagged(line.row.ingredientId) ? reparse(line) : (wrongLink(line) ?? reparse(line));
    if (proposal) proposals.push(proposal);
  }

  // ── A2. Cooked X: its own ingredient, one question per name ──
  const cookedAsked = new Set<string>();
  for (const line of lines) {
    const ing = ingById.get(line.row.ingredientId);
    const cooked = ing?.name.trim().match(COOKED_LEAD);
    if (!ing || !cooked || flagged(ing.id) || cookedAsked.has(ingredientKey(ing.name))) continue;
    cookedAsked.add(ingredientKey(ing.name));
    const plain = findExisting(cooked[1]);
    const uses = linesByIngredient.get(ing.id)?.length ?? 0;
    proposals.push({
      category: "cooked_separate",
      confidence: "low",
      table: "Ingredient",
      rowId: ing.id,
      recipeId: null,
      recipeName: "",
      current: { quantity: null, unit: "", ingredientId: ing.id, ingredientName: ing.name, notes: "" },
      proposed: { quantity: null, unit: "", target: { id: ing.id, name: ing.name }, notes: "" },
      reason: `${uses} recipe line(s) use "${ing.name}". Cooked is its own ingredient, so no line is repointed.${plain ? ` "${plain.name}" (#${plain.id}) also exists.` : ""}`,
      ambiguous: true,
      question: `Keep "${ing.name}" separate from "${cooked[1]}"?`,
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
    if (!name || name === "?") return;
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
    const target = ranked[0]?.target ?? null;
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
  };
}

// ─── Writing the report ─────────────────────────────────────────

// RFC 4180: a field with a comma, quote or line break is quoted, and quotes
// inside it are doubled.
function csvField(value: unknown): string {
  const text = value === null || value === undefined ? "" : String(value);
  return /[",\r\n]|^\s|\s$/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function toCsv(header: string[], rows: unknown[][]): string {
  return [header, ...rows].map((row) => row.map(csvField).join(",")).join("\r\n") + "\r\n";
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
      targetLabel(x.proposed.target), x.proposed.notes, x.reason, x.ambiguous ? "yes" : "no", x.question,
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

function describe(x: Proposal, side: "current" | "proposed"): string {
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

function snapshotFromCsv(path: string): Snapshot {
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

function fixture(): Snapshot {
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
  for (const name of ["garlic", "large eggs", "butter", "baking powder", "Chicken Breast", "rice", "white rice"]) ingredientId(name);

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

  console.log("\nCooked X:");
  const cookedNames = ["cooked rice", "Cooked white rice", "cooked chicken breasts"];
  check("no wrong_link for cooked X", !report.proposals.some((x) => x.category === "wrong_link" && cookedNames.includes(x.current.ingredientName)));
  check("no line repointed off cooked X", !report.proposals.some((x) => x.table === "RecipeIngredient" && cookedNames.includes(x.current.ingredientName)));
  const cookedQuestions = report.proposals.filter((x) => x.category === "cooked_separate");
  check("one question per cooked name", same(cookedQuestions.map((x) => x.current.ingredientName).sort(), [...cookedNames].sort()));
  check('asks "Keep \'cooked rice\' separate from \'rice\'?"', cookedQuestions.some((x) => x.question === 'Keep "cooked rice" separate from "rice"?' && x.ambiguous));
  check("cooked questions keep the link", cookedQuestions.every((x) => "id" in x.proposed.target && x.proposed.target.id === x.current.ingredientId));

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
  const zucchini = line("Zucchini Bake", "(1/4-inch-thick) slices small zucchini");
  check("a bad proposed name is a question", !!zucchini?.ambiguous && zucchini.question.includes("Proposed name looks wrong:"));
  check("failures are counted", report.sanityFailures.some((f) => f.proposal === zucchini));

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

main().catch((err: unknown) => {
  // The message only; the config holding the password is never printed.
  console.error(`Failed: ${err instanceof Error ? err.message : String(err)}`);
  process.exitCode = 1;
});
