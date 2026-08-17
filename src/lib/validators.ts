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
  sourceType: z.enum(["PERSONAL", "WEBSITE", "BOOK", "BLOG"]).default("PERSONAL"),
  sourceUrl: z.string().url().max(2000).optional(),
  sourceBookTitle: z.string().max(300).optional(),
  sourceBookPage: z.string().max(50).optional(),
  // Absolute URL (external image) or an app-relative path (e.g. an uploaded
  // photo served from /api/images/123).
  imageUrl: z
    .string()
    .max(2000)
    .refine((v) => /^https?:\/\//.test(v) || v.startsWith("/"), "Invalid image URL")
    .optional(),
  authorId: z.number().int().positive().nullable().optional(),
  // Optional: create this recipe directly into a cookbook (used by cookbook
  // collaborators contributing to someone else's blog).
  bookId: z.number().int().positive().optional(),
  isFavorite: z.boolean().default(false),
  ingredients: z.array(recipeIngredientSchema).default([]),
  tagIds: z.array(z.number().int().positive()).default([]),
});

// bookId is creation-only; the update form never reassigns a recipe's cookbook.
export const updateRecipeSchema = createRecipeSchema.omit({ bookId: true }).partial();

// ─── Tags ───────────────────────────────────────────────────────

export const createTagSchema = z.object({
  name: z.string().min(1).max(100),
  // Optional target so a category created while tagging a recipe in someone
  // else's cookbook is scoped to that cookbook's household, not the creator's.
  bookId: z.number().int().positive().optional(),
  recipeId: z.number().int().positive().optional(),
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

// A planned meal is EITHER a saved recipe or a free-text name (e.g.
// "Leftovers", "Dinner at Mom's"). Free-text meals carry no ingredients, so
// they contribute nothing to grocery lists or pantry math.
export const mealPlanEntrySchema = z
  .object({
    recipeId: z.number().int().positive().optional(),
    customName: z.string().max(200).optional(),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    mealSlot: z.enum(["BREAKFAST", "LUNCH", "DINNER", "SNACK"]),
    servings: z.number().int().positive(),
  })
  .refine((d) => (d.recipeId != null) !== !!d.customName?.trim(), {
    message: "Provide either a recipe or a meal name, not both",
    path: ["customName"],
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
