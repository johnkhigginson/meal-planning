// A one-off data fix: four recipe lines and the name of Ingredient #881.
//
// 1. "Creamy Chicken and Wild Rice Soup": the "white rice" line whose
//    note says "chicken breast" points at #73 Chicken Breast.
// 2. "White Chicken Enchiladas": the "white rice" line whose note says
//    "chicken" points at "shredded chicken" if that row exists, else #73.
// 3. "Lemon Herb Chicken": the "range start lost" line becomes 6, "6 to 8".
// 4. "Chicken Lentil Crock-Pot Soup": celery "sticks" become "stalks".
// 5. Ingredient #881 "cooked rice," is renamed "cooked rice", unless another
//    row already has that name; then the whole run refuses.
//
// Recipes are found by Recipe.name (the schema has no title column). Every
// lookup must find exactly one row or the run refuses. Library recipes with
// the same name are checked for the same problem and reported, never changed.
//
// Without flags this is a dry run: read-only intent, one transaction that is
// always rolled back. With --apply every target is read again inside one
// SERIALIZABLE transaction with UPDLOCK, HOLDLOCK, the checks run again, and
// the undo log is written and fsynced before any write. Each UPDATE names the
// row's id and its before-values and must touch exactly one row.
//
// Run from the app folder (packages and .env resolve from there too):
//   npx tsx scripts/fix-recipe-lines-20261026.ts                                              (dry run)
//   npx tsx scripts/fix-recipe-lines-20261026.ts --apply --undo-log <file> --expect-updates <n>
//   npx tsx scripts/fix-recipe-lines-20261026.ts --undo <file>

import { createRequire } from "node:module";
import { closeSync, existsSync, fsyncSync, openSync, readFileSync, renameSync, writeSync } from "node:fs";
import { basename, join, resolve } from "node:path";

// Packages resolve from this file's folder, then from the app it is run
// from (the current directory), so a copy outside the app still finds them.
function appRequire(name: string): unknown {
  try {
    return createRequire(import.meta.url)(name);
  } catch {
    return createRequire(join(process.cwd(), "package.json"))(name);
  }
}
// The app's .env, as `import "dotenv/config"` loads it.
appRequire("dotenv/config");

// ─── Fixed values ───────────────────────────────────────────────

const CHICKEN_BREAST_ID = 73;
const COOKED_RICE_ID = 881;
const COOKED_RICE_OLD = "cooked rice,";
const COOKED_RICE_NEW = "cooked rice";
// Ingredient.name and RecipeIngredient.notes are both NVarChar(200).
const NOTES_MAX = 200;

// Every table with a column that points at Ingredient (prisma/schema.prisma).
const REF_TABLES = ["RecipeIngredient", "LibraryRecipeIngredient", "GroceryListItem", "InventoryItem", "StorePrice"] as const;

// ─── Rows ───────────────────────────────────────────────────────

type Values = Record<string, string | number | null>;
interface RecipeRow { id: number; name: string }
interface IngredientRow { id: number; name: string }
// RecipeIngredient and LibraryRecipeIngredient; recipeId is libraryRecipeId
// for the library table.
interface LineRow {
  id: number;
  recipeId: number;
  ingredientId: number;
  ingredientName: string;
  quantity: number;
  unitId: number;
  unitName: string;
  notes: string | null;
  sortOrder: number;
  section: string | null;
  optional: boolean;
}

const key = (name: string) => name.trim().toLowerCase();
// "cooked rice," and "cooked rice." read as "cooked rice".
const keyNoPunct = (name: string) => key(name).replace(/[\s\p{P}]+$/u, "");
const has = (notes: string | null, part: string) => (notes ?? "").toLowerCase().includes(part.toLowerCase());

// ─── The query guards ───────────────────────────────────────────

const FORBIDDEN_WORDS =
  /\b(?:insert|update|delete|merge|exec|execute|alter|drop|create|truncate|into|grant|revoke|deny|dbcc|bulk|openrowset|openquery|opendatasource|backup|restore|shutdown|kill|declare|set|use|waitfor|begin|commit|rollback|save)\b/i;

