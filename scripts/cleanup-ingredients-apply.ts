// Applies the approved parts of the ingredient cleanup preview.
//
// The plan is computed fresh from the database with the preview's own
// analysis (scripts/cleanup-ingredients-preview.ts), then filtered by the
// owner's decisions (see "Decisions" below). Only Ingredient,
// RecipeIngredient and LibraryRecipeIngredient rows can change. Grocery list,
// inventory, store price and meal plan rows are never written.
//
// Without --apply this is a dry run with the preview's guarantees: every
// query goes through selectOnly(), the connection asks for read-only intent,
// and the one transaction is always rolled back.
//
// With --apply the plan is read and applied in one SERIALIZABLE transaction.
// Before each step the row is read again and must still hold the plan's
// before-values; each write must touch exactly one row; the totals must match
// the plan. Any mismatch or error rolls everything back. The undo log is
// written and fsynced before the commit.
//
// Run:
//   npx tsx scripts/cleanup-ingredients-apply.ts --out <dir>                  (dry run)
//   npx tsx scripts/cleanup-ingredients-apply.ts --out <dir> --apply --undo-log <file> [--expect-counts U,I,D]
//   npx tsx scripts/cleanup-ingredients-apply.ts --undo <undo-log>
//   npx tsx scripts/cleanup-ingredients-apply.ts --self-test                  (no database)
//   npx tsx scripts/cleanup-ingredients-apply.ts --from-csv <proposed-changes.csv> --out <dir>   (no database)

import { closeSync, existsSync, fsyncSync, mkdirSync, mkdtempSync, openSync, readFileSync, renameSync, writeFileSync, writeSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import {
  COOKED_LEAD,
  QUERIES,
  RESPELL_ROWS,
  analyze,
  appRequire,
  connectionConfig,
  cookedTidy,
  fixture,
  readSnapshot,
  selectOnly,
  snapshotFromCsv,
  tidyName,
  toCsv,
  type IngredientRow,
  type LineRow,
  type Proposal,
  type Report,
  type Snapshot,
  type Target,
  type UnitLookup,
  type UnitRow,
} from "./cleanup-ingredients-preview";
// Importing the preview loads the app's .env, the same way the preview does.
import { formatQuantity, ingredientKey, makeUnitLookup, readQuantity, tidyIngredientNote } from "../src/lib/ingredient-format";

// ─── Tables ─────────────────────────────────────────────────────

// The only tables a write may name.
const WRITE_TABLES = ["Ingredient", "RecipeIngredient", "LibraryRecipeIngredient"] as const;
type WriteTable = (typeof WRITE_TABLES)[number];
type LineTable = "RecipeIngredient" | "LibraryRecipeIngredient";

// Every table with a column that points at Ingredient (prisma/schema.prisma).
// Unit.defaultForIngredients is Ingredient.defaultUnitId, which points the
// other way, and MealPlan and MealPlanEntry have no ingredient column. The
// database is asked too, and any other table it names is counted as well.
const REF_COLUMNS: { table: string; column: string }[] = [
  { table: "RecipeIngredient", column: "ingredientId" },
  { table: "LibraryRecipeIngredient", column: "ingredientId" },
  { table: "GroceryListItem", column: "ingredientId" },
  { table: "InventoryItem", column: "ingredientId" },
  { table: "StorePrice", column: "ingredientId" },
];
type RefCounts = Record<string, number>;

// ─── Questions ──────────────────────────────────────────────────
//
// A proposal's question is one or more sentences the preview wrote. Each is
// read back into a kind, and the proposal is applied only when every kind
// has an approval rule.

type Kind =
  | "amount_change" | "lost_range_start" | "mixed_number" | "parser_doubt" | "spelling" | "stick_butter"
  | "unit_from_name" | "unit_from_read" | "amount_from_name" | "container_amount" | "boneless_order"
  | "two_amounts" | "lost_amount" | "several_items" | "bad_name" | "create_missing" | "source_check"
  | "flip_name" | "looks_wrong" | "no_noun" | "unreadable" | "recipe_reference" | "row_open"
  | "unit_follow" | "merge_clash" | "grocery_mix" | "delete_pending" | "unknown";

const QUESTION_PATTERNS: [Kind, RegExp][] = [
  ["amount_change", /^Amount would change from ([\d.]+) (.+?) to ([\d.]+) (.+?)\. OK\?/],
  ["lost_range_start", /^"([^"]+)" before the name looks like the end of a range whose start was lost\. Kept ([\d.]+) (.+?)\. Check the source recipe\./],
  ["mixed_number", /^Read "([^"]+)" as (\d+ \d+\/\d+) ([^?]+)\? Kept ([\d.]+) (.+?)\. Check the source recipe\./],
  ["parser_doubt", /^([^?]*\?) Kept ([\d.]+) (.+?)\. Check the source recipe\./],
  ["spelling", /^Treat "([^"]+)" as "([^"]+)"\?/],
  ["stick_butter", /^Saved as ([\d.]+) ([^,]+), but the name says "([^"]+)" and ([\d.]+) stick = ([\d.]+) cup\. Use [\d.]+ cup\?/],
  ["unit_from_name", /^Saved as ([\d.]+) ([^,]+), but the name starts with "([^"]+)"\. Which unit is right, and what amount\?/],
  ["unit_from_read", /^Saved as ([\d.]+) ([^,]+), but the name says "([^"]+)"\. Which unit is right\?/],
  ["amount_from_name", /^Saved as ([\d.]+) ([^,]+), but the name says "([^"]+)"\. Which amount is right\?/],
  ["container_amount", /^Saved as ([\d.]+) ([^,]+), but the name says a (.+?) container\. Which amount is right\?/],
  ["boneless_order", /^Saved name ends in "([^"]+)"; a fresh import reads it as "([^"]+)"\. OK\?/],
  ["two_amounts", /^"(.+?)" holds two amounts\. Keep ([\d.]+) (\S+) and note "([^"]+)"\?/],
  ["lost_amount", /^Name was '(.*?)'\. Which (.+?)\?/],
  ["several_items", /^"(.+?)" lists several items\. Split it into one line each, or which ingredient is it\?/],
  ["bad_name", /^Proposed name looks wrong: "(.*?)" \((.*?)\)\./],
  ["create_missing", /^No "([^"]+)" row exists\. Create it for this line\?/],
  ["source_check", /^Did this line say "(.*?)" rather than "(.*?)"\? Check the source recipe\./],
  ["flip_name", /^A fresh import names this "(.*?)"\. Use "(.*?)" instead\?/],
  ["looks_wrong", /^A fresh import names this "(.*?)", which still looks wrong\. What should it be\?/],
  ["no_noun", /^What is the ingredient for "(.*?)" in this recipe\?/],
  ["unreadable", /^What should this line be\?/],
  ["recipe_reference", /^This line points to another recipe\. Keep it as written\?/],
  ["row_open", /^Row "(.*?)" has more than one likely target or an open question\. Confirm (.*?)\./],
  ["unit_follow", /^Recipe lines for "(.*?)" change unit\. Change this (.+?) too\?/],
  ["merge_clash", /^(.*?) already has (.*?)\. Merge the two\?/],
  ["grocery_mix", /^The quantity may mix "(.*?)" from other recipes\. Repoint, split, or regenerate the list\?/],
  ["delete_pending", /^Only deletable if the open questions on its repoints are approved\./],
];

interface QuestionPart { kind: Kind; text: string; m: RegExpMatchArray }

export function questionParts(question: string): QuestionPart[] {
  const parts: QuestionPart[] = [];
  let rest = question.trim();
  while (rest) {
    let hit: QuestionPart | null = null;
    for (const [kind, re] of QUESTION_PATTERNS) {
      const m = rest.match(re);
      if (m) {
        hit = { kind, text: m[0], m };
        break;
      }
    }
    if (!hit) {
      parts.push({ kind: "unknown", text: rest, m: [rest] as unknown as RegExpMatchArray });
      break;
    }
    parts.push(hit);
    rest = rest.slice(hit.text.length).trim();
  }
  return parts;
}

// The question kinds the owner approved. "Saved name ends in ..." only for
// "chicken boneless" -> "boneless chicken".
function approves(part: QuestionPart): boolean {
  switch (part.kind) {
    case "amount_change":
    case "lost_range_start":
    case "mixed_number":
    case "spelling":
    case "stick_butter":
    case "unit_from_name":
    case "unit_from_read":
    case "amount_from_name":
    case "container_amount":
    case "two_amounts":
      return true;
    case "boneless_order":
      return part.m[1].toLowerCase() === "boneless";
    default:
      return false;
  }
}

// Why a question kind is skipped, for skipped.csv.
const SKIP_REASONS: Partial<Record<Kind, [string, string]>> = {
  lost_amount: ["skip:messy_row", "Messy row: the amount and the exact ingredient were lost. Open question."],
  row_open: ["skip:messy_row", "Row has more than one likely target or an open question."],
  recipe_reference: ["skip:recipe_reference", "Points to another recipe. Left as written."],
  grocery_mix: ["skip:grocery_list_item", "Grocery list rows are never changed."],
  delete_pending: ["skip:delete_refs_remain", "Delete is decided after the approved repoints."],
};

function skipRule(part: QuestionPart): { rule: string; reason: string } {
  const known = SKIP_REASONS[part.kind];
  if (known) return { rule: known[0], reason: known[1] };
  if (part.kind === "boneless_order") return { rule: "skip:open_question", reason: `Open question not covered by an approval rule (only "boneless" is): ${part.text}` };
  return { rule: "skip:open_question", reason: `Open question not covered by an approval rule: ${part.text}` };
}

// ─── Small helpers ──────────────────────────────────────────────

const wordsOf = (text: string) => text.toLowerCase().split(/[^a-z0-9-]+/).filter(Boolean);
// Ingredient.name is unique, and SQL Server compares without case and
// without trailing spaces. Two names with the same key collide.
export const nameKey = (name: string) => tidyName(name).toLowerCase();
const round = (n: number) => Math.round(n * 1e6) / 1e6;
const isEach = (u: UnitRow | null | undefined) => !u || u.name.toLowerCase() === "each";
const NOTES_MAX = 200;
const NAME_MAX = 200;

// Parts added to the front of a note, each only if the note doesn't
// already say all its words: "cooked" is not added to "Cooked, chilled".
export function addNoteParts(note: string, parts: string[]): string {
  const have = new Set(wordsOf(note));
  const fresh: string[] = [];
  for (const part of parts.map((p) => p.trim()).filter(Boolean)) {
    if (wordsOf(part).every((w) => have.has(w))) continue;
    fresh.push(part);
    wordsOf(part).forEach((w) => have.add(w));
  }
  return fresh.length ? tidyIngredientNote([...fresh, note].filter(Boolean).join(", ")) : note;
}

// The note without one part ("1 cup, softened" less "1 cup").
function removeNotePart(note: string, part: string): string {
  return note
    .split(/,\s*/)
    .filter((p) => p.trim().toLowerCase() !== part.trim().toLowerCase())
    .join(", ");
}

// An amount with a real unit: "28 oz", "1 cup", "15-ounce". Null for a count.
export function readMeasure(text: string, lookup: UnitLookup): { quantity: number; unit: UnitRow } | null {
  const r = readQuantity(text.trim().replace(/^(\d[\d./ ]*)-(?=[a-z])/i, "$1 "));
  if (!(r.quantity > 0) || r.quantityMax !== r.quantity) return null;
  const word = r.rest.trim().toLowerCase().replace(/\.$/, "");
  const unit = lookup(word) ?? lookup(word.replace(/s$/, ""));
  return unit && !isEach(unit) ? { quantity: r.quantity, unit } : null;
}

// "4 to 6" at the front of a note whose upper end is the line's amount: the
// owner wants the low end. Also the word after it ("stick" in "1/2 to 1
// stick").
export function rangeLow(note: string, quantity: number): { low: number; high: number; word: string } | null {
  const first = (note.split(",")[0] ?? "").trim();
  const r = readQuantity(first);
  if (!(r.quantityMax > r.quantity) || Math.abs(r.quantityMax - quantity) > 1e-9) return null;
  return { low: r.quantity, high: r.quantityMax, word: r.rest.trim().toLowerCase() };
}

// The start of a range that ends at `end`, if the line text has one ("4-5",
// "4 to 5"). Null when the start is not there.
export function rangeStartIn(text: string, end: number): number | null {
  const re = /(\d+(?:\s+\d+\/\d+|\/\d+|\.\d+)?)\s*(?:-|–|to)\s*(\d+(?:\s+\d+\/\d+|\/\d+|\.\d+)?)/gi;
  for (const m of text.matchAll(re)) {
    const r = readQuantity(`${m[1]} to ${m[2]}`);
    if (Math.abs(r.quantityMax - end) < 1e-9 && r.quantity < end && r.quantity > 0) return r.quantity;
  }
  return null;
}

// ─── The plan ───────────────────────────────────────────────────

type Values = Record<string, string | number | null>;

export interface Step {
  seq: number;
  kind: "update" | "insert" | "delete";
  table: WriteTable;
  // Null for an insert; its id is known only when it runs.
  rowId: number | null;
  // An insert's handle, "new:<name>", which line steps name in
  // after.ingredientRef.
  ref: string | null;
  before: Values | null;
  after: Values | null;
  beforeText: string;
  afterText: string;
  category: string;
  rules: string[];
  reason: string;
  question: string;
  recipe: string;
}

export interface Skip {
  table: string;
  rowId: number;
  category: string;
  rule: string;
  reason: string;
  recipe: string;
  current: string;
  proposed: string;
  question: string;
}

export interface DeleteCheck {
  id: number;
  name: string;
  refsBefore: RefCounts;
  refsAfter: RefCounts;
  deletable: boolean;
  reason: string;
}

export interface Decision {
  category: string;
  table: string;
  rowId: number;
  decision: "approved" | "skipped";
  rules: string[];
}

export interface Plan {
  steps: Step[];
  skipped: Skip[];
  decisions: Decision[];
  deleteChecks: DeleteCheck[];
  counts: { updates: number; inserts: number; deletes: number };
  garlic: { target: string; lines: number };
  // The rows behind the "more than one likely target" grocery questions,
  // with what happens to their recipe lines.
  openRows: { id: number; name: string; lineSteps: number; deleted: boolean }[];
}

