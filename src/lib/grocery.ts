import { prisma } from "./prisma";
import { convertQuantity, roundQuantity } from "./units";
import type { UnitConversion } from "@/generated/prisma/client";
import { guessIngredientCategory } from "./ingredient-category";
import { parseIngredientLines } from "./ingredient-parse";

interface AggregatedItem {
  ingredientId: number;
  ingredientName: string;
  category: string | null;
  totalQuantity: number;
  unitId: number;
  unitAbbr: string;
  inInventory: number;
  needed: number;
}

export async function generateGroceryList(mealPlanId: number, householdId: number): Promise<{
  items: AggregatedItem[];
  mealPlanId: number;
  weekStartDate: Date;
} | null> {
  const [mealPlan, inventory, conversions] = await Promise.all([
    prisma.mealPlan.findFirst({
      where: { id: mealPlanId, householdId },
      include: {
        // A fixed order keeps each ingredient's unit (the first one seen) the
        // same from run to run, so a list can be compared with a fresh one.
        entries: {
          orderBy: { id: "asc" },
          include: {
            recipe: {
              include: {
                ingredients: {
                  orderBy: { id: "asc" },
                  include: { ingredient: true, unit: true },
                },
              },
            },
          },
        },
      },
    }),
    prisma.inventoryItem.findMany({
      where: { householdId },
      include: { ingredient: true, unit: true },
    }),
    prisma.unitConversion.findMany(),
  ]);

  if (!mealPlan) return null;

  // Aggregate ingredients across all entries
  const aggregated = new Map<
    number,
    {
      ingredientId: number;
      ingredientName: string;
      category: string | null;
      quantities: { quantity: number; unitId: number; unitAbbr: string }[];
    }
  >();

  for (const entry of mealPlan.entries) {
    // Free-text meals ("Leftovers", "Takeout") have no recipe and therefore no
    // ingredients to shop for — they're intentionally excluded from the list.
    if (!entry.recipe) continue;

    const scaleFactor = entry.servings / entry.recipe.servings;

    for (const ri of entry.recipe.ingredients) {
      if (ri.optional) continue;

      const scaledQty = ri.quantity * scaleFactor;
      const existing = aggregated.get(ri.ingredientId);

      if (existing) {
        existing.quantities.push({
          quantity: scaledQty,
          unitId: ri.unitId,
          unitAbbr: ri.unit.abbreviation,
        });
      } else {
        aggregated.set(ri.ingredientId, {
          ingredientId: ri.ingredientId,
          ingredientName: ri.ingredient.name,
          category: ri.ingredient.category,
          quantities: [
            {
              quantity: scaledQty,
              unitId: ri.unitId,
              unitAbbr: ri.unit.abbreviation,
            },
          ],
        });
      }
    }
  }

  await categorizeUncategorized(aggregated.values());

  // Build inventory lookup
  const inventoryMap = new Map(
    inventory.map((item) => [
      item.ingredientId,
      { quantity: item.quantity, unitId: item.unitId },
    ])
  );

  // Convert and sum quantities per ingredient
  const items: AggregatedItem[] = [];

  for (const [, agg] of aggregated) {
    // Use the first unit encountered as the target unit
    const targetUnitId = agg.quantities[0].unitId;
    const targetUnitAbbr = agg.quantities[0].unitAbbr;

    let totalQty = 0;
    for (const q of agg.quantities) {
      const converted = convertQuantity(
        q.quantity,
        q.unitId,
        targetUnitId,
        conversions as UnitConversion[]
      );
      totalQty += converted ?? q.quantity;
    }

    // Subtract inventory
    let inInventoryQty = 0;
    const invItem = inventoryMap.get(agg.ingredientId);
    if (invItem) {
      const converted = convertQuantity(
        invItem.quantity,
        invItem.unitId,
        targetUnitId,
        conversions as UnitConversion[]
      );
      inInventoryQty = converted ?? invItem.quantity;
    }

    const needed = Math.max(0, totalQty - inInventoryQty);

    items.push({
      ingredientId: agg.ingredientId,
      ingredientName: agg.ingredientName,
      category: agg.category,
      totalQuantity: roundQuantity(totalQty),
      unitId: targetUnitId,
      unitAbbr: targetUnitAbbr,
      inInventory: roundQuantity(inInventoryQty),
      needed: roundQuantity(needed),
    });
  }

  // Sort by category then name
  items.sort((a, b) => {
    const catA = a.category || "ZZZ";
    const catB = b.category || "ZZZ";
    if (catA !== catB) return catA.localeCompare(catB);
    return a.ingredientName.localeCompare(b.ingredientName);
  });

  return { items, mealPlanId, weekStartDate: mealPlan.weekStartDate };
}

