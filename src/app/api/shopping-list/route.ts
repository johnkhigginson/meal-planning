import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireHouseholdId } from "@/lib/auth";
import { convertQuantity } from "@/lib/units";
import type { UnitConversion } from "@/generated/prisma/client";

interface ShoppingItem {
  ingredientId: number;
  ingredientName: string;
  needed: number;
  unitId: number;
  unitAbbr: string;
  bestStore: { storeId: number; storeName: string; price: number; unitPrice: number } | null;
  allStores: { storeId: number; storeName: string; price: number; unitPrice: number }[];
}

export async function POST(request: NextRequest) {
  const householdId = await requireHouseholdId();
  const { groceryListId } = await request.json();

  if (!groceryListId) {
    return NextResponse.json({ error: "groceryListId required" }, { status: 400 });
  }

  // Get grocery list items
  const groceryList = await prisma.groceryList.findFirst({
    where: { id: groceryListId, householdId },
    include: {
      items: {
        include: { ingredient: true, unit: true },
        where: { needed: { gt: 0 } },
      },
    },
  });

  if (!groceryList) {
    return NextResponse.json({ error: "Grocery list not found" }, { status: 404 });
  }

  // Get all prices from favorite stores
  const favoriteStores = await prisma.store.findMany({
    where: { householdId, isFavorite: true },
    include: {
      prices: {
        include: { ingredient: true, unit: true },
      },
    },
  });

  const conversions = await prisma.unitConversion.findMany();

  // Build price lookup: ingredientId -> [{storeId, storeName, price, quantity, unitId}]
  const priceLookup = new Map<number, { storeId: number; storeName: string; price: number; quantity: number; unitId: number }[]>();
  for (const store of favoriteStores) {
    for (const sp of store.prices) {
      const entries = priceLookup.get(sp.ingredientId) || [];
      entries.push({
        storeId: store.id,
        storeName: store.name,
        price: Number(sp.price),
        quantity: sp.quantity,
        unitId: sp.unitId,
      });
      priceLookup.set(sp.ingredientId, entries);
    }
  }

  // For each grocery item, find the cheapest store
  const items: ShoppingItem[] = groceryList.items.map((item) => {
    const storePrices = priceLookup.get(item.ingredientId) || [];

    const allStores = storePrices.map((sp) => {
      // Convert store price to the grocery item's unit for comparison
      let unitPrice = sp.price / sp.quantity; // price per store unit

      // Try to normalize to grocery item's unit
      if (sp.unitId !== item.unitId) {
        const converted = convertQuantity(1, sp.unitId, item.unitId, conversions as UnitConversion[]);
        if (converted !== null) {
          unitPrice = sp.price / (sp.quantity * converted);
        }
      }

      return {
        storeId: sp.storeId,
        storeName: sp.storeName,
        price: Math.round(unitPrice * item.needed * 100) / 100,
        unitPrice: Math.round(unitPrice * 100) / 100,
      };
    }).sort((a, b) => a.price - b.price);

    return {
      ingredientId: item.ingredientId,
      ingredientName: item.ingredient.name,
      needed: item.needed,
      unitId: item.unitId,
      unitAbbr: item.unit.abbreviation,
      bestStore: allStores[0] || null,
      allStores,
    };
  });

  // Group by best store
  const byStore = new Map<string, ShoppingItem[]>();
  for (const item of items) {
    const key = item.bestStore?.storeName || "No price data";
    const list = byStore.get(key) || [];
    list.push(item);
    byStore.set(key, list);
  }

  const totalEstimate = items.reduce((sum, item) => sum + (item.bestStore?.price || 0), 0);

  return NextResponse.json({
    items,
    byStore: Object.fromEntries(byStore),
    totalEstimate: Math.round(totalEstimate * 100) / 100,
    storeCount: favoriteStores.length,
  });
}