interface Draft {
  table: LineTable;
  line: LineRow;
  recipe: string;
  category: string;
  target: Target;
  quantity: number;
  unitId: number;
  notes: string;
  rules: string[];
  reason: string;
  question: string;
}

interface Ctx {
  lookup: UnitLookup;
  unitById: Map<number, UnitRow>;
  unitByName: (name: string) => UnitRow | null;
  ingById: Map<number, IngredientRow>;
}

const lineKey = (table: string, id: number) => `${table}:${id}`;

// One line proposal under the owner's decisions: the values to save, or why
// it is skipped.
export function decideLine(x: Proposal, line: LineRow, ctx: Ctx): { draft: Draft } | { skip: { rule: string; reason: string } } {
  const parts = x.ambiguous ? questionParts(x.question) : [];
  const open = parts.find((p) => !approves(p));
  if (open) return { skip: skipRule(open) };
  if ("delete" in x.proposed.target || ("create" in x.proposed.target && x.proposed.target.create === "?")) {
    return { skip: { rule: "skip:open_question", reason: "No ingredient to point at." } };
  }
  let unit = ctx.unitByName(x.proposed.unit);
  if (!unit) return { skip: { rule: "skip:unknown_unit", reason: `Unit "${x.proposed.unit}" is not in the Unit table.` } };
  let quantity = x.proposed.quantity ?? line.quantity;
  let notes = x.proposed.notes;
  const saved = ctx.unitById.get(line.unitId) ?? null;
  const ing = ctx.ingById.get(line.ingredientId);
  const rules: string[] = parts.length ? [] : ["approve:non_ambiguous"];
  const cup = ctx.unitByName("cup");

  for (const p of parts) {
    switch (p.kind) {
      case "amount_change":
        rules.push("approve:amount_change");
        break;
      case "lost_range_start": {
        // "-5" before the name is the end of a range. The start is used if
        // the line text has it; otherwise the stored amount stays.
        const end = readQuantity(p.m[1].replace(/^[-–]\s*/, "")).quantity;
        const low = rangeStartIn(`${ing?.name ?? ""} ${line.notes ?? ""}`, end);
        if (low !== null) {
          quantity = low;
          notes = addNoteParts(notes, [`${formatQuantity(low)} to ${formatQuantity(end)}`]);
          rules.push("approve:lost_range_start (low end from the line text)");
        } else {
          quantity = line.quantity;
          unit = saved ?? unit;
          notes = addNoteParts(notes, [`${p.m[1]} (range start lost)`]);
          rules.push("approve:lost_range_start (start not in the line text, kept the stored amount)");
        }
        break;
      }
      case "mixed_number":
        rules.push("approve:mixed_number");
        break;
      case "spelling":
        rules.push("approve:spelling");
        break;
      case "stick_butter": {
        if (!cup) return { skip: { rule: "skip:unknown_unit", reason: 'No "cup" unit.' } };
        const sticks = Number(p.m[4]);
        quantity = sticks * 0.5;
        unit = cup;
        if (!/\bsticks?\b/i.test(notes)) notes = addNoteParts(notes, [`${formatQuantity(sticks)} stick${sticks === 1 ? "" : "s"}`]);
        rules.push("approve:stick_butter");
        break;
      }
      case "unit_from_name": {
        const named = ctx.unitByName(p.m[3]);
        if (!named) return { skip: { rule: "skip:unknown_unit", reason: `Unit "${p.m[3]}" is not in the Unit table.` } };
        if (isEach(named)) {
          // "container(s) (15-ounce) ricotta" saved as 15 ounce: the name's
          // amount is the container size.
          const first = (notes.split(",")[0] ?? "").trim();
          const measure = readMeasure(first, ctx.lookup);
          if (!measure) return { skip: { rule: "skip:open_question", reason: `The name starts with a container word and gives no size: ${p.text}` } };
          const container = (ing?.name.trim().split(/\s+/)[0] ?? "").replace(/\((e?s)\)$/i, "").toLowerCase();
          quantity = measure.quantity;
          unit = measure.unit;
          notes = [`${first} ${container}`.trim(), ...notes.split(/,\s*/).slice(1)].filter(Boolean).join(", ");
          rules.push("approve:unit_from_name (container size from the name)");
        } else {
          unit = named;
          rules.push("approve:unit_from_name");
        }
        break;
      }
      case "unit_from_read": {
        const named = ctx.unitByName(p.m[3]);
        if (!named) return { skip: { rule: "skip:unknown_unit", reason: `Unit "${p.m[3]}" is not in the Unit table.` } };
        unit = named;
        rules.push("approve:unit_from_name");
        break;
      }
      case "amount_from_name": {
        const measure = readMeasure(p.m[3], ctx.lookup);
        if (!measure) return { skip: { rule: "skip:open_question", reason: `Could not read the amount in the name: ${p.text}` } };
        quantity = measure.quantity;
        unit = measure.unit;
        notes = removeNotePart(notes, p.m[3]);
        rules.push("approve:amount_from_name");
        break;
      }
      case "container_amount": {
        const measure = readMeasure(p.m[3], ctx.lookup);
        if (!measure) return { skip: { rule: "skip:open_question", reason: `Could not read the container size: ${p.text}` } };
        quantity = measure.quantity;
        unit = measure.unit;
        rules.push("approve:amount_from_name");
        break;
      }
      case "boneless_order":
        rules.push("approve:boneless_order");
        break;
      case "two_amounts":
        notes = addNoteParts(notes, [p.m[4]]);
        rules.push("approve:two_amounts");
        break;
    }
  }

  // A range is saved at its upper end; the owner wants the low end when the
  // amount changes.
  if (Math.abs(quantity - line.quantity) > 1e-9 || unit.id !== line.unitId) {
    const range = rangeLow(notes, quantity);
    if (range) {
      quantity = range.low;
      rules.push("approve:range_low_end");
      if (/^sticks?$/.test(range.word) && isEach(unit) && cup) {
        quantity = range.low * 0.5;
        unit = cup;
        rules.push("approve:stick_butter");
      }
    }
  }

  return {
    draft: {
      table: x.table as LineTable,
      line,
      recipe: x.recipeName,
      category: x.category,
      target: x.proposed.target,
      quantity: round(quantity),
      unitId: unit.id,
      notes,
      rules,
      reason: x.reason,
      question: x.question,
    },
  };
}

// Approved renames and the names planned creates would take, checked for
// collisions with every row the way SQL Server's unique index compares.
// A rename that collides repoints to the other row when that row is clean;
// otherwise it is skipped. A create that collides uses the existing row.
export function resolveNames(
  rows: { id: number; name: string }[],
  renames: Map<number, string>,
  creates: string[],
  usable: (id: number) => boolean
): {
  renamed: Map<number, string>;
  redirected: Map<number, number>;
  renameSkips: Map<number, string>;
  createTo: Map<string, { id: number } | { insert: string } | { skip: string }>;
} {
  const renamed = new Map<number, string>();
  const redirected = new Map<number, number>();
  const renameSkips = new Map<number, string>();
  // Every name that exists at some point: current names stay taken until
  // the end, since a rename away runs in the same batch.
  const taken = new Map<string, number>();
  for (const r of rows) if (!taken.has(nameKey(r.name))) taken.set(nameKey(r.name), r.id);
  for (const [id, name] of [...renames].sort((a, b) => a[0] - b[0])) {
    const owner = taken.get(nameKey(name));
    if (owner === undefined || owner === id) {
      renamed.set(id, name);
      taken.set(nameKey(name), id);
    } else if (usable(owner) && !renames.has(owner)) {
      redirected.set(id, owner);
    } else {
      renameSkips.set(id, `"${name}" is taken by row #${owner}, which is itself being cleaned.`);
    }
  }
  const createTo = new Map<string, { id: number } | { insert: string } | { skip: string }>();
  const inserts = new Map<string, string>();
  for (const name of creates) {
    if (createTo.has(name)) continue;
    const owner = taken.get(nameKey(name));
    if (owner !== undefined) {
      createTo.set(name, usable(owner) ? { id: owner } : { skip: `"${name}" is taken by row #${owner}, which is itself being cleaned.` });
      continue;
    }
    // "onion" and "onions": one insert.
    const key = ingredientKey(tidyName(name));
    if (!inserts.has(key)) inserts.set(key, name);
    createTo.set(name, { insert: inserts.get(key)! });
  }
  return { renamed, redirected, renameSkips, createTo };
}

// Counts of references a row has in each table, after the line steps.
export function deleteDecision(refs: RefCounts): { deletable: boolean; reason: string } {
  const left = Object.entries(refs).filter(([, n]) => n > 0);
  return left.length
    ? { deletable: false, reason: `References remain: ${left.map(([t, n]) => `${t} ${n}`).join(", ")}.` }
    : { deletable: true, reason: "No references left after the approved repoints." };
}