// Ingredients added before aisles were guessed have no category and would all
// pile into "Other". Guess one for each, save it to the ingredient so it sticks,
// and use it for this list. A category someone already set is never touched.
async function categorizeUncategorized(
  rows: Iterable<{ ingredientId: number; ingredientName: string; category: string | null }>
) {
  const byCategory = new Map<string, number[]>();
  for (const row of rows) {
    if (row.category) continue;
    const guess = guessIngredientCategory(row.ingredientName);
    if (!guess) continue;
    row.category = guess;
    byCategory.set(guess, [...(byCategory.get(guess) ?? []), row.ingredientId]);
  }
  await Promise.all(
    [...byCategory].map(([category, ids]) =>
      prisma.ingredient.updateMany({ where: { id: { in: ids }, category: null }, data: { category } })
    )
  );
}

const listInclude = {
  items: { include: { ingredient: true, unit: true }, orderBy: { ingredient: { name: "asc" } } },
  mealPlan: { select: { weekStartDate: true } },
} as const;

// A saved list plus the planned recipes each item is for, so the page can group
// by recipe. Read from the list's meal plan as it stands now. Regenerating
// keeps the two in step; an item no current recipe uses shows under "Other items".
// planChanged flags a list the plan has moved on from.
export async function loadGroceryList(listId: number, householdId: number) {
  const list = await prisma.groceryList.findFirst({
    where: { id: listId, householdId },
    include: listInclude,
  });
  if (!list) return null;

  // Lists saved before aisles were guessed still point at uncategorized
  // ingredients. Fill those in on read too; it only ever writes a null category.
  const pending = list.items
    .filter((item) => !item.ingredient.category)
    .map((item) => ({
      ingredientId: item.ingredientId,
      ingredientName: item.ingredient.name,
      category: null as string | null,
      item,
    }));
  await categorizeUncategorized(pending);
  for (const p of pending) if (p.category) p.item.ingredient.category = p.category;

  const entries = list.mealPlanId
    ? await prisma.mealPlanEntry.findMany({
        where: { mealPlanId: list.mealPlanId, recipeId: { not: null } },
        orderBy: [{ date: "asc" }, { id: "asc" }],
        select: {
          recipe: {
            select: {
              id: true,
              name: true,
              ingredients: { where: { optional: false }, select: { ingredientId: true } },
            },
          },
        },
      })
    : [];

  const recipes = new Map<number, { id: number; name: string; ingredientIds: number[] }>();
  for (const { recipe } of entries) {
    if (!recipe || recipes.has(recipe.id)) continue;
    recipes.set(recipe.id, {
      id: recipe.id,
      name: recipe.name,
      ingredientIds: [...new Set(recipe.ingredients.map((i) => i.ingredientId))],
    });
  }

  const planChanged = await planChangedSinceList(list, householdId);
  return { ...list, recipes: [...recipes.values()], planChanged };
}

const DAY_MS = 24 * 60 * 60 * 1000;

export interface CurrentPlan {
  // null when nobody has opened that week's plan yet.
  id: number | null;
  weekStartDate: Date;
  // Planned meals that have a recipe, so they add to a grocery list.
  recipeMeals: number;
  // True when this week has nothing planned and next week does.
  upcoming: boolean;
}

// The page sends this week's Monday ("YYYY-MM-DD") from the cook's own clock,
// since the server's day can differ. Without one, use the server's week.
export function parseWeekOf(value: string | null): Date {
  if (value && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) return date;
  }
  const today = new Date();
  const utc = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  return new Date(utc - ((today.getDay() + 6) % 7) * DAY_MS);
}

