import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasEnoughInStock } from "@/lib/matching";

// Prefer dinner, then the rest of the day's meals in this order.
const SLOT_ORDER: Record<string, number> = { DINNER: 0, LUNCH: 1, BREAKFAST: 2, SNACK: 3 };

// Accept only real IANA zone names ("America/Denver", "UTC"). The pattern
// screens out junk before Intl does the authoritative check.
function validTimeZone(tz: string | null): string | null {
  if (!tz || tz.length > 64 || !/^[A-Za-z0-9_+\-/]+$/.test(tz)) return null;
  try {
    return new Intl.DateTimeFormat("en-US", { timeZone: tz }).resolvedOptions().timeZone;
  } catch {
    return null;
  }
}

// Today's calendar date (YYYY-MM-DD) as seen in the given zone.
function todayIn(timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const get = (type: string) => parts.find((p) => p.type === type)?.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const timeZone = validTimeZone(request.nextUrl.searchParams.get("tz"));
  if (!timeZone) return NextResponse.json({ error: "Invalid time zone" }, { status: 400 });

  const date = todayIn(timeZone);
  const householdId = user.householdId;

  // Plan dates are SQL dates, stored as UTC midnight.
  const entries = await prisma.mealPlanEntry.findMany({
    where: { date: new Date(`${date}T00:00:00.000Z`), mealPlan: { householdId } },
    orderBy: { id: "asc" },
    select: {
      mealSlot: true,
      servings: true,
      customName: true,
      recipe: {
        select: {
          id: true,
          name: true,
          servings: true,
          ingredients: { select: { ingredientId: true, quantity: true, unitId: true, optional: true } },
        },
      },
    },
  });

  const entry = entries.sort((a, b) => (SLOT_ORDER[a.mealSlot] ?? 9) - (SLOT_ORDER[b.mealSlot] ?? 9))[0];
  if (!entry) return NextResponse.json({ date, meal: null });

  const recipe = entry.recipe;
  let pantry: { onHand: number; total: number } | null = null;

  // Same rule as What Can I Make?, scaled to the planned servings like the
  // recipe page. Skipped for households with no pantry so nobody sees "0 of 9".
  if (recipe) {
    const required = recipe.ingredients.filter((ri) => !ri.optional);
    const [pantryCount, stockItems] = await Promise.all([
      prisma.inventoryItem.count({ where: { householdId } }),
      prisma.inventoryItem.findMany({
        where: { householdId, ingredientId: { in: required.map((ri) => ri.ingredientId) } },
        select: { ingredientId: true, quantity: true, unitId: true },
      }),
    ]);
    if (pantryCount > 0 && required.length > 0) {
      const conversions = stockItems.length > 0 ? await prisma.unitConversion.findMany() : [];
      const stockById = new Map(stockItems.map((s) => [s.ingredientId, s]));
      const factor = recipe.servings > 0 ? entry.servings / recipe.servings : 1;
      const onHand = required.filter((ri) => {
        const stock = stockById.get(ri.ingredientId);
        return stock ? hasEnoughInStock(stock, ri.quantity * factor - 1e-9, ri.unitId, conversions) : false;
      }).length;
      pantry = { onHand, total: required.length };
    }
  }

  return NextResponse.json({
    date,
    meal: {
      name: recipe?.name ?? entry.customName ?? "Meal",
      mealSlot: entry.mealSlot,
      recipeId: recipe?.id ?? null,
      pantry,
    },
  });
}