// Throws unless the SQL is one SELECT and nothing else.
function selectOnly(sql: string): string {
  const t = sql.trim();
  if (!/^select\b/i.test(t)) throw new Error("Query guard: only SELECT is allowed");
  if (/;|--|\/\*/.test(t)) throw new Error("Query guard: semicolons and comments are not allowed");
  const hit = t.match(FORBIDDEN_WORDS);
  if (hit) throw new Error(`Query guard: "${hit[0]}" is not allowed`);
  if ((t.match(/\bselect\b/gi) ?? []).length !== 1) throw new Error("Query guard: one SELECT per query");
  return t;
}

// The only columns a write may set, per table, and their parameter types.
const WRITE_COLUMNS: Record<string, Record<string, ParamType>> = {
  RecipeIngredient: { ingredientId: "int", quantity: "float", notes: "text" },
  Ingredient: { name: "text" },
};

// Throws unless the SQL is one UPDATE of a WRITE_COLUMNS table with a WHERE.
function writeOnly(sql: string): string {
  const t = sql.trim();
  const m = t.match(/^UPDATE \[(\w+)\] SET .+ WHERE id = @id AND /);
  if (!m || !WRITE_COLUMNS[m[1]]) throw new Error("Write guard: only UPDATE of RecipeIngredient or Ingredient by id is allowed");
  if (/;|--|\/\*/.test(t)) throw new Error("Write guard: semicolons and comments are not allowed");
  if ((t.match(/\b(?:update|insert|delete|merge|exec|execute|alter|drop|create|truncate|select|begin|commit|rollback)\b/gi) ?? []).length !== 1) {
    throw new Error("Write guard: one UPDATE and nothing else");
  }
  return t;
}

// ─── Running SQL ────────────────────────────────────────────────

type ParamType = "int" | "float" | "text";
interface Param { name: string; type: ParamType; value: string | number | null }
const int = (name: string, value: number | null): Param => ({ name, type: "int", value });
const text = (name: string, value: string | null): Param => ({ name, type: "text", value });

interface Db {
  select<T>(sql: string, params?: Param[]): Promise<T[]>;
  write(sql: string, params: Param[]): Promise<number>;
}

// In an apply every target read takes update locks held to the end of the
// transaction; a dry run takes none.
const LOCK = " WITH (UPDLOCK, HOLDLOCK)";

const SQL = {
  recipes: "SELECT id, name FROM [Recipe] WHERE LOWER(LTRIM(RTRIM(name))) = @title",
  recipesLocked: `SELECT id, name FROM [Recipe]${LOCK} WHERE LOWER(LTRIM(RTRIM(name))) = @title`,
  lines: (lock: string) =>
    `SELECT ri.id, ri.recipeId, ri.ingredientId, i.name AS ingredientName, ri.quantity, ri.unitId, u.name AS unitName, ri.notes, ri.sortOrder, ri.section, ri.optional FROM [RecipeIngredient] AS ri${lock} JOIN [Ingredient] AS i ON i.id = ri.ingredientId JOIN [Unit] AS u ON u.id = ri.unitId WHERE ri.recipeId = @recipeId ORDER BY ri.sortOrder, ri.id`,
  libraryRecipes: "SELECT id, name FROM [LibraryRecipe] WHERE LOWER(LTRIM(RTRIM(name))) = @title",
  libraryLines:
    "SELECT li.id, li.libraryRecipeId AS recipeId, li.ingredientId, i.name AS ingredientName, li.quantity, li.unitId, u.name AS unitName, li.notes, li.sortOrder, li.section, li.optional FROM [LibraryRecipeIngredient] AS li JOIN [Ingredient] AS i ON i.id = li.ingredientId JOIN [Unit] AS u ON u.id = li.unitId WHERE li.libraryRecipeId = @recipeId ORDER BY li.sortOrder, li.id",
  ingredients: (lock: string) => `SELECT id, name FROM [Ingredient]${lock}`,
  refCount: (t: string) => `SELECT COUNT(*) AS n FROM [${t}] WHERE ingredientId = @id`,
  readLine: `SELECT id, ingredientId, quantity, notes FROM [RecipeIngredient]${LOCK} WHERE id = @id`,
  readIngredient: `SELECT id, name FROM [Ingredient]${LOCK} WHERE id = @id`,
};