// The plan a grocery list should follow: this week's, or next week's when
// this week has no recipes planned yet and next week does. `weekOf` is this
// week's Monday as a SQL date (UTC midnight), from the cook's own clock.
export async function findCurrentPlan(householdId: number, weekOf: Date): Promise<CurrentPlan> {
  const nextWeek = new Date(weekOf.getTime() + 7 * DAY_MS);
  const plans = await prisma.mealPlan.findMany({
    where: { householdId, weekStartDate: { in: [weekOf, nextWeek] } },
    select: {
      id: true,
      weekStartDate: true,
      _count: { select: { entries: { where: { recipeId: { not: null } } } } },
    },
  });
  const thisPlan = plans.find((p) => p.weekStartDate.getTime() === weekOf.getTime());
  const nextPlan = plans.find((p) => p.weekStartDate.getTime() === nextWeek.getTime());

  if (!thisPlan?._count.entries && nextPlan?._count.entries) {
    return { id: nextPlan.id, weekStartDate: nextWeek, recipeMeals: nextPlan._count.entries, upcoming: true };
  }
  return {
    id: thisPlan?.id ?? null,
    weekStartDate: weekOf,
    recipeMeals: thisPlan?._count.entries ?? 0,
    upcoming: false,
  };
}

// Whether a week's list no longer matches its plan: a meal was added, removed
// or resized, or a recipe changed. Compares what to buy in total, so pantry
// changes and check marks don't count.
export async function planChangedSinceList(
  list: { mealPlanId: number | null; items: { ingredientId: number; unitId: number; quantity: number }[] },
  householdId: number
): Promise<boolean> {
  if (!list.mealPlanId) return false;
  const generated = await generateGroceryList(list.mealPlanId, householdId);
  if (!generated) return true;

  const key = (item: { ingredientId: number; unitId: number }) => `${item.ingredientId}:${item.unitId}`;
  const saved = new Map<string, number>();
  for (const item of list.items) saved.set(key(item), (saved.get(key(item)) ?? 0) + item.quantity);
  if (saved.size !== generated.items.length) return true;
  return generated.items.some((item) => {
    const before = saved.get(key(item));
    return before === undefined || Math.abs(before - item.totalQuantity) > 1e-6;
  });
}

// A blank list the cook fills in by hand, not tied to any meal plan.
export const NEW_LIST_NAME = "New list";

export async function createBlankList(householdId: number): Promise<number> {
  const list = await prisma.groceryList.create({ data: { householdId, name: NEW_LIST_NAME } });
  return list.id;
}

// Adds a typed line ("2 lb chicken") to a list. Only lists without a meal plan
// take hand-added items, since regenerating a week's list rewrites it. The
// same ingredient in the same unit adds to the row already there.
export async function addItemToList(
  listId: number,
  householdId: number,
  text: string
): Promise<"added" | "not-found" | "plan-list" | "unreadable"> {
  const list = await prisma.groceryList.findFirst({
    where: { id: listId, householdId },
    select: { mealPlanId: true },
  });
  if (!list) return "not-found";
  if (list.mealPlanId) return "plan-list";

  const [row] = await parseIngredientLines([text]);
  if (!row) return "unreadable";

  const existing = await prisma.groceryListItem.findFirst({
    where: { groceryListId: listId, ingredientId: row.ingredientId, unitId: row.unitId },
  });
  if (existing) {
    const quantity = roundQuantity(existing.quantity + row.quantity);
    await prisma.groceryListItem.update({
      where: { id: existing.id },
      data: { quantity, needed: roundQuantity(existing.needed + row.quantity), checked: false },
    });
  } else {
    const quantity = roundQuantity(row.quantity);
    await prisma.groceryListItem.create({
      data: { groceryListId: listId, ingredientId: row.ingredientId, unitId: row.unitId, quantity, needed: quantity },
    });
  }
  return "added";
}

// weekStartDate is a SQL date, which arrives as UTC midnight.
export function weekListName(weekStartDate: Date): string {
  const label = weekStartDate.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
  return `Week of ${label}`;
}

