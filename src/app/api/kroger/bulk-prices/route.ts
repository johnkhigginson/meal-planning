import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireHouseholdId } from "@/lib/auth";
import { searchProducts, type KrogerProduct } from "@/lib/kroger";

interface BulkPriceResult {
  ingredientId: number;
  ingredientName: string;
  product: {
    description: string;
    brand: string;
    size: string;
    regularPrice: number;
    promoPrice: number | null;
  } | null;
}

function parseSize(size: string): { quantity: number; unit: string } | null {
  // Parse sizes like "1 lb", "16 oz", "1 gal", "12 ct", "32 fl oz"
  const match = size.match(/^([\d.]+)\s*(fl\s*oz|oz|lb|lbs|gal|ct|each|kg|g|ml|l|pt|qt)\b/i);
  if (!match) return null;
  const quantity = parseFloat(match[1]);
  let unit = match[2].toLowerCase().replace(/\s+/g, " ");
  // Normalize
  if (unit === "lbs") unit = "lb";
  if (unit === "fl oz") unit = "fluid ounce";
  if (unit === "ct" || unit === "each") unit = "each";
  if (unit === "gal") unit = "gallon";
  if (unit === "pt") unit = "pint";
  if (unit === "qt") unit = "quart";
  if (unit === "l") unit = "liter";
  if (unit === "ml") unit = "milliliter";
  if (unit === "g") unit = "gram";
  if (unit === "kg") unit = "kilogram";
  if (unit === "oz") unit = "ounce";
  if (unit === "lb") unit = "pound";
  return { quantity, unit };
}

export async function POST(request: NextRequest) {
  const householdId = await requireHouseholdId();
  const { storeId, locationId, ingredientIds } = await request.json();

  if (!storeId || !locationId || !ingredientIds?.length) {
    return NextResponse.json(
      { error: "storeId, locationId, and ingredientIds required" },
      { status: 400 }
    );
  }

  // Verify store belongs to household
  const store = await prisma.store.findFirst({ where: { id: storeId, householdId } });
  if (!store) {
    return NextResponse.json({ error: "Store not found" }, { status: 404 });
  }

  // Get ingredient names
  const ingredients = await prisma.ingredient.findMany({
    where: { id: { in: ingredientIds } },
  });

  // Get all units for matching
  const units = await prisma.unit.findMany();
  const unitByName = new Map(units.map((u) => [u.name.toLowerCase(), u.id]));

  const results: BulkPriceResult[] = [];
  let savedCount = 0;

  for (const ingredient of ingredients) {
    try {
      const products = await searchProducts(ingredient.name, locationId, 5);

      // Find the best match — prefer items with prices, closest name match
      const withPrices = products.filter((p: KrogerProduct) => p.price && p.price.regular > 0);
      const best = withPrices[0] || null;

      if (best && best.price) {
        // Try to parse the size into quantity + unit
        const parsed = parseSize(best.size);
        const unitId = parsed ? (unitByName.get(parsed.unit) || unitByName.get("each") || 1) : (unitByName.get("each") || 1);
        const quantity = parsed?.quantity || 1;

        // Save to store prices
        await prisma.storePrice.upsert({
          where: { storeId_ingredientId: { storeId, ingredientId: ingredient.id } },
          update: {
            price: best.price.promo || best.price.regular,
            quantity,
            unitId,
            lastUpdated: new Date(),
          },
          create: {
            storeId,
            ingredientId: ingredient.id,
            price: best.price.promo || best.price.regular,
            quantity,
            unitId,
          },
        });
        savedCount++;

        results.push({
          ingredientId: ingredient.id,
          ingredientName: ingredient.name,
          product: {
            description: best.description,
            brand: best.brand,
            size: best.size,
            regularPrice: best.price.regular,
            promoPrice: best.price.promo,
          },
        });
      } else {
        results.push({
          ingredientId: ingredient.id,
          ingredientName: ingredient.name,
          product: null,
        });
      }
    } catch {
      results.push({
        ingredientId: ingredient.id,
        ingredientName: ingredient.name,
        product: null,
      });
    }

    // Rate limit: Kroger allows ~10 req/sec
    await new Promise((r) => setTimeout(r, 150));
  }

  return NextResponse.json({ results, savedCount });
}