export function buildPlan(snap: Snapshot, report: Report, extraRefs: Map<number, RefCounts> = new Map()): Plan {
  const lookup = makeUnitLookup(snap.units) as UnitLookup;
  const unitById = new Map(snap.units.map((u) => [u.id, u]));
  const unitByName = (name: string) => snap.units.find((u) => u.name.toLowerCase() === name.trim().toLowerCase()) ?? lookup(name.trim().toLowerCase());
  const ingById = new Map(snap.ingredients.map((i) => [i.id, i]));
  const ctx: Ctx = { lookup, unitById, unitByName, ingById };
  const recipeName = new Map<string, string>([
    ...snap.recipes.map((r) => [`RecipeIngredient:${r.id}`, r.name] as [string, string]),
    ...snap.libraryRecipes.map((r) => [`LibraryRecipeIngredient:${r.id}`, r.name] as [string, string]),
  ]);
  const lines = new Map<string, { table: LineTable; row: LineRow }>();
  for (const row of snap.recipeLines) lines.set(lineKey("RecipeIngredient", row.id), { table: "RecipeIngredient", row });
  for (const row of snap.libraryLines) lines.set(lineKey("LibraryRecipeIngredient", row.id), { table: "LibraryRecipeIngredient", row });
  const flagged = new Set(report.ingredients.map((r) => r.id));

  const unitText = (id: number) => unitById.get(id)?.name ?? `#${id}`;
  // Names after the renames, for the after side of a step.
  let renamedNow = new Map<number, string>();
  const ingText = (id: number | null, ref: string | null, after: boolean) =>
    id === null ? `${(ref ?? "").replace(/^new:/, "")} (new)` : `${(after ? renamedNow.get(id) : undefined) ?? ingById.get(id)?.name ?? "?"} (#${id})`;
  const lineText = (v: Values, after = false) =>
    `${v.quantity} ${unitText(Number(v.unitId))} | ${ingText(v.ingredientId as number | null, (v.ingredientRef as string | null) ?? null, after)}${v.notes ? ` | ${v.notes}` : ""}`;
  const proposalText = (x: Proposal, side: "current" | "proposed") => {
    const s = x[side];
    const amount = s.quantity === null ? "" : `${s.quantity} ${s.unit} | `;
    const t = x.proposed.target;
    const name = side === "current" ? `${x.current.ingredientName} (#${x.current.ingredientId})` : "delete" in t ? "(delete row)" : "create" in t ? `${t.create} (new)` : `${t.name} (#${t.id})`;
    return `${amount}${name}${s.notes ? ` | ${s.notes}` : ""}`;
  };

  // ── Decide every proposal ──
  const decisions: Decision[] = [];
  const baseSkips: Skip[] = [];
  const drafts: Draft[] = [];
  const renameProposals = new Map<number, Proposal>();
  const previewDeletes = new Set<number>();
  const cookedQuestions: Proposal[] = [];
  const proposed = new Set<string>();
  // Rows an unresolved line leaves as they are, with why.
  const held0 = new Map<number, string>();
  const skip = (x: Proposal, rule: string, reason: string) => {
    baseSkips.push({
      table: x.table, rowId: x.rowId, category: x.category, rule, reason, recipe: x.recipeName,
      current: proposalText(x, "current"), proposed: proposalText(x, "proposed"), question: x.question,
    });
    decisions.push({ category: x.category, table: x.table, rowId: x.rowId, decision: "skipped", rules: [rule] });
  };
  for (const x of report.proposals) {
    if (x.table === "GroceryListItem") skip(x, "skip:grocery_list_item", "Grocery list rows are never changed; past lists stay as they are.");
    else if (x.table === "InventoryItem") skip(x, "skip:inventory_item", "Inventory rows are never changed.");
    else if (x.table === "StorePrice") skip(x, "skip:store_price", "Store price rows are never changed.");
    else if (x.category === "recipe_reference") {
      skip(x, "skip:recipe_reference", "Points to another recipe. Left as written.");
      held0.set(x.current.ingredientId, "recipe reference");
      proposed.add(lineKey(x.table, x.rowId));
    } else if (x.category === "deletable_after_repoint") previewDeletes.add(x.rowId);
    else if (x.category === "cooked_separate") cookedQuestions.push(x);
    else if (x.category === "rename_ingredient") {
      const open = x.ambiguous ? questionParts(x.question).find((p) => !approves(p)) : undefined;
      if (open) {
        const why = skipRule(open);
        skip(x, why.rule, why.reason);
        held0.set(x.rowId, why.reason);
      } else renameProposals.set(x.rowId, x);
    } else if (x.table === "RecipeIngredient" || x.table === "LibraryRecipeIngredient") {
      proposed.add(lineKey(x.table, x.rowId));
      const line = lines.get(lineKey(x.table, x.rowId));
      if (!line) {
        skip(x, "skip:missing_row", "The line is not in the snapshot.");
        continue;
      }
      const decided = decideLine(x, line.row, ctx);
      if ("skip" in decided) {
        skip(x, decided.skip.rule, decided.skip.reason);
        held0.set(line.row.ingredientId, decided.skip.reason);
      } else drafts.push(decided.draft);
    } else skip(x, "skip:open_question", `No rule for ${x.category} on ${x.table}.`);
  }

  // ── Cooked X: lines with no proposal of their own, on a cooked row ──
  const cookedDrafts: Draft[] = [];
  for (const { table, row } of lines.values()) {
    if (proposed.has(lineKey(table, row.id))) continue;
    const ing = ingById.get(row.ingredientId);
    if (!ing || !COOKED_LEAD.test(tidyName(ing.name)) || !cookedTidy(ing.name)) continue;
    cookedDrafts.push({
      table, line: row, recipe: recipeName.get(`${table}:${row.recipeId}`) ?? "", category: "cooked_separate",
      target: { id: ing.id, name: ing.name }, quantity: row.quantity, unitId: row.unitId, notes: row.notes ?? "",
      rules: [], reason: `Line on cooked row "${ing.name}".`, question: "",
    });
  }

  // Everything below runs again whenever a row turns out to be held, so a
  // line never moves off a row that keeps an open question.
  const held = new Map(held0);
  for (let pass = 0; ; pass++) {
    if (pass > 50) throw new Error("Plan did not settle");
    const newHolds = new Map<number, string>();
    const skipped: Skip[] = [...baseSkips];
    const draftSkip = (d: Draft, rule: string, reason: string) => {
      const cur = { ingredientId: d.line.ingredientId, quantity: d.line.quantity, unitId: d.line.unitId, notes: d.line.notes };
      skipped.push({
        table: d.table, rowId: d.line.id, category: d.category, rule, reason, recipe: d.recipe,
        current: lineText(cur), proposed: "", question: d.question,
      });
    };

    // Renames, checked for name collisions.
    const renameWanted = new Map<number, string>();
    const renameHeld = new Map<number, string>();
    for (const [id, x] of renameProposals) {
      if (held.has(id)) renameHeld.set(id, held.get(id)!);
      else renameWanted.set(id, "id" in x.proposed.target ? x.proposed.target.name : "");
    }
    // Clean rows that stay put can take lines from a colliding rename or create.
    const usable = (id: number) => !flagged.has(id) && !held.has(id) && !previewDeletes.has(id);
    const names = resolveNames(snap.ingredients, renameWanted, [], usable);
    for (const [id, why] of names.renameSkips) {
      renameHeld.set(id, why);
      newHolds.set(id, why);
    }
    renamedNow = names.renamed;
    const finalName = (id: number) => names.renamed.get(id) ?? ingById.get(id)?.name ?? "";

    // Lines a collided rename leaves behind move with it.
    const live: Draft[] = [...drafts, ...cookedDrafts];
    const liveKeys = new Set(live.map((d) => lineKey(d.table, d.line.id)));
    for (const [from, to] of names.redirected) {
      for (const { table, row } of lines.values()) {
        if (row.ingredientId !== from || liveKeys.has(lineKey(table, row.id))) continue;
        live.push({
          table, line: row, recipe: recipeName.get(`${table}:${row.recipeId}`) ?? "", category: "rename_ingredient",
          target: { id: to, name: finalName(to) }, quantity: row.quantity, unitId: row.unitId, notes: row.notes ?? "",
          rules: ["approve:rename_collision_repoint"], reason: `Rename of #${from} collides with #${to}.`, question: "",
        });
      }
    }

    // Targets: redirects, cooked X to plain X, then creates.
    interface Final { d: Draft; target: Target; notes: string; rules: string[] }
    const finals: Final[] = [];
    for (const d of live) {
      if (held.has(d.line.ingredientId)) {
        draftSkip(d, "skip:open_row", `Row #${d.line.ingredientId} keeps an open question (${held.get(d.line.ingredientId)}), so its lines stay.`);
        continue;
      }
      let target = d.target;
      let notes = d.notes;
      const rules = [...d.rules];
      if ("id" in target && names.redirected.has(target.id)) {
        const to = names.redirected.get(target.id)!;
        target = { id: to, name: finalName(to) };
        rules.push("approve:rename_collision_repoint");
      }
      if ("id" in target && renameHeld.has(target.id)) {
        draftSkip(d, "skip:depends_on_skipped", `Target row #${target.id} keeps its old name (${renameHeld.get(target.id)}).`);
        newHolds.set(d.line.ingredientId, `a line depends on row #${target.id}`);
        continue;
      }
      const targetName = "id" in target ? finalName(target.id) : "create" in target ? target.create : "";
      if (COOKED_LEAD.test(tidyName(targetName))) {
        // Cooked X joins plain X; "cooked" and the words taken off go to the note.
        const tidy = cookedTidy(targetName) ?? { name: tidyName(targetName), note: "" };
        const plain = tidy.name.replace(COOKED_LEAD, "$1");
        target = report.targetFor(plain);
        if ("id" in target && names.redirected.has(target.id)) target = { id: names.redirected.get(target.id)!, name: finalName(names.redirected.get(target.id)!) };
        notes = addNoteParts(notes, ["cooked", tidy.note]);
        rules.push("approve:cooked_merge");
      }
      finals.push({ d, target, notes, rules });
    }
    const creates = finals.flatMap((f) => ("create" in f.target ? [f.target.create] : []));
    const createTo = resolveNames(
      [...snap.ingredients.filter((i) => !names.renamed.has(i.id)), ...[...names.renamed].map(([id, name]) => ({ id, name })), ...snap.ingredients.filter((i) => names.renamed.has(i.id))],
      new Map(),
      creates,
      (id) => usable(id) && !names.redirected.has(id)
    ).createTo;

    // ── Line steps ──
    const steps: Step[] = [];
    const insertNames = new Map<string, Step>();
    const lineSteps: Step[] = [];
    const movedTo = new Map<string, number | string>();
    for (const f of finals) {
      const { d } = f;
      let ingredientId: number | null = null;
      let ingredientRef: string | null = null;
      const rules = [...f.rules];
      if ("create" in f.target) {
        const to = createTo.get(f.target.create)!;
        if ("skip" in to) {
          draftSkip(d, "skip:name_collision", to.skip);
          newHolds.set(d.line.ingredientId, to.skip);
          continue;
        }
        if ("id" in to) {
          ingredientId = to.id;
          rules.push("approve:existing_name_repoint");
        } else {
          ingredientRef = `new:${to.insert}`;
          if (!insertNames.has(to.insert)) {
            insertNames.set(to.insert, {
              seq: 0, kind: "insert", table: "Ingredient", rowId: null, ref: ingredientRef, before: null,
              after: { name: to.insert }, beforeText: "", afterText: `${to.insert} (new)`, category: "create",
              rules: ["approve:create"], reason: "", question: "", recipe: "",
            });
          }
        }
      } else if ("id" in f.target) ingredientId = f.target.id;
      const name = ingredientRef ? ingredientRef.slice(4) : finalName(ingredientId!);
      if (nameKey(name) === "garlic" && d.category === "wrong_link") {
        const at = rules.indexOf("approve:non_ambiguous");
        if (at >= 0) rules[at] = "approve:garlic";
        else rules.push("approve:garlic");
      }
      if (nameKey(name) === "yeast" && nameKey(ingById.get(d.line.ingredientId)?.name ?? "") !== "yeast") rules.push("approve:yeast");
      const savedNote = d.line.notes ?? "";
      const notes = f.notes === savedNote ? d.line.notes : f.notes || null;
      if ((notes ?? "").length > NOTES_MAX) {
        draftSkip(d, "skip:too_long", `Note would be ${(notes ?? "").length} characters; the column holds ${NOTES_MAX}.`);
        newHolds.set(d.line.ingredientId, "note too long");
        continue;
      }
      const before: Values = { ingredientId: d.line.ingredientId, quantity: d.line.quantity, unitId: d.line.unitId, notes: d.line.notes };
      const after: Values = { ingredientId, ingredientRef, quantity: d.quantity, unitId: d.unitId, notes };
      if (ingredientId === d.line.ingredientId && d.quantity === d.line.quantity && d.unitId === d.line.unitId && notes === d.line.notes) continue;
      movedTo.set(lineKey(d.table, d.line.id), ingredientId ?? ingredientRef!);
      lineSteps.push({
        seq: 0, kind: "update", table: d.table, rowId: d.line.id, ref: null, before, after,
        beforeText: lineText(before), afterText: lineText(after, true), category: d.category, rules,
        reason: d.reason, question: d.question, recipe: d.recipe,
      });
      const ins = ingredientRef ? insertNames.get(ingredientRef.slice(4)) : undefined;
      if (ins && !ins.reason) ins.reason = `First used by ${d.table} #${d.line.id}${d.recipe ? ` in "${d.recipe}"` : ""}.`;
    }
    // New holds: settle again without the lines on those rows.
    const fresh = [...newHolds].filter(([id]) => !held.has(id));
    if (fresh.length) {
      for (const [id, why] of fresh) held.set(id, why);
      continue;
    }

    // ── Renames ──
    const renameSteps: Step[] = [];
    for (const [id, name] of [...names.renamed].sort((a, b) => a[0] - b[0])) {
      const x = renameProposals.get(id)!;
      const old = ingById.get(id)!.name;
      if (name.length > NAME_MAX) {
        skipped.push({ table: "Ingredient", rowId: id, category: x.category, rule: "skip:too_long", reason: `Name longer than ${NAME_MAX}.`, recipe: "", current: old, proposed: name, question: "" });
        continue;
      }
      renameSteps.push({
        seq: 0, kind: "update", table: "Ingredient", rowId: id, ref: null, before: { name: old }, after: { name },
        beforeText: `${old} (#${id})`, afterText: `${name} (#${id})`, category: "rename_ingredient",
        rules: [nameKey(name) === "garlic" ? "approve:garlic" : nameKey(name) === "yeast" ? "approve:yeast" : RESPELL_ROWS.has(nameKey(old)) ? "approve:spelling_rename" : "approve:rename"],
        reason: x.reason, question: x.question, recipe: "",
      });
    }
    for (const [id, why] of renameHeld) {
      const x = renameProposals.get(id)!;
      skipped.push({ table: "Ingredient", rowId: id, category: x.category, rule: /is taken by/.test(why) ? "skip:name_collision" : "skip:open_row", reason: why, recipe: "", current: ingById.get(id)!.name, proposed: "id" in x.proposed.target ? x.proposed.target.name : "", question: x.question });
    }
    for (const [from, to] of names.redirected) {
      const x = renameProposals.get(from)!;
      skipped.push({ table: "Ingredient", rowId: from, category: x.category, rule: "skip:name_collision", reason: `Rename collides with #${to}; lines repoint there instead.`, recipe: "", current: ingById.get(from)!.name, proposed: "id" in x.proposed.target ? x.proposed.target.name : "", question: "" });
    }
    for (const ins of insertNames.values()) {
      if (String(ins.after!.name).length > NAME_MAX) throw new Error(`New name longer than ${NAME_MAX}: ${ins.after!.name}`);
    }

    // ── Deletes: rows left with no references ──
    const refsOf = (rows: { ingredientId: number }[]) => {
      const m = new Map<number, number>();
      for (const r of rows) m.set(r.ingredientId, (m.get(r.ingredientId) ?? 0) + 1);
      return m;
    };
    const refBefore: Record<string, Map<number, number>> = {
      RecipeIngredient: refsOf(snap.recipeLines),
      LibraryRecipeIngredient: refsOf(snap.libraryLines),
      GroceryListItem: refsOf(snap.groceryItems),
      InventoryItem: refsOf(snap.inventory),
      StorePrice: refsOf(snap.storePrices),
    };
    const lineAfter = (table: LineTable, rows: LineRow[]) =>
      refsOf(rows.map((r) => {
        const to = movedTo.get(lineKey(table, r.id));
        return { ingredientId: typeof to === "number" ? to : to === undefined ? r.ingredientId : -1 };
      }));
    const refAfter: Record<string, Map<number, number>> = {
      ...refBefore,
      RecipeIngredient: lineAfter("RecipeIngredient", snap.recipeLines),
      LibraryRecipeIngredient: lineAfter("LibraryRecipeIngredient", snap.libraryLines),
    };
    const countsFor = (m: Record<string, Map<number, number>>, id: number): RefCounts => {
      const out: RefCounts = {};
      for (const { table } of REF_COLUMNS) out[table] = m[table].get(id) ?? 0;
      for (const [table, n] of Object.entries(extraRefs.get(id) ?? {})) out[table] = (out[table] ?? 0) + n;
      return out;
    };
    const vacated = new Set(lineSteps.filter((s) => s.after!.ingredientId !== s.before!.ingredientId).map((s) => Number(s.before!.ingredientId)));
    const targeted = new Set(lineSteps.map((s) => s.after!.ingredientId).filter((id): id is number => typeof id === "number"));
    const cookedRows = new Set(snap.ingredients.filter((i) => COOKED_LEAD.test(tidyName(i.name)) && vacated.has(i.id)).map((i) => i.id));
    const candidates = new Set([...previewDeletes, ...cookedRows, ...[...names.redirected.keys()].filter((id) => vacated.has(id))]);
    const deleteChecks: DeleteCheck[] = [];
    const deleteSteps: Step[] = [];
    for (const id of [...candidates].sort((a, b) => a - b)) {
      const ing = ingById.get(id);
      if (!ing) continue;
      const refsBefore = countsFor(refBefore, id);
      const refsAfter = countsFor(refAfter, id);
      let check = deleteDecision(refsAfter);
      if (held.has(id)) check = { deletable: false, reason: `Row keeps an open question (${held.get(id)}).` };
      else if (names.renamed.has(id) || targeted.has(id)) check = { deletable: false, reason: "Row is a target of the cleanup." };
      deleteChecks.push({ id, name: ing.name, refsBefore, refsAfter, ...check });
      if (!check.deletable) {
        skipped.push({ table: "Ingredient", rowId: id, category: previewDeletes.has(id) ? "deletable_after_repoint" : "cooked_separate", rule: "skip:delete_refs_remain", reason: check.reason, recipe: "", current: `${ing.name} (#${id})`, proposed: "(delete row)", question: "" });
        continue;
      }
      deleteSteps.push({
        seq: 0, kind: "delete", table: "Ingredient", rowId: id, ref: null, before: { id, name: ing.name }, after: null,
        beforeText: `${ing.name} (#${id})`, afterText: "(deleted)", category: previewDeletes.has(id) ? "deletable_after_repoint" : "cooked_separate",
        rules: ["delete:zero_refs"], reason: check.reason, question: "", recipe: "",
      });
    }

    lineSteps.sort((a, b) => (a.table === b.table ? a.rowId! - b.rowId! : a.table === "RecipeIngredient" ? -1 : 1));
    steps.push(...renameSteps, ...insertNames.values(), ...lineSteps, ...deleteSteps);
    steps.forEach((s, i) => (s.seq = i + 1));

    // Decisions for every proposal that became (or fed) a step.
    const stepByLine = new Map(lineSteps.map((s) => [lineKey(s.table, s.rowId!), s]));
    const allDecisions = [...decisions];
    const skippedLine = new Map(skipped.map((s) => [lineKey(s.table, s.rowId), s]));
    for (const x of report.proposals) {
      if (decisions.some((d) => d.table === x.table && d.rowId === x.rowId && d.category === x.category)) continue;
      const key = lineKey(x.table, x.rowId);
      const s = stepByLine.get(key);
      const sk = skippedLine.get(key);
      if (x.table === "Ingredient") {
        const step = steps.find((st) => st.table === "Ingredient" && st.rowId === x.rowId);
        const rules = x.category === "cooked_separate" ? ["approve:cooked_merge"] : step ? step.rules : sk ? [sk.rule] : ["no_change"];
        allDecisions.push({ category: x.category, table: x.table, rowId: x.rowId, decision: sk && !step ? "skipped" : "approved", rules });
      } else allDecisions.push({ category: x.category, table: x.table, rowId: x.rowId, decision: s || !sk ? "approved" : "skipped", rules: s ? s.rules : sk ? [sk.rule] : ["no_change"] });
    }

    const garlicSteps = lineSteps.filter((s) => s.rules.includes("approve:garlic"));
    const garlicTargets = [...new Set(garlicSteps.map((s) => ingText(s.after!.ingredientId as number | null, s.after!.ingredientRef as string | null, true)))];
    const openIds = [...new Set(report.proposals.filter((x) => x.table === "GroceryListItem" && /has more than one likely target or an open question/.test(x.question)).map((x) => x.current.ingredientId))];
    return {
      steps,
      skipped,
      decisions: allDecisions,
      deleteChecks,
      counts: { updates: renameSteps.length + lineSteps.length, inserts: insertNames.size, deletes: deleteSteps.length },
      garlic: { target: garlicTargets.join(", "), lines: garlicSteps.length },
      openRows: openIds.sort((a, b) => a - b).map((id) => ({
        id,
        name: ingById.get(id)?.name ?? "",
        lineSteps: lineSteps.filter((s) => s.before!.ingredientId === id).length,
        deleted: deleteSteps.some((s) => s.rowId === id),
      })),
    };
  }
}

