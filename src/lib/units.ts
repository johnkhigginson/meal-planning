import type { UnitConversion } from "@/generated/prisma/client";

/**
 * Convert a quantity from one unit to another using available conversions.
 * Returns null if units are incompatible or no conversion path exists.
 */
export function convertQuantity(
  quantity: number,
  fromUnitId: number,
  toUnitId: number,
  conversions: UnitConversion[]
): number | null {
  if (fromUnitId === toUnitId) return quantity;

  // Direct conversion
  const direct = conversions.find(
    (c) => c.fromUnitId === fromUnitId && c.toUnitId === toUnitId
  );
  if (direct) return quantity * direct.factor;

  // Reverse conversion
  const reverse = conversions.find(
    (c) => c.fromUnitId === toUnitId && c.toUnitId === fromUnitId
  );
  if (reverse) return quantity / reverse.factor;

  // Two-hop: fromUnit -> intermediate -> toUnit
  for (const first of conversions) {
    if (first.fromUnitId !== fromUnitId) continue;
    const second = conversions.find(
      (c) => c.fromUnitId === first.toUnitId && c.toUnitId === toUnitId
    );
    if (second) return quantity * first.factor * second.factor;
  }

  return null;
}

/**
 * Round a quantity to a sensible display precision.
 */
export function roundQuantity(quantity: number): number {
  if (quantity >= 10) return Math.round(quantity);
  if (quantity >= 1) return Math.round(quantity * 4) / 4; // nearest 0.25
  return Math.round(quantity * 100) / 100; // 2 decimal places for small amounts
}
