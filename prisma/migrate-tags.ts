import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client.js";
import { PrismaMssql } from "@prisma/adapter-mssql";

// One-time migration to move from a single global tag table to scoped
// categories: standard categories (householdId = null) plus per-household
// custom categories. It also prunes obvious junk left behind by the Blogger
// import (author/metadata labels, orphans).
//
// Safe by default: prints the plan without changing anything. Re-run with
// APPLY=1 to commit. Add extra junk labels with JUNK_EXTRA="Label A,Label B".
//
//   npx tsx prisma/migrate-tags.ts            # dry run (report only)
//   APPLY=1 npx tsx prisma/migrate-tags.ts    # apply the changes

const adapter = new PrismaMssql({
  server: process.env.DB_HOST!,
  port: parseInt(process.env.DB_PORT || "1433", 10),
  database: process.env.DB_NAME!,
  user: process.env.DB_USER!,
  password: process.env.DB_PASSWORD!,
  options: { encrypt: true, trustServerCertificate: true },
});

const prisma = new PrismaClient({ adapter });

const APPLY = process.env.APPLY === "1";

// Keep in sync with STANDARD_TAGS in src/lib/tags.ts.
const STANDARD_TAGS = [
  "Breakfast", "Lunch", "Dinner", "Appetizer", "Side Dish", "Salad", "Soup",
  "Bread", "Dessert", "Snack", "Drink", "Sauce", "Vegetarian", "Vegan",
  "Gluten-Free", "Quick", "Healthy", "Comfort Food", "Italian", "Mexican", "Asian",
];

// Labels that aren't real categories — Blogger export cruft. Conservative on
// purpose; review the dry-run report and extend via JUNK_EXTRA.
const JUNK_PATTERNS: RegExp[] = [
  /^posted by/i,
  /^by\s+/i,
  /^https?:\/\//i,
  /^\d+$/,
  /^(untitled|uncategorized|test|testing|blog|blogger|none|n\/a|misc|other|label\d*)$/i,
];
const JUNK_EXTRA = (process.env.JUNK_EXTRA || "")
  .split(",")
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

function isJunk(name: string): boolean {
  const n = name.trim();
  if (JUNK_EXTRA.includes(n.toLowerCase())) return true;
  return JUNK_PATTERNS.some((re) => re.test(n));
}

const norm = (s: string) => s.trim().toLowerCase();

// Repoint a recipe's tag link from one tag to another (idempotent).
async function repoint(recipeId: number, fromTagId: number, toTagId: number) {
  if (fromTagId === toTagId) return;
  const exists = await prisma.recipeTag.findUnique({
    where: { recipeId_tagId: { recipeId, tagId: toTagId } },
  });
  if (!exists) await prisma.recipeTag.create({ data: { recipeId, tagId: toTagId } });
  await prisma.recipeTag.delete({ where: { recipeId_tagId: { recipeId, tagId: fromTagId } } });
}

async function findOrCreateTag(name: string, householdId: number | null): Promise<number> {
  const existing = await prisma.tag.findFirst({ where: { name, householdId } });
  if (existing) return existing.id;
  if (!APPLY) return -1; // placeholder id in dry-run
  const created = await prisma.tag.create({ data: { name, householdId } });
  return created.id;
}

async function main() {
  console.log(`\nTag migration — ${APPLY ? "APPLY (changes will be written)" : "DRY RUN (no changes)"}\n`);

  // 1) Ensure standard categories exist.
  const standardByNorm = new Map<string, number>();
  for (const name of STANDARD_TAGS) {
    const id = await findOrCreateTag(name, null);
    standardByNorm.set(norm(name), id);
    const existed = id !== -1 && (await prisma.tag.findFirst({ where: { name, householdId: null } }));
    if (!existed) console.log(`  standard: ensure "${name}"`);
  }

  // 2) Load every tag with the households of the recipes that use it.
  const tags = await prisma.tag.findMany({
    include: { recipes: { select: { recipeId: true, recipe: { select: { householdId: true } } } } },
  });

  let pruned = 0, toStandard = 0, scoped = 0, split = 0, orphan = 0;

  for (const tag of tags) {
    // Skip tags that are already standard.
    if (tag.householdId === null && standardByNorm.get(norm(tag.name)) === tag.id) continue;

    const links = tag.recipes;
    const householdIds = Array.from(new Set(links.map((l) => l.recipe.householdId)));

    // Junk → remove the label entirely.
    if (isJunk(tag.name)) {
      console.log(`  prune junk: "${tag.name}" (${links.length} link(s))`);
      if (APPLY) {
        await prisma.recipeTag.deleteMany({ where: { tagId: tag.id } });
        await prisma.tag.delete({ where: { id: tag.id } });
      }
      pruned++;
      continue;
    }

    // Matches a standard category name → merge links into the standard tag.
    const stdId = standardByNorm.get(norm(tag.name));
    if (stdId !== undefined && stdId !== tag.id) {
      console.log(`  → standard: "${tag.name}" merge ${links.length} link(s)`);
      if (APPLY) {
        for (const l of links) await repoint(l.recipeId, tag.id, stdId);
        await prisma.tag.delete({ where: { id: tag.id } });
      }
      toStandard++;
      continue;
    }

    // No recipes use it → orphan, drop it.
    if (householdIds.length === 0) {
      console.log(`  drop orphan: "${tag.name}"`);
      if (APPLY) await prisma.tag.delete({ where: { id: tag.id } });
      orphan++;
      continue;
    }

    // Used by exactly one household → assign it.
    if (householdIds.length === 1) {
      console.log(`  scope: "${tag.name}" → household ${householdIds[0]}`);
      if (APPLY) await prisma.tag.update({ where: { id: tag.id }, data: { householdId: householdIds[0] } });
      scoped++;
      continue;
    }

    // Used by multiple households → keep for the first, split the rest into
    // separate per-household categories.
    const [first, ...rest] = householdIds;
    console.log(`  split: "${tag.name}" across households [${householdIds.join(", ")}]`);
    if (APPLY) {
      await prisma.tag.update({ where: { id: tag.id }, data: { householdId: first } });
      for (const h of rest) {
        const newId = await findOrCreateTag(tag.name, h);
        for (const l of links.filter((x) => x.recipe.householdId === h)) {
          await repoint(l.recipeId, tag.id, newId);
        }
      }
    }
    split++;
  }

  console.log(
    `\nSummary: pruned ${pruned}, → standard ${toStandard}, scoped ${scoped}, split ${split}, orphans ${orphan}.`
  );
  if (!APPLY) console.log("Dry run only — re-run with APPLY=1 to commit these changes.\n");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
