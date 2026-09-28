import { prisma } from "./prisma";
import { convertQuantity, roundQuantity } from "./units";
import type { UnitConversion } from "@/generated/prisma/client";

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
        entries: {
          include: {
            recipe: {
              include: {
                ingredients: {
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