// ─── Writing the plan ───────────────────────────────────────────

const json = (v: unknown) => (v === null || v === undefined ? "" : JSON.stringify(v));

function planCsv(plan: Plan): string {
  return toCsv(
    ["seq", "kind", "table", "row_id", "category", "rules", "recipe", "before", "after", "before_json", "after_json", "reason", "question"],
    plan.steps.map((s) => [s.seq, s.kind, s.table, s.rowId ?? s.ref, s.category, s.rules.join("; "), s.recipe, s.beforeText, s.afterText, json(s.before), json(s.after), s.reason, s.question])
  );
}

function skippedCsv(plan: Plan): string {
  return toCsv(
    ["table", "row_id", "category", "rule", "reason", "recipe", "current", "proposed", "question"],
    plan.skipped.map((s) => [s.table, s.rowId, s.category, s.rule, s.reason, s.recipe, s.current, s.proposed, s.question])
  );
}

const countBy = <T,>(items: T[], key: (item: T) => string) => {
  const out = new Map<string, number>();
  for (const item of items) out.set(key(item), (out.get(key(item)) ?? 0) + 1);
  return out;
};

interface Meta { mode: string; isolation: string; generated: string }

export function summaryMd(plan: Plan, meta: Meta): string {
  const md: string[] = [];
  const { steps, counts } = plan;
  md.push("# Ingredient cleanup: apply plan", "", `Generated ${meta.generated} (${meta.mode}).`, "");
  if (/dry run/.test(meta.mode)) {
    md.push("## Dry run: nothing was written", "");
    if (/^live/.test(meta.mode)) {
      md.push(
        "- Every query went through the preview's SELECT-only guard.",
        `- All reads ran in one transaction at isolation level ${meta.isolation}, always rolled back. The connection asked for read-only intent.`
      );
    } else md.push("- No database was used.");
    md.push(
      "- Only Ingredient, RecipeIngredient and LibraryRecipeIngredient rows are in the plan. No GroceryListItem, InventoryItem, StorePrice or MealPlanEntry row is changed.",
      ""
    );
  }
  md.push(`## Totals`, "", `- Updates: ${counts.updates}`, `- Inserts: ${counts.inserts}`, `- Deletes: ${counts.deletes}`, "");
  md.push(`To apply exactly this: \`--apply --undo-log <file> --expect-counts "${counts.updates},${counts.inserts},${counts.deletes}"\``, "");

  const kinds = ["update", "insert", "delete"] as const;
  const table = (title: string, key: (s: Step) => string) => {
    md.push(`## ${title}`, "", `| ${title.replace(/^By /, "")} | Updates | Inserts | Deletes |`, "| --- | ---: | ---: | ---: |");
    for (const k of [...new Set(steps.map(key))].sort()) {
      md.push(`| ${k} | ${kinds.map((kind) => steps.filter((s) => key(s) === k && s.kind === kind).length).join(" | ")} |`);
    }
    md.push(`| total | ${kinds.map((kind) => steps.filter((s) => s.kind === kind).length).join(" | ")} |`, "");
  };
  table("By table", (s) => s.table);
  table("By category", (s) => s.category);
  md.push("## By decision rule", "", "| Rule | Steps |", "| --- | ---: |");
  for (const [rule, n] of [...countBy(steps.flatMap((s) => s.rules.map((r) => ({ r }))), (x) => x.r)].sort()) md.push(`| ${rule} | ${n} |`);
  md.push("");

  md.push("## Skipped, by reason", "", "| Rule | Rows |", "| --- | ---: |");
  for (const [rule, n] of [...countBy(plan.skipped, (s) => s.rule)].sort()) md.push(`| ${rule} | ${n} |`);
  md.push(`| total | ${plan.skipped.length} |`, "", "Each skipped row is in skipped.csv with its reason.", "");

  const kept = plan.deleteChecks.filter((c) => !c.deletable);
  md.push("## Delete checks", "");
  md.push(
    `- Candidate rows: ${plan.deleteChecks.length}`,
    `- Deletable (zero references in every table after the approved repoints): ${plan.deleteChecks.length - kept.length}`,
    `- Kept: ${kept.length}`
  );
  for (const [table, n] of [...countBy(kept.flatMap((c) => Object.entries(c.refsAfter).filter(([, v]) => v > 0).map(([t]) => t)), (t) => t)].sort()) {
    md.push(`  - with ${table} references left: ${n}`);
  }
  md.push(`  - held by an open question: ${kept.filter((c) => /open question/.test(c.reason)).length}`);
  md.push("", "With --apply each delete is checked again inside the transaction, right before it runs, against every table with a column that points at Ingredient.", "");

  md.push("## Garlic", "", `${plan.garlic.lines} "garlic parmesan breading" clove line(s) point to ${plan.garlic.target || "(none)"}.`, "");

  md.push("## Rows behind the \"more than one likely target\" questions", "");
  md.push("Those questions are on GroceryListItem rows, which are all skipped. The recipe lines on the same Ingredient rows follow their own rules; a row stays whole only when one of its own lines has an open question.", "");
  for (const r of plan.openRows) md.push(`- #${r.id} "${r.name}": ${r.lineSteps} line step(s), row ${r.deleted ? "deleted" : "kept"}`);
  if (!plan.openRows.length) md.push("None in this plan.");
  md.push("");

  const sample = (title: string, pick: (s: Step) => boolean, n = 3) => {
    const found = steps.filter(pick).slice(0, n);
    md.push(`### ${title}`, "");
    if (!found.length) md.push("None in this plan.");
    for (const s of found) {
      md.push(`- ${s.kind} ${s.table} #${s.rowId ?? s.ref}${s.recipe ? ` in "${s.recipe}"` : ""} [${s.rules.join("; ")}]: \`${s.beforeText || "(none)"}\` -> \`${s.afterText}\``);
    }
    md.push("");
  };
  md.push("## Samples", "");
  sample("Yeast", (s) => s.rules.includes("approve:yeast"));
  sample("Garlic", (s) => s.rules.includes("approve:garlic"));
  sample("Cooked merge", (s) => s.rules.includes("approve:cooked_merge"), 4);
  sample("Stick butter", (s) => s.rules.includes("approve:stick_butter"));
  sample("Range, low end", (s) => s.rules.includes("approve:range_low_end"));
  sample("Lost range start", (s) => s.rules.some((r) => r.startsWith("approve:lost_range_start")));
  sample("Unit or amount from the name", (s) => s.rules.some((r) => r.startsWith("approve:unit_from_name") || r === "approve:amount_from_name"), 4);
  sample("Delete", (s) => s.kind === "delete");
  return md.join("\n");
}

function writePlan(plan: Plan, dir: string, meta: Meta): string[] {
  mkdirSync(dir, { recursive: true });
  const files: [string, string][] = [
    ["plan.json", JSON.stringify({ ...meta, counts: plan.counts, garlic: plan.garlic, steps: plan.steps, skipped: plan.skipped, deleteChecks: plan.deleteChecks, decisions: plan.decisions, openRows: plan.openRows }, null, 2)],
    ["plan.csv", planCsv(plan)],
    ["skipped.csv", skippedCsv(plan)],
    ["summary.md", summaryMd(plan, meta)],
  ];
  for (const [file, body] of files) writeFileSync(join(dir, file), body, "utf8");
  return files.map(([file]) => join(dir, file));
}

// ─── Running SQL ────────────────────────────────────────────────

type ParamValue = number | string | null;
interface Param { name: string; type: "int" | "float" | "text"; value: ParamValue }
const int = (name: string, value: ParamValue): Param => ({ name, type: "int", value });
const float = (name: string, value: ParamValue): Param => ({ name, type: "float", value });
const text = (name: string, value: ParamValue): Param => ({ name, type: "text", value });

export interface Db {
  select<T>(sql: string, params?: Param[]): Promise<T[]>;
  write(sql: string, params: Param[], allowReinsert?: boolean): Promise<{ rowsAffected: number; ids: number[] }>;
}

const SQL = {
  readLine: (t: LineTable) => `SELECT id, ingredientId, quantity, unitId, notes FROM [${t}] WHERE id = @id`,
  readIngredient: "SELECT id, name, category, defaultUnitId FROM [Ingredient] WHERE id = @id",
  findName: "SELECT id, name FROM [Ingredient] WHERE name = @name",
  countIngredients: "SELECT COUNT(*) AS n FROM [Ingredient]",
  countRefs: (t: string, c: string) => `SELECT COUNT(*) AS n FROM [${t}] WHERE [${c}] = @id`,
  groupRefs: (t: string, c: string) => `SELECT [${c}] AS ingredientId, COUNT(*) AS n FROM [${t}] GROUP BY [${c}]`,
  foreignKeys:
    "SELECT OBJECT_NAME(fkc.parent_object_id) AS tableName, COL_NAME(fkc.parent_object_id, fkc.parent_column_id) AS columnName FROM sys.foreign_key_columns AS fkc WHERE fkc.referenced_object_id = OBJECT_ID('Ingredient')",
  idColumns: "SELECT TABLE_NAME AS tableName, COLUMN_NAME AS columnName FROM INFORMATION_SCHEMA.COLUMNS WHERE COLUMN_NAME = 'ingredientId'",
  updateLine: (t: LineTable) => `UPDATE [${t}] SET ingredientId = @ingredientId, quantity = @quantity, unitId = @unitId, notes = @notes WHERE id = @id`,
  rename: "UPDATE [Ingredient] SET name = @name WHERE id = @id",
  insert: "INSERT INTO [Ingredient] (name) OUTPUT INSERTED.id VALUES (@name)",
  delete: "DELETE FROM [Ingredient] WHERE id = @id",
  // Undo only: puts a deleted row back under its old id.
  reinsert:
    "SET IDENTITY_INSERT [Ingredient] ON; INSERT INTO [Ingredient] (id, name, category, defaultUnitId) VALUES (@id, @name, @category, @defaultUnitId); SET IDENTITY_INSERT [Ingredient] OFF",
};

// Throws unless the SQL is one UPDATE, INSERT or DELETE on Ingredient,
// RecipeIngredient or LibraryRecipeIngredient. The undo's reinsert is the
// one fixed exception, and only when the caller allows it.
export function writeOnly(sql: string, allowReinsert = false): string {
  const t = sql.trim();
  if (allowReinsert && t === SQL.reinsert) return t;
  const m = t.match(/^(?:UPDATE \[(\w+)\] SET |INSERT INTO \[(\w+)\] |DELETE FROM \[(\w+)\] WHERE )/);
  if (!m) throw new Error("Write guard: only UPDATE, INSERT INTO and DELETE FROM are allowed");
  if (/;|--|\/\*/.test(t)) throw new Error("Write guard: semicolons and comments are not allowed");
  for (const [, name] of t.matchAll(/\[(\w+)\]/g)) {
    if (!(WRITE_TABLES as readonly string[]).includes(name)) throw new Error(`Write guard: table "${name}" is not allowed`);
  }
  if ((t.match(/\b(?:update|insert|delete)\b/gi) ?? []).length !== 1) throw new Error("Write guard: one statement per write");
  if (/\b(?:select|merge|exec|execute|alter|drop|create|truncate|grant|revoke|deny|declare|set\s+identity_insert|waitfor|begin|commit|rollback)\b/i.test(t.replace(/^UPDATE \[\w+\] SET /, ""))) {
    throw new Error("Write guard: control keywords are not allowed");
  }
  return t;
}

// Tables and columns that point at Ingredient, from the schema and the
// database. A name that isn't a plain identifier stops the run.
async function refColumns(db: Db): Promise<{ table: string; column: string }[]> {
  const found = [
    ...(await db.select<{ tableName: string; columnName: string }>(SQL.foreignKeys)),
    ...(await db.select<{ tableName: string; columnName: string }>(SQL.idColumns)),
  ];
  const out = [...REF_COLUMNS];
  for (const f of found) {
    if (f.tableName === "Ingredient") continue;
    if (!/^\w+$/.test(f.tableName) || !/^\w+$/.test(f.columnName)) throw new Error(`Unexpected reference column ${f.tableName}.${f.columnName}`);
    if (!out.some((o) => o.table === f.tableName && o.column === f.columnName)) out.push({ table: f.tableName, column: f.columnName });
  }
  return out;
}