// UPDATE that sets `after` and matches the row's id and every `before`
// value, so it touches nothing if the row has moved on.
function updateSql(table: string, before: Values, after: Values): { sql: string; params: Param[] } {
  const types = WRITE_COLUMNS[table];
  const cols = Object.keys(after);
  if (!types || !cols.length || cols.some((c) => !types[c]) || Object.keys(before).sort().join() !== [...cols].sort().join()) {
    throw new Error(`Write guard: bad columns for ${table}: ${cols.join(", ")}`);
  }
  const sql =
    `UPDATE [${table}] SET ${cols.map((c) => `[${c}] = @a_${c}`).join(", ")} WHERE id = @id AND ` +
    cols.map((c) => `([${c}] = @b_${c} OR ([${c}] IS NULL AND @b_${c} IS NULL))`).join(" AND ");
  const params = cols.flatMap((c) => [
    { name: `a_${c}`, type: types[c], value: after[c] },
    { name: `b_${c}`, type: types[c], value: before[c] },
  ]);
  return { sql, params };
}

// ─── The plan ───────────────────────────────────────────────────

interface Step {
  seq: number;
  table: "RecipeIngredient" | "Ingredient";
  id: number;
  label: string;
  before: Values;
  after: Values;
  beforeText: string;
  afterText: string;
}

interface Plan {
  steps: Step[];
  problems: string[];
  library: string[];
  info: string[];
}

interface LineTarget {
  n: number;
  title: string;
  rule: string;
  match: (l: LineRow) => boolean;
}

const LINE_TARGETS: LineTarget[] = [
  {
    n: 1,
    title: "Creamy Chicken and Wild Rice Soup",
    rule: 'ingredient "white rice", notes contain "chicken breast"',
    match: (l) => key(l.ingredientName) === "white rice" && has(l.notes, "chicken breast"),
  },
  {
    n: 2,
    title: "White Chicken Enchiladas",
    rule: 'ingredient "white rice", notes contain "chicken"',
    match: (l) => key(l.ingredientName) === "white rice" && has(l.notes, "chicken"),
  },
  {
    n: 3,
    title: "Lemon Herb Chicken",
    rule: 'notes contain "range start lost"',
    match: (l) => has(l.notes, "range start lost"),
  },
  {
    n: 4,
    title: "Chicken Lentil Crock-Pot Soup",
    rule: 'ingredient "celery", notes contain the word "sticks"',
    match: (l) => key(l.ingredientName) === "celery" && /\bsticks\b/i.test(l.notes ?? ""),
  },
];

const lineText = (recipe: RecipeRow, l: LineRow, ingredient = { id: l.ingredientId, name: l.ingredientName }, v: Values = {}) =>
  [
    `recipe #${recipe.id} "${recipe.name}"`,
    `row #${l.id}`,
    `quantity ${v.quantity ?? l.quantity}`,
    `unit #${l.unitId} ${l.unitName}`,
    `ingredient #${ingredient.id} "${ingredient.name}"`,
    `notes ${JSON.stringify("notes" in v ? v.notes : l.notes)}`,
    `sortOrder ${l.sortOrder}`,
    `section ${JSON.stringify(l.section)}`,
    `optional ${Boolean(l.optional)}`,
  ].join(" | ");

const linesText = (lines: LineRow[]) =>
  lines.length ? lines.map((l) => `      row #${l.id}: ${l.quantity} ${l.unitName} | #${l.ingredientId} "${l.ingredientName}" | notes ${JSON.stringify(l.notes)}`).join("\n") : "      (no lines)";

