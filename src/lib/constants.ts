// String constants matching the database values (SQL Server doesn't support Prisma enums)

export const UNIT_TYPES = ["VOLUME", "WEIGHT", "COUNT", "OTHER"] as const;
export type UnitType = (typeof UNIT_TYPES)[number];

export const SOURCE_TYPES = ["PERSONAL", "WEBSITE", "BOOK"] as const;
export type SourceType = (typeof SOURCE_TYPES)[number];

export const MEAL_SLOTS = ["BREAKFAST", "LUNCH", "DINNER", "SNACK"] as const;
export type MealSlot = (typeof MEAL_SLOTS)[number];

export const INGREDIENT_CATEGORIES = [
  "Produce",
  "Dairy",
  "Meat",
  "Seafood",
  "Pantry",
  "Frozen",
  "Bakery",
  "Beverages",
  "Condiments",
  "Spices",
  "Other",
] as const;
export type IngredientCategory = (typeof INGREDIENT_CATEGORIES)[number];