// References in tables the snapshot doesn't read, per ingredient id.
async function extraRefCounts(db: Db, columns: { table: string; column: string }[]): Promise<Map<number, RefCounts>> {
  const out = new Map<number, RefCounts>();
  for (const { table, column } of columns.filter((c) => !REF_COLUMNS.some((r) => r.table === c.table && r.column === c.column))) {
    for (const row of await db.select<{ ingredientId: number; n: number }>(SQL.groupRefs(table, column))) {
      const counts = out.get(row.ingredientId) ?? {};
      counts[`${table}.${column}`] = (counts[`${table}.${column}`] ?? 0) + row.n;
      out.set(row.ingredientId, counts);
    }
  }
  return out;
}

// ─── The undo log ───────────────────────────────────────────────

export interface UndoEntry {
  seq: number;
  kind: "update" | "insert" | "delete";
  table: WriteTable;
  id: number;
  before: Values | null;
  after: Values | null;
}

export interface UndoLog {
  version: 1;
  status: "in progress" | "ready to commit" | "committed" | "rolled back" | "undone" | "undo rolled back";
  created: string;
  updated: string;
  planned: { updates: number; inserts: number; deletes: number };
  executed: { updates: number; inserts: number; deletes: number };
  entries: UndoEntry[];
  skippedDeletes: { id: number; refs: RefCounts }[];
  error?: string;
}