// Each week keeps one list. Regenerating it (say, after adding a meal) rewrites
// that list in place, so it stays the one the cook comes back to. An item they
// already checked off stays checked unless the week now needs more of it.
export async function saveGroceryList(
  mealPlanId: number,
  householdId: number,
  items: AggregatedItem[],
  weekStartDate: Date
): Promise<number> {
  const name = weekListName(weekStartDate);
  const existing = await prisma.groceryList.findFirst({
    where: { mealPlanId, householdId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    include: { items: { select: { ingredientId: true, unitId: true, needed: true, checked: true } } },
  });

  const previous = new Map(
    (existing?.items ?? []).map((item) => [`${item.ingredientId}:${item.unitId}`, item])
  );
  const rows = items.map((item) => {
    const before = previous.get(`${item.ingredientId}:${item.unitId}`);
    return {
      ingredientId: item.ingredientId,
      quantity: item.totalQuantity,
      unitId: item.unitId,
      inInventory: item.inInventory,
      needed: item.needed,
      checked: item.needed <= 0 || (!!before?.checked && item.needed <= before.needed),
    };
  });

  if (!existing) {
    const created = await prisma.groceryList.create({
      data: { mealPlanId, householdId, name, items: { create: rows } },
    });
    return created.id;
  }

  await prisma.$transaction([
    prisma.groceryListItem.deleteMany({ where: { groceryListId: existing.id } }),
    prisma.groceryList.update({
      where: { id: existing.id },
      data: { name, items: { create: rows } },
    }),
  ]);
  return existing.id;
}

export const EXTRAS_LIST_NAME = "Extra items";

// Adds what a recipe needs beyond the pantry to the household's "Extra items"
// list. It's kept apart from the weekly lists because regenerating a week
// rewrites that list and would drop anything added by hand. "Missing" follows
// the recipe page's pantry check (lib/matching.ts): stock in units that can't
// be converted counts as enough. An ingredient already on the list is skipped.
export async function addRecipeToGroceryList(
  recipeId: number,
  householdId: number,
  servings?: number
): Promise<{ groceryListId: number; added: string[]; alreadyListed: string[] } | null> {
  const recipe = await prisma.recipe.findFirst({
    where: { id: recipeId, householdId },
    include: {
      ingredients: {
        where: { optional: false },
        include: { ingredient: true },
        orderBy: { sortOrder: "asc" },
      },
    },
  });
  if (!recipe) return null;

  const ingredientIds = recipe.ingredients.map((ri) => ri.ingredientId);
  const [inventory, conversions] = await Promise.all([
    prisma.inventoryItem.findMany({
      where: { householdId, ingredientId: { in: ingredientIds } },
      select: { ingredientId: true, quantity: true, unitId: true },
    }),
    prisma.unitConversion.findMany(),
  ]);
  const inventoryMap = new Map(inventory.map((item) => [item.ingredientId, item]));
  const scaleFactor = servings && recipe.servings > 0 ? servings / recipe.servings : 1;

  // One row per ingredient, in the unit it first appears in.
  const needs = new Map<number, { name: string; unitId: number; quantity: number }>();
  for (const ri of recipe.ingredients) {
    const qty = ri.quantity * scaleFactor;
    const existing = needs.get(ri.ingredientId);
    if (existing) {
      const converted = convertQuantity(qty, ri.unitId, existing.unitId, conversions);
      existing.quantity += converted ?? qty;
    } else {
      needs.set(ri.ingredientId, { name: ri.ingredient.name, unitId: ri.unitId, quantity: qty });
    }
  }

  const missing: { ingredientId: number; name: string; unitId: number; quantity: number; inInventory: number }[] = [];
  for (const [ingredientId, need] of needs) {
    const inv = inventoryMap.get(ingredientId);
    let inInventory = 0;
    if (inv) {
      const converted = convertQuantity(inv.quantity, inv.unitId, need.unitId, conversions);
      if (converted === null && inv.quantity > 0) continue;
      inInventory = converted ?? 0;
      if (inInventory >= need.quantity - 1e-9) continue;
    }
    missing.push({ ingredientId, ...need, inInventory });
  }

  const list =
    (await prisma.groceryList.findFirst({
      where: { householdId, mealPlanId: null, name: EXTRAS_LIST_NAME },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      include: { items: { select: { ingredientId: true } } },
    })) ??
    (await prisma.groceryList.create({
      data: { householdId, name: EXTRAS_LIST_NAME },
      include: { items: { select: { ingredientId: true } } },
    }));

  const listed = new Set(list.items.map((item) => item.ingredientId));
  const toAdd = missing.filter((m) => !listed.has(m.ingredientId));
  if (toAdd.length > 0) {
    await prisma.groceryListItem.createMany({
      data: toAdd.map((m) => ({
        groceryListId: list.id,
        ingredientId: m.ingredientId,
        unitId: m.unitId,
        quantity: roundQuantity(m.quantity),
        inInventory: roundQuantity(m.inInventory),
        needed: roundQuantity(m.quantity - m.inInventory),
      })),
    });
  }

  return {
    groceryListId: list.id,
    added: toAdd.map((m) => m.name),
    alreadyListed: missing.filter((m) => listed.has(m.ingredientId)).map((m) => m.name),
  };
}
