import { z } from "zod";

// ─── Ingredients ────────────────────────────────────────────────

export const createIngredientSchema = z.object({
  name: z.string().min(1).max(200),
  category: z.string().max(100).optional(),
  defaultUnitId: z.number().int().positive().optional(),
});

// ─── Recipes ────────────────────────────────────────────────────

export const recipeIngredientSchema = z.object({
  ingredientId: z.number().int().positive(),
  quantity: z.number().positive(),
  unitId: z.number().int().positive(),
  notes: z.string().max(200).optional(),
  optional: z.boolean().default(false),
  sortOrder: z.number().int().default(0),
});

export const createRecipeSchema = z.object({
  name: z.string().min(1).max(300),
  description: z.string().optional(),
  instructions: z.string().min(1),
  servings: z.number().int().positive(),
  prepTimeMinutes: z.number().int().positive().optional(),
  cookTimeMinutes: z.number().int().positive().optional(),
  sourceType: z.enum(["PERSONAL", "WEBSITE", "BOOK"]).default("PERSONAL"),
  sourceUrl: z.string().url().max(2000).optional(),
  sourceBookTitle: z.string().max(300).optional(),
  sourceBookPage: z.string().max(50).optional(),
  imageUrl: z.string().url().max(2000).optional(),
  isFavorite: z.boolean().default(false),
  ingredients: z.array(recipeIngredientSchema).default([]),
  tagIds: z.array(z.number().int().positive()).default([]),
});

export const updateRecipeSchema = createRecipeSchema.partial();

// ─── Tags ───────────────────────────────────────────────────────

export const createTagSchema = z.object({
  name: z.string().min(1).max(100),
});

// ─── Inventory ──────────────────────────────────────────────────

export const upsertInventorySchema = z.object({
  ingredientId: z.number().int().positive(),
  quantity: z.number().min(0),
  unitId: z.number().int().positive(),
  expirationDate: z.string().datetime().optional(),
});

export const updateInventorySchema = z.object({
  quantity: z.number().min(0).optional(),
  unitId: z.number().int().positive().optional(),
  expirationDate: z.string().datetime().nullable().optional(),
});

// ─── Meal Plans ─────────────────────────────────────────────────

export const createMealPlanSchema = z.object({
  weekStartDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export const mealPlanEntrySchema = z.object({
  recipeId: z.number().int().positive(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  mealSlot: z.enum(["BREAKFAST", "LUNCH", "DINNER", "SNACK"]),
  servings: z.number().int().positive(),
});

export const addMealPlanEntrySchema = mealPlanEntrySchema;

// ─── Stores ─────────────────────────────────────────────────────

export const createStoreSchema = z.object({
  name: z.string().min(1).max(200),
  isFavorite: z.boolean().default(false),
});

export const storePriceSchema = z.object({
  ingredientId: z.number().int().positive(),
  price: z.number().positive(),
  quantity: z.number().positive(),
  unitId: z.number().int().positive(),
});