// Written whole to a temp file, fsynced, then renamed over the log. The
// first write uses "wx" so an existing log is never overwritten.
export function writeLog(path: string, log: UndoLog, create = false) {
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

class Mismatch extends Error {}

const sameValue = (a: unknown, b: unknown) => (a ?? null) === (b ?? null);
function assertRow(what: string, row: Values | undefined, want: Values) {
  if (!row) throw new Mismatch(`${what}: row is gone`);
  for (const [k, v] of Object.entries(want)) {
    if (k === "ingredientRef") continue;
    if (!sameValue(row[k], v)) throw new Mismatch(`${what}: ${k} is ${JSON.stringify(row[k])}, expected ${JSON.stringify(v)}`);
  }
}
function assertOne(what: string, n: number) {
  if (n !== 1) throw new Mismatch(`${what}: ${n} rows affected, expected 1`);
}

// Runs the plan through db, inside the caller's transaction. Throws on any
// mismatch; the caller rolls back. The log is fsynced before this returns.
export async function applyPlan(
  db: Db,
  plan: Plan,
  opts: { logPath: string; expect?: { updates: number; inserts: number; deletes: number } }
): Promise<UndoLog> {
  const now = new Date().toISOString();
  const log: UndoLog = {
    version: 1, status: "in progress", created: now, updated: now, planned: { ...plan.counts },
    executed: { updates: 0, inserts: 0, deletes: 0 }, entries: [], skippedDeletes: [],
  };
  writeLog(opts.logPath, log, true);
  const expect = opts.expect;
  if (expect && (expect.updates !== plan.counts.updates || expect.inserts !== plan.counts.inserts || expect.deletes !== plan.counts.deletes)) {
    throw new Mismatch(`Plan counts ${plan.counts.updates},${plan.counts.inserts},${plan.counts.deletes} differ from --expect-counts ${expect.updates},${expect.inserts},${expect.deletes}`);
  }
  const columns = await refColumns(db);
  const [{ n: ingredientsBefore }] = await db.select<{ n: number }>(SQL.countIngredients);
  const newIds = new Map<string, number>();

  for (const s of plan.steps) {
    const what = `step ${s.seq} (${s.kind} ${s.table} #${s.rowId ?? s.ref})`;
    if (s.kind === "update" && s.table === "Ingredient") {
      const [row] = await db.select<Values>(SQL.readIngredient, [int("id", s.rowId)]);
      assertRow(what, row, s.before!);
      const taken = (await db.select<{ id: number }>(SQL.findName, [text("name", s.after!.name)])).filter((r) => r.id !== s.rowId);
      if (taken.length) throw new Mismatch(`${what}: name "${s.after!.name}" is taken by #${taken[0].id}`);
      assertOne(what, (await db.write(SQL.rename, [text("name", s.after!.name), int("id", s.rowId)])).rowsAffected);
      log.entries.push({ seq: s.seq, kind: "update", table: "Ingredient", id: s.rowId!, before: { name: row!.name }, after: { name: s.after!.name } });
      log.executed.updates++;
    } else if (s.kind === "insert") {
      const taken = await db.select<{ id: number }>(SQL.findName, [text("name", s.after!.name)]);
      if (taken.length) throw new Mismatch(`${what}: name "${s.after!.name}" is taken by #${taken[0].id}`);
      const res = await db.write(SQL.insert, [text("name", s.after!.name)]);
      assertOne(what, res.rowsAffected);
      if (res.ids.length !== 1) throw new Mismatch(`${what}: no id returned`);
      newIds.set(s.ref!, res.ids[0]);
      log.entries.push({ seq: s.seq, kind: "insert", table: "Ingredient", id: res.ids[0], before: null, after: { name: s.after!.name } });
      log.executed.inserts++;
    } else if (s.kind === "update") {
      const table = s.table as LineTable;
      const [row] = await db.select<Values>(SQL.readLine(table), [int("id", s.rowId)]);
      assertRow(what, row, s.before!);
      const ref = s.after!.ingredientRef as string | null;
      const ingredientId = ref ? newIds.get(ref) : (s.after!.ingredientId as number);
      if (ingredientId === undefined) throw new Mismatch(`${what}: ${ref} was not inserted`);
      const after: Values = { ingredientId, quantity: s.after!.quantity, unitId: s.after!.unitId, notes: s.after!.notes };
      const res = await db.write(SQL.updateLine(table), [
        int("ingredientId", ingredientId), float("quantity", after.quantity), int("unitId", after.unitId), text("notes", after.notes), int("id", s.rowId),
      ]);
      assertOne(what, res.rowsAffected);
      log.entries.push({ seq: s.seq, kind: "update", table, id: s.rowId!, before: { ingredientId: row!.ingredientId, quantity: row!.quantity, unitId: row!.unitId, notes: row!.notes ?? null }, after });
      log.executed.updates++;
    } else {
      // Checked again right before the delete, against every table that
      // points at Ingredient.
      const refs: RefCounts = {};
      for (const { table, column } of columns) {
        const [{ n }] = await db.select<{ n: number }>(SQL.countRefs(table, column), [int("id", s.rowId)]);
        refs[`${table}.${column}`] = n;
      }
      if (Object.values(refs).some((n) => n > 0)) {
        log.skippedDeletes.push({ id: s.rowId!, refs });
        continue;
      }
      const [row] = await db.select<Values>(SQL.readIngredient, [int("id", s.rowId)]);
      assertRow(what, row, { name: s.before!.name });
      assertOne(what, (await db.write(SQL.delete, [int("id", s.rowId)])).rowsAffected);
      log.entries.push({ seq: s.seq, kind: "delete", table: "Ingredient", id: s.rowId!, before: { id: row!.id, name: row!.name, category: row!.category ?? null, defaultUnitId: row!.defaultUnitId ?? null }, after: null });
      log.executed.deletes++;
    }
  }

  // Totals: what ran is the plan, less any delete the re-check stopped.
  const e = log.executed;
  const wantDeletes = plan.counts.deletes - log.skippedDeletes.length;
  if (e.updates !== plan.counts.updates || e.inserts !== plan.counts.inserts || e.deletes !== wantDeletes) {
    throw new Mismatch(`Executed ${e.updates},${e.inserts},${e.deletes}; plan ${plan.counts.updates},${plan.counts.inserts},${wantDeletes}`);
  }
  if (expect && (e.updates !== expect.updates || e.inserts !== expect.inserts || e.deletes !== expect.deletes)) {
    throw new Mismatch(`Executed ${e.updates},${e.inserts},${e.deletes}; --expect-counts ${expect.updates},${expect.inserts},${expect.deletes}${log.skippedDeletes.length ? ` (${log.skippedDeletes.length} delete(s) stopped by the re-check)` : ""}`);
  }
  const [{ n: ingredientsAfter }] = await db.select<{ n: number }>(SQL.countIngredients);
  if (ingredientsAfter !== ingredientsBefore + e.inserts - e.deletes) {
    throw new Mismatch(`Ingredient rows ${ingredientsBefore} -> ${ingredientsAfter}, expected ${ingredientsBefore + e.inserts - e.deletes}`);
  }
  log.status = "ready to commit";
  writeLog(opts.logPath, log);
  return log;
}

// Reverts a committed log, newest step first, inside the caller's
// transaction. Every row must still hold the values the apply left.
export async function undoLog(db: Db, log: UndoLog): Promise<number> {
  if (log.status !== "committed") throw new Mismatch(`Undo log status is "${log.status}", not "committed"`);
  const columns = await refColumns(db);
  let n = 0;
  for (const e of [...log.entries].sort((a, b) => b.seq - a.seq)) {
    const what = `undo step ${e.seq} (${e.kind} ${e.table} #${e.id})`;
    if (e.kind === "delete") {
      const [row] = await db.select<Values>(SQL.readIngredient, [int("id", e.id)]);
      if (row) throw new Mismatch(`${what}: id is in use`);
      const taken = await db.select<{ id: number }>(SQL.findName, [text("name", e.before!.name)]);
      if (taken.length) throw new Mismatch(`${what}: name "${e.before!.name}" is taken by #${taken[0].id}`);
      const b = e.before!;
      assertOne(what, (await db.write(SQL.reinsert, [int("id", e.id), text("name", b.name), text("category", b.category), int("defaultUnitId", b.defaultUnitId)], true)).rowsAffected);
    } else if (e.kind === "insert") {
      const [row] = await db.select<Values>(SQL.readIngredient, [int("id", e.id)]);
      assertRow(what, row, e.after!);
      for (const { table, column } of columns) {
        const [{ n: refs }] = await db.select<{ n: number }>(SQL.countRefs(table, column), [int("id", e.id)]);
        if (refs) throw new Mismatch(`${what}: ${refs} reference(s) in ${table}`);
      }
      assertOne(what, (await db.write(SQL.delete, [int("id", e.id)])).rowsAffected);
    } else if (e.table === "Ingredient") {
      const [row] = await db.select<Values>(SQL.readIngredient, [int("id", e.id)]);
      assertRow(what, row, e.after!);
      const taken = (await db.select<{ id: number }>(SQL.findName, [text("name", e.before!.name)])).filter((r) => r.id !== e.id);
      if (taken.length) throw new Mismatch(`${what}: name "${e.before!.name}" is taken by #${taken[0].id}`);
      assertOne(what, (await db.write(SQL.rename, [text("name", e.before!.name), int("id", e.id)])).rowsAffected);
    } else {
      const table = e.table as LineTable;
      const [row] = await db.select<Values>(SQL.readLine(table), [int("id", e.id)]);
      assertRow(what, row, e.after!);
      const b = e.before!;
      assertOne(what, (await db.write(SQL.updateLine(table), [
        int("ingredientId", b.ingredientId), float("quantity", b.quantity), int("unitId", b.unitId), text("notes", b.notes), int("id", e.id),
      ])).rowsAffected);
    }
    n++;
  }
  return n;
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

function mssqlDb(mssql: MssqlModule, parent: SqlPool | SqlTransaction, readOnly: boolean): Db {
  const request = (params: Param[]) => {
    const r = new mssql.Request(parent);
    for (const p of params) r.input(p.name, p.type === "int" ? mssql.Int : p.type === "float" ? mssql.Float : mssql.NVarChar(NOTES_MAX), p.value);
    return r;
  };
  return {
    select: async <T,>(sql: string, params: Param[] = []) => (await request(params).query<T>(selectOnly(sql))).recordset,
    write: async (sql: string, params: Param[], allowReinsert = false) => {
      if (readOnly) throw new Error("Write guard: this is a dry run");
      const res = await request(params).query<{ id: number }>(writeOnly(sql, allowReinsert));
      return { rowsAffected: res.rowsAffected.reduce((a, b) => a + b, 0), ids: (res.recordset ?? []).map((r) => r.id) };
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
  const mssql = appRequire("mssql") as MssqlModule;
  const pool = new mssql.ConnectionPool(connectionConfig(!write));
  await pool.connect();
  let tx: SqlTransaction | null = null;
  let done = false;
  try {
    let level = mssql.ISOLATION_LEVEL.SERIALIZABLE;
    let isolation = "SERIALIZABLE";
    if (!write) {
      const [state] = await mssqlDb(mssql, pool, true).select<{ snapshot: number }>(QUERIES.snapshotState);
      const snapshotOn = state?.snapshot === 1;
      level = snapshotOn ? mssql.ISOLATION_LEVEL.SNAPSHOT : mssql.ISOLATION_LEVEL.READ_COMMITTED;
      isolation = snapshotOn ? "SNAPSHOT" : "READ COMMITTED";
    }
    tx = new mssql.Transaction(pool);
    await tx.begin(level);
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

async function readPlan(db: Db): Promise<{ snapshot: Snapshot; plan: Plan }> {
  const snapshot = await readSnapshot(<T,>(sql: string) => db.select<T>(sql));
  const extra = await extraRefCounts(db, await refColumns(db));
  return { snapshot, plan: buildPlan(snapshot, analyze(snapshot, new Date()), extra) };
}

// ─── Self-test ──────────────────────────────────────────────────
//
// The preview's fixture plus lines for each rule, and an in-memory database
// that runs the same SQL the apply does. No real database.

type Rows = Record<string, Values[]>;

class FakeDb implements Db {
  rows: Rows;
  private saved: string | null = null;
  constructor(snap: Snapshot) {
    const line = (r: LineRow) => ({ id: r.id, recipeId: r.recipeId, ingredientId: r.ingredientId, quantity: r.quantity, unitId: r.unitId, notes: r.notes });
    this.rows = {
      Ingredient: snap.ingredients.map((i) => ({ id: i.id, name: i.name, category: null, defaultUnitId: null })),
      RecipeIngredient: snap.recipeLines.map(line),
      LibraryRecipeIngredient: snap.libraryLines.map(line),
      GroceryListItem: snap.groceryItems.map((r) => ({ id: r.id, ingredientId: r.ingredientId })),
      InventoryItem: snap.inventory.map((r) => ({ id: r.id, ingredientId: r.ingredientId })),
      StorePrice: snap.storePrices.map((r) => ({ id: r.id, ingredientId: r.ingredientId })),
    };
  }
  begin() { this.saved = JSON.stringify(this.rows); }
  rollback() { if (this.saved) this.rows = JSON.parse(this.saved); this.saved = null; }
  commit() { this.saved = null; }
  dump() { return JSON.stringify(this.rows); }
  private param(params: Param[], name: string) { return params.find((p) => p.name === name)?.value ?? null; }
  async select<T>(sql: string, params: Param[] = []): Promise<T[]> {
    const q = selectOnly(sql);
    const id = this.param(params, "id");
    let m: RegExpMatchArray | null;
    if ((m = q.match(/^SELECT id, ingredientId, quantity, unitId, notes FROM \[(\w+)\] WHERE id = @id$/))) {
      return this.rows[m[1]].filter((r) => r.id === id).map((r) => ({ ...r })) as T[];
    }
    if (q === SQL.readIngredient) return this.rows.Ingredient.filter((r) => r.id === id).map((r) => ({ ...r })) as T[];
    if (q === SQL.findName) {
      const key = String(this.param(params, "name")).trimEnd().toLowerCase();
      return this.rows.Ingredient.filter((r) => String(r.name).trimEnd().toLowerCase() === key) as T[];
    }
    if (q === SQL.countIngredients) return [{ n: this.rows.Ingredient.length }] as T[];
    if ((m = q.match(/^SELECT COUNT\(\*\) AS n FROM \[(\w+)\] WHERE \[(\w+)\] = @id$/))) {
      return [{ n: (this.rows[m[1]] ?? []).filter((r) => r[m![2]] === id).length }] as T[];
    }
    if (q === SQL.foreignKeys) return REF_COLUMNS.map((c) => ({ tableName: c.table, columnName: c.column })) as T[];
    if (q === SQL.idColumns) return [] as T[];
    throw new Error(`FakeDb: unknown select ${q}`);
  }
  async write(sql: string, params: Param[], allowReinsert = false) {
    const q = writeOnly(sql, allowReinsert);
    const p = (name: string) => this.param(params, name);
    const unique = (name: ParamValue, self: ParamValue) => {
      const key = String(name).trimEnd().toLowerCase();
      if (this.rows.Ingredient.some((r) => r.id !== self && String(r.name).trimEnd().toLowerCase() === key)) throw new Error(`FakeDb: duplicate name "${name}"`);
    };
    let m: RegExpMatchArray | null;
    if ((m = q.match(/^UPDATE \[(RecipeIngredient|LibraryRecipeIngredient)\] SET/))) {
      const hit = this.rows[m[1]].filter((r) => r.id === p("id"));
      for (const r of hit) Object.assign(r, { ingredientId: p("ingredientId"), quantity: p("quantity"), unitId: p("unitId"), notes: p("notes") });
      return { rowsAffected: hit.length, ids: [] };
    }
    if (q === SQL.rename) {
      unique(p("name"), p("id"));
      const hit = this.rows.Ingredient.filter((r) => r.id === p("id"));
      for (const r of hit) r.name = p("name");
      return { rowsAffected: hit.length, ids: [] };
    }
    if (q === SQL.insert) {
      unique(p("name"), null);
      const id = Math.max(0, ...this.rows.Ingredient.map((r) => Number(r.id))) + 1;
      this.rows.Ingredient.push({ id, name: p("name"), category: null, defaultUnitId: null });
      return { rowsAffected: 1, ids: [id] };
    }
    if (q === SQL.delete) {
      const before = this.rows.Ingredient.length;
      this.rows.Ingredient = this.rows.Ingredient.filter((r) => r.id !== p("id"));
      return { rowsAffected: before - this.rows.Ingredient.length, ids: [] };
    }
    if (q === SQL.reinsert) {
      unique(p("name"), null);
      this.rows.Ingredient.push({ id: p("id"), name: p("name"), category: p("category"), defaultUnitId: p("defaultUnitId") });
      this.rows.Ingredient.sort((a, b) => Number(a.id) - Number(b.id));
      return { rowsAffected: 1, ids: [] };
    }
    throw new Error(`FakeDb: unknown write ${q}`);
  }
}

// The fixture with a line for every rule the owner decided.
function testSnapshot(): Snapshot {
  const snap = fixture();
  const unitId = (name: string) => snap.units.find((u) => u.name === name)!.id;
  const recipe = (name: string) => {
    let r = snap.recipes.find((x) => x.name === name);
    if (!r) {
      r = { id: Math.max(...snap.recipes.map((x) => x.id)) + 1, householdId: 1, name };
      snap.recipes.push(r);
    }
    return r.id;
  };
  const ingredient = (name: string, id?: number) => {
    const found = snap.ingredients.find((i) => i.name === name);
    if (found) return found.id;
    const row = { id: id ?? Math.max(...snap.ingredients.map((i) => i.id)) + 1, name };
    snap.ingredients.push(row);
    return row.id;
  };
  let nextLine = 5000;
  const add = (recipeName: string, quantity: number, unit: string, name: string, notes: string | null = null, id?: number) => {
    snap.recipeLines.push({ id: id ?? nextLine++, recipeId: recipe(recipeName), ingredientId: ingredient(name), quantity, unitId: unitId(unit), notes });
  };
  add("Butter Cake", 2, "teaspoon", "cup(s) (2 sticks) butter", "softened", 6001);
  add("Butter Cake", 1, "tablespoon", "teaspoon(s) baking powder", null, 6002);
  add("Butter Cake", 0.5, "each", "- 1 stick of butter", "1/4-1/2 cup", 6003);
  add("Ricotta Bake", 15, "ounce", "container(s) (15-ounce) whole-milk ricotta cheese", null, 6004);
  add("Fried Rice", 1, "cup", "cooked rice", "cooked, day-old", 6005);
  add("Sour Cream Dip", 1, "each", "-16 oz sour cream", null, 6006);
  add("Chicken Bake", 8, "each", "-6 chicken breasts", "skinned", 6007);
  add("Chicken Bake", 4, "each", "-6 chicken breasts", null, 6008);
  // '" of oil' with an "oil" row, as in the live data: it asks which oil.
  ingredient("oil");
  add("Oil Cake", 0.5, "each", '" of oil', null, 6009);
  // A second line on the "1/2 of a 10 oz pkg?" row that would be approved
  // on its own. The row keeps an open question, so it stays too.
  add("Cookies", 1, "each", "-10-oz. pkg. REESE'S Peanut Butter Chips", null, 6010);
  ingredient("+ tsp yeast in cup lukewarm water with 1 Tbs sugar", 453);
  add("Bread", 1.5, "tablespoon", "+ tsp yeast in cup lukewarm water with 1 Tbs sugar", null, 6011);
  const garlic = snap.ingredients.find((i) => i.name === "garlic")!;
  garlic.name = "garlic,";
  return snap;
}

async function selfTest(out: string | undefined): Promise<number> {
  let failures = 0;
  const check = (label: string, ok: boolean, detail?: unknown) => {
    if (!ok) failures++;
    console.log(`  ${ok ? "ok  " : "FAIL"} ${label}`);
    if (!ok && detail !== undefined) console.log(`      got ${JSON.stringify(detail)}`);
  };
  const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

  console.log("Question kinds:");
  for (const [q, kinds, ok] of [
    ["Amount would change from 4 each to 6 each. OK?", ["amount_change"], true],
    ['"-5" before the name looks like the end of a range whose start was lost. Kept 2 pound. Check the source recipe.', ["lost_range_start"], true],
    ['Read "1 -1/4" as 1 1/4 cups? Kept 1.25 cup. Check the source recipe.', ["mixed_number"], true],
    ['Read "1 -16 oz" as one 16 oz container? Kept 16 ounce. Check the source recipe.', ["parser_doubt"], false],
    ["Is it 1/2 of a 10 oz pkg? Kept 0.5 package. Check the source recipe.", ["parser_doubt"], false],
    ['Amount would change from 1 each to 1 can. OK? Treat "tomato sauce" as "tomatoe sauce"?', ["amount_change", "spelling"], true],
    ['Saved as 2 teaspoon, but the name says "cup" and 1 stick = 0.5 cup. Use 0.5 cup?', ["stick_butter"], true],
    ['Saved as 1 tablespoon, but the name starts with "teaspoon". Which unit is right, and what amount?', ["unit_from_name"], true],
    ['Saved as 1.5 tablespoon, but the name says "teaspoon". Which unit is right?', ["unit_from_read"], true],
    ['Saved as 2 each, but the name says "1 cup". Which amount is right?', ["amount_from_name"], true],
    ["Saved as 36 ounce, but the name says a 28 oz container. Which amount is right?", ["container_amount"], true],
    ['Saved name ends in "boneless"; a fresh import reads it as "boneless chicken". OK?', ["boneless_order"], true],
    ['Saved name ends in "frozen"; a fresh import reads it as "frozen peas". OK?', ["boneless_order"], false],
    ['"large or 40 small tomatoes" holds two amounts. Keep 20 large and note "or 40 small"?', ["two_amounts"], true],
    ["Name was '\" of oil'. Which oil?", ["lost_amount"], false],
    ['"A, b, c" lists several items. Split it into one line each, or which ingredient is it?', ["several_items"], false],
    ["This line points to another recipe. Keep it as written?", ["recipe_reference"], false],
    ['Row "(8 oz) pkg cheese*" has more than one likely target or an open question. Confirm cheese (new). Recipe lines for "(8 oz) pkg cheese*" change unit. Change this each too?', ["row_open", "unit_follow"], false],
    ['The quantity may mix "garlic parmesan breading" from other recipes. Repoint, split, or regenerate the list?', ["grocery_mix"], false],
    ['No "garlic" row exists. Create it for this line?', ["create_missing"], false],
    ['Did this line say "penne pasta" rather than "uncooked penne pasta"? Check the source recipe.', ["source_check"], false],
    ["Something new?", ["unknown"], false],
  ] as [string, Kind[], boolean][]) {
    const parts = questionParts(q);
    check(`${JSON.stringify(q.slice(0, 60))} -> ${kinds.join(" + ")} (${ok ? "approve" : "skip"})`, same(parts.map((p) => p.kind), kinds) && parts.every(approves) === ok, parts.map((p) => p.kind));
  }

  console.log("\nHelpers:");
  check("range low end of 4 to 6", same(rangeLow("4 to 6, cooked", 6), { low: 4, high: 6, word: "" }));
  check("range low end of 1/2 to 1 bunch", same(rangeLow("1/2 to 1 bunch, washed", 1), { low: 0.5, high: 1, word: "bunch" }));
  check("no range low end when the top is not the amount", rangeLow("4 to 6", 4) === null);
  check("range start 4 in '4-5 breasts'", rangeStartIn("about 4-5 breasts", 5) === 4);
  check("no range start in 'skinned'", rangeStartIn("-6 chicken breasts skinned", 6) === null);
  check("cooked not added twice", addNoteParts("Cooked, day-old", ["cooked"]) === "Cooked, day-old");
  check("cooked and shredded go to the front", addNoteParts("for tacos", ["cooked", "shredded"]) === "cooked, shredded, for tacos");
  check("shredded not added to 'shredded or cut'", addNoteParts("shredded or cut into bite-size pieces", ["cooked", "shredded"]) === "cooked, shredded or cut into bite-size pieces");
  const lookup = makeUnitLookup(fixture().units) as UnitLookup;
  check("15-ounce reads as 15 ounce", readMeasure("15-ounce", lookup)?.unit.name === "ounce" && readMeasure("15-ounce", lookup)?.quantity === 15);
  check("28 oz reads as 28 ounce", readMeasure("28 oz", lookup)?.quantity === 28);
  check("a count is not a measure", readMeasure("3 large", lookup) === null);
  check("delete with no references", deleteDecision({ RecipeIngredient: 0, GroceryListItem: 0 }).deletable);
  check("no delete with a grocery reference", !deleteDecision({ RecipeIngredient: 0, GroceryListItem: 2 }).deletable && /GroceryListItem 2/.test(deleteDecision({ GroceryListItem: 2 }).reason));

  console.log("\nUnique names:");
  const rows = [{ id: 1, name: "garlic" }, { id: 2, name: "Onion" }, { id: 3, name: "garlic," }, { id: 4, name: "rice*" }, { id: 5, name: "nuts " }];
  const r = resolveNames(rows, new Map([[3, "garlic"], [4, "rice"]]), ["onion", "ONION ", "celery", "celery", "carrots", "carrot", "Nuts"], (id) => id !== 5);
  check('rename to a clean row\'s name repoints there', r.redirected.get(3) === 1 && !r.renamed.has(3));
  check("free rename goes ahead", r.renamed.get(4) === "rice");
  check('create "onion" uses existing "Onion"', same(r.createTo.get("onion"), { id: 2 }) && same(r.createTo.get("ONION "), { id: 2 }));
  check("two creates of one name are one insert", same(r.createTo.get("celery"), { insert: "celery" }) && [...r.createTo.values()].filter((v) => "insert" in v && v.insert === "celery").length === 1);
  check('"carrots" and "carrot" are one insert', same(r.createTo.get("carrot"), { insert: "carrots" }));
  check("a create on a row being cleaned is skipped", "skip" in (r.createTo.get("Nuts") ?? {}));
  const both = resolveNames([{ id: 1, name: "a," }, { id: 2, name: "a." }], new Map([[1, "a"], [2, "a"]]), [], () => false);
  check("second rename to the same name is skipped", both.renamed.get(1) === "a" && both.renameSkips.has(2));

  console.log("\nPlan from the fixture:");
  const snap = testSnapshot();
  const report = analyze(snap, new Date("2026-10-26T12:00:00Z"));
  const plan = buildPlan(snap, report);
  const lineStep = (id: number) => plan.steps.find((s) => s.kind === "update" && s.table === "RecipeIngredient" && s.rowId === id);
  const lineOf = (recipe: string, name: string) => snap.recipeLines.find((l) => snap.recipes.find((x) => x.id === l.recipeId)?.name === recipe && snap.ingredients.find((i) => i.id === l.ingredientId)?.name === name)!;
  const stepFor = (recipe: string, name: string) => lineStep(lineOf(recipe, name).id);
  const skipFor = (recipe: string, name: string) => plan.skipped.find((s) => s.table === "RecipeIngredient" && s.rowId === lineOf(recipe, name).id);
  const shown = (s: Step | undefined) => (s ? [s.after!.quantity, snap.units.find((u) => u.id === s.after!.unitId)?.name, s.afterText.split(" | ")[1], s.after!.notes] : null);
  const idOf = (name: string) => snap.ingredients.find((i) => i.name === name)!.id;

  check("no step on a grocery, inventory or price row", plan.steps.every((s) => (WRITE_TABLES as readonly string[]).includes(s.table)));
  check("every grocery list proposal is skipped", report.proposals.filter((x) => x.table === "GroceryListItem").every((x) => plan.skipped.some((s) => s.table === "GroceryListItem" && s.rowId === x.rowId && s.rule === "skip:grocery_list_item")));
  check("inventory proposal is skipped", plan.skipped.some((s) => s.table === "InventoryItem" && s.rule === "skip:inventory_item"));
  check("recipe reference is skipped", !!skipFor("Apple Pie", "Your Favorite Pie Crust Recipe - you will need 2 crusts") && skipFor("Apple Pie", "Your Favorite Pie Crust Recipe - you will need 2 crusts")!.rule === "skip:recipe_reference");
  check("non-ambiguous line is applied", same(shown(stepFor("Potato Soup", "green onions - chopped")), [4, "each", "green onions (new)", "chopped"]));
  const garlicId = idOf("garlic,");
  check('"garlic," is renamed to "garlic"', plan.steps.some((s) => s.table === "Ingredient" && s.rowId === garlicId && s.after!.name === "garlic" && s.rules.includes("approve:garlic")));
  check(`garlic clove lines point to #${garlicId}`, plan.garlic.lines >= 4 && plan.garlic.target === `garlic (#${garlicId})` && stepFor("Alfredo", "garlic parmesan breading")?.after!.ingredientId === garlicId, plan.garlic);
  check("garlic parmesan breading line itself stays", !stepFor("Garlic Parmesan Chicken", "garlic parmesan breading"));
  check("amount change with a range uses the low end", same(shown(stepFor("Cookies", "-4 T. milk")), [2, "tablespoon", "milk (new)", "2 to 4 tbsp, for frosting"]) && stepFor("Cookies", "-4 T. milk")!.rules.includes("approve:range_low_end"));
  check("-6 chicken breasts at 4 each keeps 4, note 4 to 6", same(shown(lineStep(6008)), [4, "each", `Chicken Breast (#${idOf("Chicken Breast")})`, "4 to 6"]));
  check("lost range start keeps the stored amount", same(shown(lineStep(6007)), [8, "each", `Chicken Breast (#${idOf("Chicken Breast")})`, "-6 (range start lost), skinned"]) && lineStep(6007)!.rules.some((x) => /kept the stored amount/.test(x)));
  check("lost range start in pounds keeps 2 pound", same(shown(stepFor("Chicken Parmesan Bake", "-5 chicken breasts cut in pieces or 12-ish chicken tenders")), [2, "pound", `Chicken Breast (#${idOf("Chicken Breast")})`, "-5 (range start lost), cut in pieces or 12-ish chicken tenders"]));
  check("mixed number read is applied", same(shown(stepFor("Meatloaf", "-1/2 lbs. ground beef")), [1.5, "pound", `ground beef (#${idOf("ground beef")})`, null]));
  check("stick butter: 2 sticks saved as 2 teaspoon -> 1 cup butter", same(shown(lineStep(6001)), [1, "cup", `butter (#${idOf("butter")})`, "2 sticks, softened"]));
  check("stick butter: 1 stick saved as 1.5 teaspoon -> 0.5 cup", same(shown(stepFor("Biscuits", "cup(s) (1 stick) unsalted butter")), [0.5, "cup", "unsalted butter (new)", "1 stick"]));
  check("1/2 to 1 stick each -> 1/4 cup butter", same(shown(lineStep(6003)), [0.25, "cup", `butter (#${idOf("butter")})`, "1/2 to 1 stick, 1/4-1/2 cup"]), shown(lineStep(6003)));
  check("unit from the name: 1 tablespoon -> 1 teaspoon baking powder", same(shown(lineStep(6002)), [1, "teaspoon", `baking powder (#${idOf("baking powder")})`, null]));
  check("container size from the name: 15 ounce ricotta, note 15-ounce container", same(shown(lineStep(6004)), [15, "ounce", "whole-milk ricotta cheese (new)", "15-ounce container"]), shown(lineStep(6004)));
  check("amount in the name: (1 cup butter) -> 1 cup butter", same(shown(stepFor("Cookies", "(1 cup butter)")), [1, "cup", `butter (#${idOf("butter")})`, null]));
  check("container amount: 36 ounce -> 28 ounce crushed tomatoes", same(shown(stepFor("Stuffed Shells", "(28 oz) can crushed tomatoes")), [28, "ounce", "crushed tomatoes (new)", "28 oz can"]));
  check("chicken boneless -> boneless chicken", same(shown(stepFor("Chicken Tikka Masala Recipe", "(700 grams) chicken boneless")), [1.5, "pound", "boneless chicken (new)", "700 grams, Preferably thighs, or breasts"]));
  check("two amounts keeps 20 each, note has the other", same(shown(stepFor("Tomato Sauce", "large or 40 small tomatoes")), [20, "each", "tomatoes (new)", "large or 40 small"]));
  check("spelling match is applied", same(shown(stepFor("Pizza", "shredded mozarella")), [2, "cup", `mozzarella (#${idOf("mozzarella")})`, "shredded, the kind shaped like a ball"]));
  check("parser doubt (1/2 of a pkg) is skipped", skipFor("Cookies", "-10-oz. pkg. REESE'S Peanut Butter Chips")?.rule === "skip:open_question");
  check("one 16 oz container doubt is skipped", skipFor("Sour Cream Dip", "-16 oz sour cream")?.rule === "skip:open_question");
  check("several items is skipped", skipFor("Tacos", "Tortilla chips or strips, monterrey jack cheese, sliced avocado")?.rule === "skip:open_question");
  check('"Did this line say" is skipped', skipFor("Chicken Penne", "uncooked penne pasta")?.rule === "skip:open_question");
  check('messy row \'" of oil\': the line is skipped', plan.skipped.some((s) => s.rowId === 6009 && s.rule === "skip:messy_row"));
  check("messy row is not deleted", !plan.steps.some((s) => s.kind === "delete" && s.rowId === idOf('" of oil')) && plan.deleteChecks.some((c) => c.id === idOf('" of oil') && !c.deletable));
  check("a line on a row with an open question stays", !lineStep(6010) && plan.skipped.some((s) => s.rowId === 6010 && s.rule === "skip:open_row"), plan.skipped.filter((s) => s.rowId === 6010));
  check("yeast row is renamed to yeast", plan.steps.some((s) => s.table === "Ingredient" && s.rowId === 453 && s.after!.name === "yeast" && s.rules.includes("approve:yeast")));
  check("yeast line note holds the rest", same(shown(lineStep(6011)), [1.5, "tablespoon", "yeast (#453)", "+ tsp, in cup lukewarm water, with 1 Tbs sugar"]), shown(lineStep(6011)));

  console.log("\nCooked X:");
  check("cooked rice -> rice, note cooked", same(shown(stepFor("Fried Rice", "cooked rice")), [4, "cup", `rice (#${idOf("rice")})`, "cooked"]));
  check("cooked rice, Chilled -> note cooked, Chilled", same(shown(stepFor("Rice Pudding", "cooked rice")), [1, "cup", `rice (#${idOf("rice")})`, "cooked, Chilled"]));
  check('"cooked" not doubled in "cooked, day-old"', same(shown(lineStep(6005)), [1, "cup", `rice (#${idOf("rice")})`, "cooked, day-old"]));
  check("Cooked white rice -> white rice", same(shown(stepFor("Burrito Bowl", "Cooked white rice")), [2.5, "cup", `white rice (#${idOf("white rice")})`, "cooked, Shredded Chicken"]));
  check("cooked and shredded chicken -> chicken, note cooked, shredded", same(shown(stepFor("Enchiladas", "cooked and shredded chicken")), [2, "cup", "chicken (new)", "cooked, shredded"]));
  check("cooked shredded chicken -> the same new chicken", same(shown(stepFor("Enchiladas", "cooked shredded chicken")), [2, "cup", "chicken (new)", "cooked, shredded"]));
  check('one insert for "chicken"', plan.steps.filter((s) => s.kind === "insert" && s.after!.name === "chicken").length === 1);
  check("cooked chicken breasts -> Chicken Breast", same(shown(stepFor("Chicken Tortilla Soup", "cooked chicken breasts")), [2, "cup", `Chicken Breast (#${idOf("Chicken Breast")})`, "cooked, shredded or cut into bite-size pieces"]));
  check("cooked and cubed chicken breast -> note cooked, cubed", same(shown(stepFor("Pot Pie", "cooked and cubed chicken breast")), [2, "cup", `Chicken Breast (#${idOf("Chicken Breast")})`, "cooked, cubed"]));
  check("rotisserie chicken line -> chicken, note keeps rotisserie", same(shown(stepFor("Chicken Pot Pie", "shredded cooked rotisserie or left-over chicken*")), [2.5, "cup", "chicken (new)", "cooked, shredded, rotisserie or left-over"]), shown(stepFor("Chicken Pot Pie", "shredded cooked rotisserie or left-over chicken*")));
  check("cooked ham (amount change) -> ham", same(shown(stepFor("Ham Casserole", "(or so) cup cooked ham")), [1, "cup", "ham (new)", "cooked, or so, diced"]));
  check("cooked rows are deleted", ["cooked rice", "Cooked white rice", "cooked and shredded chicken", "cooked chicken breasts"].every((n) => plan.steps.some((s) => s.kind === "delete" && s.rowId === idOf(n))));
  check("no cooked target left", !plan.steps.some((s) => s.kind === "update" && s.table !== "Ingredient" && /\| cooked /i.test(` | ${s.afterText.split(" | ")[1]}`)));

  console.log("\nDeletes:");
  check("a row with a grocery reference is kept", plan.deleteChecks.some((c) => c.name === "(700 grams) chicken boneless" && !c.deletable && c.refsAfter.GroceryListItem === 1));
  check("an emptied junk row is deleted", plan.steps.some((s) => s.kind === "delete" && s.before!.name === "green onions - chopped"));
  check("a renamed row is not deleted", !plan.steps.some((s) => s.kind === "delete" && s.rowId === garlicId));
  check("inserts come before line updates, deletes last", plan.steps.findIndex((s) => s.kind === "insert") < plan.steps.findIndex((s) => s.kind === "update" && s.table !== "Ingredient") && plan.steps.findIndex((s) => s.kind === "delete") > plan.steps.findLastIndex((s) => s.kind === "update"));
  const uniqueInserts = new Set(plan.steps.filter((s) => s.kind === "insert").map((s) => nameKey(String(s.after!.name))));
  check("no two inserts share a name", uniqueInserts.size === plan.counts.inserts);
  check("no insert takes an existing name", plan.steps.filter((s) => s.kind === "insert").every((s) => !snap.ingredients.some((i) => nameKey(i.name) === nameKey(String(s.after!.name)))));

  console.log("\nApproved respellings:");
  // "tomatoe sauce" (#420) and "celery stocks" (#557) are renamed; lines
  // naming either spelling point at them, and no "celery" is created.
  const respellSnap = (extra: { id: number; name: string }[] = []) => {
    const s = testSnapshot();
    const unit = (name: string) => s.units.find((u) => u.name === name)!.id;
    const soup = s.recipes[0].id;
    s.ingredients.push({ id: 420, name: "tomatoe sauce" }, { id: 557, name: "celery stocks" }, { id: 880, name: "(8-oz) can tomato sauce" }, { id: 749, name: "-5 celery sticks" }, { id: 653, name: "chopped celery" }, ...extra);
    s.recipeLines.push(
      { id: 7420, recipeId: soup, ingredientId: 420, quantity: 1, unitId: unit("can"), notes: null },
      { id: 7880, recipeId: soup, ingredientId: 880, quantity: 1, unitId: unit("each"), notes: null },
      { id: 7557, recipeId: soup, ingredientId: 557, quantity: 2, unitId: unit("each"), notes: "chopped" },
      { id: 7749, recipeId: soup, ingredientId: 749, quantity: 4, unitId: unit("each"), notes: null },
      { id: 7653, recipeId: soup, ingredientId: 653, quantity: 1, unitId: unit("cup"), notes: null },
    );
    // In id order, as the undo's reinsert leaves them.
    s.ingredients.sort((a, b) => a.id - b.id);
    return s;
  };
  const rsnap = respellSnap();
  const rplan = buildPlan(rsnap, analyze(rsnap, new Date("2026-10-26T12:00:00Z")));
  const rline = (p: Plan, id: number) => p.steps.find((s) => s.kind === "update" && s.table === "RecipeIngredient" && s.rowId === id);
  const rshown = (s: Step | undefined) => (s ? [s.after!.quantity, rsnap.units.find((u) => u.id === s.after!.unitId)?.name, s.afterText.split(" | ")[1], s.after!.notes] : null);
  const renameStep = (p: Plan, id: number) => p.steps.find((s) => s.kind === "update" && s.table === "Ingredient" && s.rowId === id);
  check('#420 "tomatoe sauce" -> "tomato sauce", before and after in the plan', same([renameStep(rplan, 420)?.before, renameStep(rplan, 420)?.after, renameStep(rplan, 420)?.rules], [{ name: "tomatoe sauce" }, { name: "tomato sauce" }, ["approve:spelling_rename"]]));
  check('#557 "celery stocks" -> "celery"', same([renameStep(rplan, 557)?.before, renameStep(rplan, 557)?.after], [{ name: "celery stocks" }, { name: "celery" }]));
  check("tomato sauce line -> #420", same(rshown(rline(rplan, 7880)), [1, "can", "tomato sauce (#420)", "8-oz"]), rshown(rline(rplan, 7880)));
  check("a line on #420 is not touched", !rline(rplan, 7420));
  check('a line on #557 stays, "sticks" in the note', same(rshown(rline(rplan, 7557)), [2, "each", "celery (#557)", "sticks, chopped"]), rshown(rline(rplan, 7557)));
  check('-5 celery sticks -> 4 celery (#557), note "4 to 5, sticks"', same(rshown(rline(rplan, 7749)), [4, "each", "celery (#557)", "4 to 5, sticks"]), rshown(rline(rplan, 7749)));
  check("chopped celery -> #557", same(rshown(rline(rplan, 7653)), [1, "cup", "celery (#557)", "chopped"]), rshown(rline(rplan, 7653)));
  check('no "celery" or "tomato sauce" insert', !rplan.steps.some((s) => s.kind === "insert" && ["celery", "tomato sauce", "celery sticks"].includes(nameKey(String(s.after!.name)))));
  check("#420 and #557 are kept", !rplan.steps.some((s) => s.kind === "delete" && (s.rowId === 420 || s.rowId === 557)));
  const rfake = new FakeDb(rsnap);
  const roriginal = rfake.dump();
  const rlogPath = join(mkdtempSync(join(tmpdir(), "mlk-respell-test-")), "undo.json");
  rfake.begin();
  const rlog = await applyPlan(rfake, rplan, { logPath: rlogPath, expect: rplan.counts });
  rfake.commit();
  check("renames run with no duplicate name", rfake.rows.Ingredient.filter((r) => r.name === "celery").length === 1 && rfake.rows.Ingredient.find((r) => r.id === 420)?.name === "tomato sauce");
  check("undo log has the renames with before and after", same(rlog.entries.filter((e) => e.table === "Ingredient" && e.kind === "update" && (e.id === 420 || e.id === 557)).map((e) => [e.id, e.before, e.after]), [[420, { name: "tomatoe sauce" }, { name: "tomato sauce" }], [557, { name: "celery stocks" }, { name: "celery" }]]));
  rfake.begin();
  await undoLog(rfake, { ...rlog, status: "committed" });
  rfake.commit();
  check("undo puts the old names back", rfake.dump() === roriginal);
  // With a "celery" row already there, #557 is not renamed: its lines and
  // the celery lines go to that row, and #557 goes.
  const csnap = respellSnap([{ id: 901, name: "celery" }]);
  const cplan = buildPlan(csnap, analyze(csnap, new Date("2026-10-26T12:00:00Z")));
  check("respelling onto a taken name: #557 is not renamed", !renameStep(cplan, 557));
  check("its lines go to the existing celery row", [7557, 7749, 7653].every((id) => rline(cplan, id)?.after!.ingredientId === 901));
  check("and #557 is deleted", cplan.steps.some((s) => s.kind === "delete" && s.rowId === 557));

  console.log("\nWrite guard:");
  for (const good of [SQL.updateLine("RecipeIngredient"), SQL.updateLine("LibraryRecipeIngredient"), SQL.rename, SQL.insert, SQL.delete]) {
    check(`allows ${good.slice(0, 50)}`, (() => { try { writeOnly(good); return true; } catch { return false; } })());
  }
  for (const bad of [
    "UPDATE [GroceryListItem] SET ingredientId = @ingredientId WHERE id = @id",
    "UPDATE [InventoryItem] SET ingredientId = 1 WHERE id = 1",
    "DELETE FROM [StorePrice] WHERE id = @id",
    "DELETE FROM [Ingredient] WHERE id = @id; DELETE FROM [Ingredient]",
    "UPDATE [Ingredient] SET name = (SELECT name FROM [Unit]) WHERE id = 1",
    "INSERT INTO [Ingredient] (name) SELECT name FROM [Ingredient]",
    "DROP TABLE [Ingredient]",
    "MERGE [Ingredient] USING x ON 1=1 WHEN MATCHED THEN DELETE",
    SQL.reinsert,
  ]) {
    check(`rejects ${JSON.stringify(bad.slice(0, 60))}`, (() => { try { writeOnly(bad); return false; } catch { return true; } })());
  }
  for (const read of [SQL.readLine("RecipeIngredient"), SQL.readIngredient, SQL.findName, SQL.countIngredients, SQL.countRefs("GroceryListItem", "ingredientId"), SQL.groupRefs("X", "ingredientId"), SQL.foreignKeys, SQL.idColumns]) {
    check(`read guard allows ${read.slice(0, 50)}`, (() => { try { selectOnly(read); return true; } catch { return false; } })());
  }
  check("the reinsert is allowed only for undo", (() => { try { writeOnly(SQL.reinsert, true); return true; } catch { return false; } })());

  console.log("\nApply and undo (in memory):");
  const dir = mkdtempSync(join(tmpdir(), "mlk-apply-test-"));
  const fake = new FakeDb(snap);
  const original = fake.dump();
  const logPath = join(dir, "undo.json");
  fake.begin();
  const log = await applyPlan(fake, plan, { logPath, expect: plan.counts });
  fake.commit();
  log.status = "committed";
  writeLog(logPath, log);
  const saved = JSON.parse(readFileSync(logPath, "utf8")) as UndoLog;
  check("undo log is on disk with every entry", saved.entries.length === plan.steps.length && saved.status === "committed");
  check("executed counts equal the plan", same(saved.executed, plan.counts));
  check("log keeps whole deleted rows", saved.entries.filter((e) => e.kind === "delete").every((e) => e.before && "category" in e.before && "defaultUnitId" in e.before));
  check("log keeps inserted ids", saved.entries.filter((e) => e.kind === "insert").every((e) => typeof e.id === "number" && e.id > 0));
  const rice = fake.rows.RecipeIngredient.find((r) => r.id === lineOf("Fried Rice", "cooked rice").id)!;
  check("database holds the plan's values", rice.ingredientId === idOf("rice") && rice.notes === "cooked");
  check("no grocery, inventory or price row changed", same(JSON.parse(original).GroceryListItem, fake.rows.GroceryListItem) && same(JSON.parse(original).InventoryItem, fake.rows.InventoryItem));
  fake.begin();
  const undone = await undoLog(fake, saved);
  fake.commit();
  check(`undo reverts all ${undone} entries to the original rows`, fake.dump() === original);
  check("undo refuses a log that is not committed", await (async () => { try { await undoLog(fake, { ...saved, status: "rolled back" }); return false; } catch { return true; } })());

  // A row changed after the plan: the apply stops and rolls back.
  const drift = new FakeDb(snap);
  const driftLine = drift.rows.RecipeIngredient.find((x) => x.id === lineOf("Fried Rice", "cooked rice").id)!;
  driftLine.notes = "changed by someone";
  const driftBefore = drift.dump();
  drift.begin();
  const driftError = await applyPlan(drift, plan, { logPath: join(dir, "drift.json") }).then(() => "", (e: Error) => e.message);
  drift.rollback();
  check("a changed row stops the apply", /notes is "changed by someone"/.test(driftError), driftError);
  check("and nothing is kept", drift.dump() === driftBefore);
  check("an existing undo log is never overwritten", await applyPlan(new FakeDb(snap), plan, { logPath }).then(() => false, () => true));
  check("--expect-counts that differ stop the apply", /expect-counts/.test(await applyPlan(new FakeDb(snap), plan, { logPath: join(dir, "expect.json"), expect: { ...plan.counts, deletes: plan.counts.deletes + 1 } }).then(() => "", (e: Error) => e.message)));

  // A reference added after the plan: the re-check keeps that row.
  const late = new FakeDb(snap);
  const victim = plan.steps.find((s) => s.kind === "delete")!;
  late.rows.InventoryItem.push({ id: 999, ingredientId: victim.rowId });
  late.begin();
  const lateLog = await applyPlan(late, plan, { logPath: join(dir, "late.json") });
  late.commit();
  check("delete re-check keeps a row with a new reference", lateLog.skippedDeletes.some((d) => d.id === victim.rowId && d.refs["InventoryItem.ingredientId"] === 1) && late.rows.Ingredient.some((r) => r.id === victim.rowId));
  check("and with --expect-counts that is a mismatch", /re-check/.test(await (async () => {
    const again = new FakeDb(snap);
    again.rows.InventoryItem.push({ id: 999, ingredientId: victim.rowId });
    again.begin();
    return applyPlan(again, plan, { logPath: join(dir, "late2.json"), expect: plan.counts }).then(() => "", (e: Error) => e.message);
  })()));

  console.log("\nOutput:");
  const meta = { mode: "self-test, dry run", isolation: "n/a", generated: "self-test" };
  const md = summaryMd(plan, meta);
  check("summary states dry run", md.includes("Dry run: nothing was written"));
  check("summary has every sample", ["Yeast", "Garlic", "Cooked merge", "Stick butter", "Range, low end", "Unit or amount from the name"].every((t) => md.includes(`### ${t}\n\n- `)));
  const files = planCsv(plan) + skippedCsv(plan) + md + JSON.stringify(plan);
  check("no em dashes in output", !/\u2014/.test(files));

  console.log("\nCounts:");
  console.log(`  updates ${plan.counts.updates}, inserts ${plan.counts.inserts}, deletes ${plan.counts.deletes}, skipped ${plan.skipped.length}`);
  if (out) for (const path of writePlan(plan, resolve(out), meta)) console.log(path);
  console.log(failures ? `\n${failures} check(s) failed.` : "\nAll checks passed.");
  return failures ? 1 : 0;
}

// ─── Main ───────────────────────────────────────────────────────

const USAGE = [
  "Usage:",
  "  npx tsx scripts/cleanup-ingredients-apply.ts --out <dir>                       dry run",
  "  npx tsx scripts/cleanup-ingredients-apply.ts --out <dir> --apply --undo-log <file> [--expect-counts U,I,D]",
  "  npx tsx scripts/cleanup-ingredients-apply.ts --undo <undo-log>",
  "  npx tsx scripts/cleanup-ingredients-apply.ts --self-test [--out <dir>]",
  "  npx tsx scripts/cleanup-ingredients-apply.ts --from-csv <proposed-changes.csv> --out <dir>",
].join("\n");

function parseCounts(value: string | undefined) {
  const m = (value ?? "").match(/^\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*$/);
  if (!m) throw new Error('--expect-counts must be "<updates>,<inserts>,<deletes>"');
  return { updates: Number(m[1]), inserts: Number(m[2]), deletes: Number(m[3]) };
}

function printPlan(plan: Plan, paths: string[]) {
  console.log(`updates ${plan.counts.updates}, inserts ${plan.counts.inserts}, deletes ${plan.counts.deletes}, skipped ${plan.skipped.length}`);
  for (const path of paths) console.log(path);
}

async function main() {
  const args = process.argv.slice(2);
  const value = (flag: string) => {
    const i = args.indexOf(flag);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const out = value("--out");
  if (args.includes("--self-test")) {
    process.exitCode = await selfTest(out);
    return;
  }
  const csv = value("--from-csv");
  if (csv) {
    if (!out) throw new Error(USAGE);
    const snapshot = snapshotFromCsv(resolve(csv));
    const plan = buildPlan(snapshot, analyze(snapshot, new Date()));
    const meta = { mode: `offline dry run, rebuilt from ${resolve(csv)}`, isolation: "n/a (no database)", generated: new Date().toISOString() };
    printPlan(plan, writePlan(plan, resolve(out), meta));
    return;
  }

  const undoPath = value("--undo");
  if (undoPath) {
    if (args.includes("--apply")) throw new Error("--undo and --apply cannot be used together");
    const path = resolve(undoPath);
    const log = JSON.parse(readFileSync(path, "utf8")) as UndoLog;
    try {
      const n = await withTransaction(true, async (db) => ({ commit: true, value: await undoLog(db, log) }));
      log.status = "undone";
      writeLog(path, log);
      console.log(`Undone: ${n} entries reverted. Log marked "undone".`);
    } catch (err) {
      log.status = "undo rolled back";
      log.error = err instanceof Error ? err.message : String(err);
      writeLog(path, log);
      throw err;
    }
    return;
  }

  if (!out) {
    console.error(USAGE);
    process.exitCode = 2;
    return;
  }
  const apply = args.includes("--apply");
  if (!apply) {
    if (args.includes("--undo-log") || args.includes("--expect-counts")) throw new Error("--undo-log and --expect-counts need --apply");
    const { plan, isolation } = await withTransaction(false, async (db, level) => ({ commit: false, value: { ...(await readPlan(db)), isolation: level } }));
    printPlan(plan, writePlan(plan, resolve(out), { mode: "live dry run, read only", isolation, generated: new Date().toISOString() }));
    return;
  }

  const logArg = value("--undo-log");
  if (!logArg) throw new Error("--apply needs --undo-log <file>");
  const logPath = resolve(logArg);
  if (existsSync(logPath)) throw new Error(`Undo log ${logPath} already exists; choose a new path`);
  const expect = args.includes("--expect-counts") ? parseCounts(value("--expect-counts")) : undefined;
  try {
    const log = await withTransaction(true, async (db, isolation) => {
      const { plan } = await readPlan(db);
      printPlan(plan, writePlan(plan, resolve(out), { mode: "live apply", isolation, generated: new Date().toISOString() }));
      return { commit: true, value: await applyPlan(db, plan, { logPath, expect }) };
    });
    log.status = "committed";
    writeLog(logPath, log);
    console.log(`Committed: ${log.executed.updates} updates, ${log.executed.inserts} inserts, ${log.executed.deletes} deletes.`);
    for (const d of log.skippedDeletes) console.log(`Delete of #${d.id} skipped by the re-check: ${JSON.stringify(d.refs)}`);
    console.log(`Undo log: ${logPath}`);
  } catch (err) {
    if (existsSync(logPath)) {
      const log = JSON.parse(readFileSync(logPath, "utf8")) as UndoLog;
      log.status = "rolled back";
      log.error = err instanceof Error ? err.message : String(err);
      writeLog(logPath, log);
    }
    throw err;
  }
}

if (/^cleanup-ingredients-apply(?:\.ts)?$/.test(basename(process.argv[1] ?? ""))) {
  main().catch((err: unknown) => {
    // The message only; the config holding the password is never printed.
    console.error(`Failed: ${err instanceof Error ? err.message : String(err)}`);
    process.exitCode = 1;
  });
}