// Reads every target and works out the change. Problems are collected, not
// thrown, so one run shows all of them.
async function readPlan(db: Db, locked: boolean): Promise<Plan> {
  const lock = locked ? LOCK : "";
  const plan: Plan = { steps: [], problems: [], library: [], info: [] };
  const ingredients = await db.select<IngredientRow>(SQL.ingredients(lock));
  const ingById = new Map(ingredients.map((i) => [i.id, i]));

  const chicken = ingById.get(CHICKEN_BREAST_ID);
  if (!chicken) plan.problems.push(`Ingredient #${CHICKEN_BREAST_ID} does not exist.`);
  else if (key(chicken.name) !== "chicken breast") plan.problems.push(`Ingredient #${CHICKEN_BREAST_ID} is named ${JSON.stringify(chicken.name)}, expected "Chicken Breast".`);
  const shredded = ingredients.filter((i) => key(i.name) === "shredded chicken");
  if (shredded.length > 1) plan.problems.push(`More than one "shredded chicken" ingredient: ${shredded.map((i) => `#${i.id} ${JSON.stringify(i.name)}`).join(", ")}.`);

  for (const t of LINE_TARGETS) {
    const recipes = await db.select<RecipeRow>(locked ? SQL.recipesLocked : SQL.recipes, [text("title", key(t.title))]);
    if (recipes.length !== 1) {
      plan.problems.push(`Target ${t.n}: ${recipes.length} recipes named "${t.title}", expected 1${recipes.length ? `: ${recipes.map((r) => `#${r.id}`).join(", ")}` : ""}.`);
    } else {
      const recipe = recipes[0];
      const lines = await db.select<LineRow>(SQL.lines(lock), [int("recipeId", recipe.id)]);
      const hits = lines.filter(t.match);
      if (hits.length !== 1) {
        plan.problems.push(`Target ${t.n}: ${hits.length} lines in recipe #${recipe.id} "${recipe.name}" match (${t.rule}), expected 1. Lines in the recipe:\n${linesText(lines)}`);
      } else {
        const l = hits[0];
        let to = { id: l.ingredientId, name: l.ingredientName };
        const after: Values = {};
        const problem = (msg: string) => plan.problems.push(`Target ${t.n}: ${msg} Row: ${lineText(recipe, l)}`);
        if (t.n === 1) {
          if (chicken) to = chicken;
          after.ingredientId = CHICKEN_BREAST_ID;
          after.notes = "cooked, boneless chicken breast halves, shredded";
        } else if (t.n === 2) {
          if (shredded.length === 1) {
            to = shredded[0];
            after.ingredientId = shredded[0].id;
            after.notes = "cooked";
          } else {
            if (chicken) to = chicken;
            after.ingredientId = CHICKEN_BREAST_ID;
            after.notes = "cooked, shredded";
          }
        } else if (t.n === 3) {
          if (l.quantity !== 8) problem(`quantity is ${l.quantity}, expected 8.`);
          if (key(l.ingredientName) !== "chicken breast") problem(`ingredient is ${JSON.stringify(l.ingredientName)}, expected "Chicken Breast".`);
          after.quantity = 6;
          after.notes = "6 to 8, skinned";
        } else {
          after.notes = (l.notes ?? "").replace(/\bsticks\b/gi, (w) => (w[0] === "S" ? "Stalks" : "stalks"));
        }
        // Only the columns that change.
        const current: Values = { ingredientId: l.ingredientId, quantity: l.quantity, notes: l.notes };
        for (const c of Object.keys(after)) if (after[c] === current[c]) delete after[c];
        const before: Values = Object.fromEntries(Object.keys(after).map((c) => [c, current[c]]));
        if (typeof after.notes === "string" && after.notes.length > NOTES_MAX) problem(`new notes are ${after.notes.length} characters; the column holds ${NOTES_MAX}.`);
        if (Object.keys(after).length) {
          plan.steps.push({
            seq: plan.steps.length + 1,
            table: "RecipeIngredient",
            id: l.id,
            label: `Target ${t.n}: "${recipe.name}"`,
            before,
            after,
            beforeText: lineText(recipe, l),
            afterText: lineText(recipe, l, to, after),
          });
        } else plan.info.push(`Target ${t.n}: row #${l.id} already holds the new values.`);
      }
    }

    // Library recipes: report only.
    for (const lr of await db.select<RecipeRow>(SQL.libraryRecipes, [text("title", key(t.title))])) {
      const hits = (await db.select<LineRow>(SQL.libraryLines, [int("recipeId", lr.id)])).filter(t.match);
      for (const l of hits) plan.library.push(`Target ${t.n}: LibraryRecipeIngredient ${lineText(lr, l).replace(/^recipe/, "library recipe")}`);
    }
  }

  // Ingredient #881.
  const rice = ingById.get(COOKED_RICE_ID);
  if (!rice) plan.problems.push(`Target 5: Ingredient #${COOKED_RICE_ID} does not exist.`);
  else if (rice.name !== COOKED_RICE_OLD) plan.problems.push(`Target 5: Ingredient #${COOKED_RICE_ID} is named ${JSON.stringify(rice.name)}, expected ${JSON.stringify(COOKED_RICE_OLD)}.`);
  else {
    const refs: string[] = [];
    for (const t of REF_TABLES) {
      const [{ n }] = await db.select<{ n: number }>(SQL.refCount(t), [int("id", COOKED_RICE_ID)]);
      refs.push(`${t} ${n}`);
    }
    plan.info.push(`Target 5: rows that reference #${COOKED_RICE_ID}: ${refs.join(", ")}.`);
    const dups = ingredients.filter((i) => i.id !== COOKED_RICE_ID && (key(i.name) === COOKED_RICE_NEW || keyNoPunct(i.name) === COOKED_RICE_NEW));
    if (dups.length) {
      plan.problems.push(
        `Target 5: "${COOKED_RICE_NEW}" already exists as ${dups.map((i) => `#${i.id} ${JSON.stringify(i.name)}`).join(", ")}. ` +
          `Not renaming, repointing or deleting #${COOKED_RICE_ID}. References to #${COOKED_RICE_ID}: ${refs.join(", ")}.`
      );
    } else {
      plan.steps.push({
        seq: plan.steps.length + 1,
        table: "Ingredient",
        id: COOKED_RICE_ID,
        label: "Target 5: rename Ingredient",
        before: { name: rice.name },
        after: { name: COOKED_RICE_NEW },
        beforeText: `ingredient #${COOKED_RICE_ID} name ${JSON.stringify(rice.name)}`,
        afterText: `ingredient #${COOKED_RICE_ID} name ${JSON.stringify(COOKED_RICE_NEW)}`,
      });
    }
  }
  return plan;
}

function printPlan(plan: Plan) {
  for (const s of plan.steps) {
    console.log(`\n${s.seq}. ${s.label}`);
    console.log(`   before: ${s.beforeText}`);
    console.log(`   after:  ${s.afterText}`);
  }
  for (const line of plan.info) console.log(`\n${line}`);
  console.log("\nLibrary recipes with the same problem (report only, never changed):");
  console.log(plan.library.length ? plan.library.map((l) => `  ${l}`).join("\n") : "  none");
  if (plan.problems.length) {
    console.log("\nProblems:");
    for (const p of plan.problems) console.log(`  ${p}`);
  }
  console.log(`\n${plan.steps.length} updates planned`);
}

// ─── The undo log ───────────────────────────────────────────────

interface UndoEntry { seq: number; table: Step["table"]; id: number; label: string; before: Values; after: Values }

interface UndoLog {
  version: 1;
  script: string;
  status: "pending" | "committed" | "rolled_back" | "undone";
  created: string;
  updated: string;
  entries: UndoEntry[];
  error?: string;
  undoError?: string;
}

// Written whole to a temp file, fsynced, then renamed over the log. The
// first write uses "wx" so an existing log is never overwritten.
function writeLog(path: string, log: UndoLog, create = false) {
  log.updated = new Date().toISOString();
  const body = JSON.stringify(log, null, 2);
  if (create) {
    const fd = openSync(path, "wx");
    try {
      writeSync(fd, body);
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
    return;
  }
  const tmp = `${path}.tmp`;
  const fd = openSync(tmp, "w");
  try {
    writeSync(fd, body);
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  renameSync(tmp, path);
}

class Refusal extends Error {}

const sameValue = (a: unknown, b: unknown) => (a ?? null) === (b ?? null);
function assertRow(what: string, row: Values | undefined, want: Values) {
  if (!row) throw new Refusal(`${what}: row is gone`);
  for (const [k, v] of Object.entries(want)) {
    if (!sameValue(row[k], v)) throw new Refusal(`${what}: ${k} is ${JSON.stringify(row[k])}, expected ${JSON.stringify(v)}`);
  }
}
function assertOne(what: string, n: number) {
  if (n !== 1) throw new Refusal(`${what}: ${n} rows affected, expected 1`);
}

const readRow = async (db: Db, table: Step["table"], id: number) =>
  (await db.select<Values>(table === "Ingredient" ? SQL.readIngredient : SQL.readLine, [int("id", id)]))[0];

// Sets `to` on a row that must hold `from`, then reads it back.
async function change(db: Db, what: string, table: Step["table"], id: number, from: Values, to: Values) {
  assertRow(what, await readRow(db, table, id), from);
  const { sql, params } = updateSql(table, from, to);
  assertOne(what, await db.write(sql, [int("id", id), ...params]));
  assertRow(`${what} (read back)`, await readRow(db, table, id), to);
}

// ─── The database ───────────────────────────────────────────────

// The parts of the mssql package this script uses. It ships no types.
interface SqlRequest {
  input(name: string, type: unknown, value: unknown): SqlRequest;
  query<T>(command: string): Promise<{ recordset: T[]; rowsAffected: number[] }>;
}
interface SqlPool { connect(): Promise<SqlPool>; close(): Promise<void> }
interface SqlTransaction { begin(isolationLevel?: number): Promise<SqlTransaction>; commit(): Promise<void>; rollback(): Promise<void> }
interface MssqlModule {
  ConnectionPool: new (config: object) => SqlPool;
  Transaction: new (pool: SqlPool) => SqlTransaction;
  Request: new (parent: SqlPool | SqlTransaction) => SqlRequest;
  ISOLATION_LEVEL: { READ_COMMITTED: number; SNAPSHOT: number; SERIALIZABLE: number };
  Int: unknown;
  Float: unknown;
  NVarChar: (length: number) => unknown;
}

// Same settings as src/lib/prisma.ts, plus read-only intent on a dry run.
function connectionConfig(readOnlyIntent: boolean): object {
  return {
    server: process.env.DB_HOST!,
    port: parseInt(process.env.DB_PORT || "1433", 10),
    database: process.env.DB_NAME!,
    user: process.env.DB_USER!,
    password: process.env.DB_PASSWORD!,
    options: { encrypt: true, trustServerCertificate: true, ...(readOnlyIntent ? { readOnlyIntent: true } : {}) },
  };
}

function mssqlDb(mssql: MssqlModule, parent: SqlPool | SqlTransaction, readOnly: boolean): Db {
  const request = (params: Param[]) => {
    const r = new mssql.Request(parent);
    for (const p of params) r.input(p.name, p.type === "int" ? mssql.Int : p.type === "float" ? mssql.Float : mssql.NVarChar(NOTES_MAX), p.value);
    return r;
  };
  return {
    select: async <T,>(sql: string, params: Param[] = []) => (await request(params).query<T>(selectOnly(sql))).recordset,
    write: async (sql: string, params: Param[]) => {
      if (readOnly) throw new Error("Write guard: this is a dry run");
      return (await request(params).query(writeOnly(sql))).rowsAffected.reduce((a, b) => a + b, 0);
    },
  };
}

// Opens the database and runs fn in one transaction. A dry run asks for
// read-only intent, reads at SNAPSHOT (or READ COMMITTED) and always rolls
// back; a write run is SERIALIZABLE and commits only if fn returns true.
async function withTransaction<T>(write: boolean, fn: (db: Db, isolation: string) => Promise<{ commit: boolean; value: T }>): Promise<T> {
  for (const name of ["DB_HOST", "DB_NAME", "DB_USER", "DB_PASSWORD"]) {
    if (!process.env[name]) throw new Error(`${name} is not set`);
  }
  // Host and database name only; nothing else from the config is printed.
  console.log(`Database: ${process.env.DB_NAME} on ${process.env.DB_HOST}`);
  const mssql = appRequire("mssql") as MssqlModule;
  const pool = new mssql.ConnectionPool(connectionConfig(!write));
  await pool.connect();
  let tx: SqlTransaction | null = null;
  let done = false;
  try {
    let level = mssql.ISOLATION_LEVEL.SERIALIZABLE;
    let isolation = "SERIALIZABLE";
    if (!write) {
      const [state] = await mssqlDb(mssql, pool, true).select<{ snapshot: number }>(
        "SELECT snapshot_isolation_state AS snapshot FROM sys.databases WHERE name = DB_NAME()"
      );
      const snapshotOn = state?.snapshot === 1;
      level = snapshotOn ? mssql.ISOLATION_LEVEL.SNAPSHOT : mssql.ISOLATION_LEVEL.READ_COMMITTED;
      isolation = snapshotOn ? "SNAPSHOT" : "READ COMMITTED";
    }
    tx = new mssql.Transaction(pool);
    await tx.begin(level);
    console.log(`Isolation: ${isolation}`);
    const result = await fn(mssqlDb(mssql, tx, !write), isolation);
    if (write && result.commit) {
      await tx.commit();
      done = true;
    }
    return result.value;
  } finally {
    if (tx && !done) await tx.rollback().catch(() => undefined);
    await pool.close();
  }
}

// ─── Main ───────────────────────────────────────────────────────

const SCRIPT = "scripts/fix-recipe-lines-20261026.ts";
const USAGE = [
  "Usage:",
  `  npx tsx ${SCRIPT}                                                        dry run`,
  `  npx tsx ${SCRIPT} --apply --undo-log <file> --expect-updates <n>`,
  `  npx tsx ${SCRIPT} --undo <file>`,
].join("\n");

type Mode = { mode: "dry" } | { mode: "apply"; logPath: string; expect: number } | { mode: "undo"; path: string };

function parseArgs(args: string[]): Mode | null {
  if (!args.length) return { mode: "dry" };
  if (args[0] === "--undo") return args.length === 2 && !args[1].startsWith("--") ? { mode: "undo", path: resolve(args[1]) } : null;
  const seen = new Map<string, string>();
  for (let i = 0; i < args.length; i++) {
    const flag = args[i];
    if (seen.has(flag)) return null;
    if (flag === "--apply") seen.set(flag, "");
    else if (flag === "--undo-log" || flag === "--expect-updates") {
      const v = args[++i];
      if (v === undefined || v.startsWith("--")) return null;
      seen.set(flag, v);
    } else return null;
  }
  const logArg = seen.get("--undo-log");
  const expect = seen.get("--expect-updates");
  if (!seen.has("--apply") || !logArg || !expect || !/^\d+$/.test(expect)) return null;
  return { mode: "apply", logPath: resolve(logArg), expect: Number(expect) };
}

async function main() {
  const mode = parseArgs(process.argv.slice(2));
  if (!mode) {
    console.error(USAGE);
    process.exitCode = 2;
    return;
  }

  if (mode.mode === "dry") {
    console.log("Mode: dry run, read only");
    const plan = await withTransaction(false, async (db) => ({ commit: false, value: await readPlan(db, false) }));
    printPlan(plan);
    if (plan.problems.length) throw new Refusal(`${plan.problems.length} problem(s) found; an apply would refuse.`);
    return;
  }

  if (mode.mode === "undo") {
    console.log("Mode: undo");
    const log = JSON.parse(readFileSync(mode.path, "utf8")) as UndoLog;
    if (log.status !== "committed") throw new Refusal(`Undo log status is "${log.status}", not "committed"`);
    try {
      await withTransaction(true, async (db) => {
        for (const e of [...log.entries].sort((a, b) => b.seq - a.seq)) {
          await change(db, `undo step ${e.seq} (${e.table} #${e.id})`, e.table, e.id, e.after, e.before);
          console.log(`Reverted step ${e.seq}: ${e.table} #${e.id} ${JSON.stringify(e.after)} -> ${JSON.stringify(e.before)}`);
        }
        return { commit: true, value: undefined };
      });
    } catch (err) {
      // Nothing was changed, so the log stays "committed" and the undo can
      // be run again.
      log.undoError = err instanceof Error ? err.message : String(err);
      writeLog(mode.path, log);
      throw err;
    }
    log.status = "undone";
    delete log.undoError;
    writeLog(mode.path, log);
    console.log(`Undone: ${log.entries.length} entries reverted. Log marked "undone".`);
    return;
  }

  console.log("Mode: apply");
  const { logPath, expect } = mode;
  if (existsSync(logPath)) throw new Refusal(`Undo log ${logPath} already exists; choose a new path`);
  // Set inside the transaction; read by the catch below.
  const run: { log: UndoLog | null; committed: boolean } = { log: null, committed: false };
  try {
    await withTransaction(true, async (db) => {
      const plan = await readPlan(db, true);
      printPlan(plan);
      if (plan.problems.length) throw new Refusal(`${plan.problems.length} problem(s) found; nothing changed.`);
      if (plan.steps.length !== expect) throw new Refusal(`${plan.steps.length} updates planned, --expect-updates is ${expect}; nothing changed.`);
      const now = new Date().toISOString();
      const log: UndoLog = {
        version: 1, script: SCRIPT, status: "pending", created: now, updated: now,
        entries: plan.steps.map((s) => ({ seq: s.seq, table: s.table, id: s.id, label: s.label, before: s.before, after: s.after })),
      };
      // On disk and fsynced before the first write.
      writeLog(logPath, log, true);
      run.log = log;
      for (const s of plan.steps) await change(db, `step ${s.seq} (${s.table} #${s.id})`, s.table, s.id, s.before, s.after);
      return { commit: true, value: undefined };
    });
    run.committed = true;
    const log = run.log!;
    log.status = "committed";
    writeLog(logPath, log);
    console.log(`\nCommitted: ${log.entries.length} updates.`);
    console.log(`Undo log: ${logPath}`);
  } catch (err) {
    if (run.committed) {
      console.error(`The transaction COMMITTED, but marking the undo log failed. Set "status" to "committed" in ${logPath} before any undo.`);
    } else if (run.log) {
      run.log.status = "rolled_back";
      run.log.error = err instanceof Error ? err.message : String(err);
      writeLog(logPath, run.log);
      console.error(`Rolled back. Undo log marked "rolled_back": ${logPath}`);
    }
    throw err;
  }
}

if (/^fix-recipe-lines-20261026(?:\.ts)?$/.test(basename(process.argv[1] ?? ""))) {
  main().catch((err: unknown) => {
    // The message only; the config holding the password is never printed.
    console.error(`${err instanceof Refusal ? "Refused" : "Failed"}: ${err instanceof Error ? err.message : String(err)}`);
    process.exitCode = 1;
  });
}
