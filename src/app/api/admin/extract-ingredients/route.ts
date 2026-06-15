import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { htmlToText } from "@/lib/blogger";
import { extractRecipeFromText, isAiConfigured } from "@/lib/recipe-ai";
import { parseIngredientLines } from "@/lib/ingredient-parse";

export const runtime = "nodejs";
export const maxDuration = 300;

const DEFAULT_BATCH = 6;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Batched AI pass that fills in structured ingredients (and refines steps/times)
// for imported blog recipes. Processes a small batch per call so it never times
// out — the client loops until `remaining` hits 0. Idempotent: each recipe is
// stamped with aiProcessedAt so it's handled at most once.
export async function POST(request: NextRequest) {
  let admin;
  try {
    admin = await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  if (!isAiConfigured()) {
    return NextResponse.json({ error: "AI is not configured (GEMINI_API_KEY missing)." }, { status: 400 });
  }

  const body = await request.json().catch(() => ({}));
  const limit = Math.min(Math.max(parseInt(String(body.limit ?? DEFAULT_BATCH), 10) || DEFAULT_BATCH, 1), 20);

  // Resolve the target household (the owner's), matching the importer.
  let householdId = admin.householdId;
  if (typeof body.ownerUserId === "number" && body.ownerUserId !== admin.userId) {
    const owner = await prisma.user.findUnique({
      where: { id: body.ownerUserId },
      select: { householdId: true },
    });
    if (!owner) return NextResponse.json({ error: "Selected owner not found." }, { status: 400 });
    householdId = owner.householdId;
  }

  const where = { householdId, sourceType: "BLOG", aiProcessedAt: null } as const;

  const batch = await prisma.recipe.findMany({
    where,
    select: {
      id: true,
      bodyHtml: true,
      instructions: true,
      servings: true,
      prepTimeMinutes: true,
      cookTimeMinutes: true,
      _count: { select: { ingredients: true } },
    },
    orderBy: { id: "asc" },
    take: limit,
  });

  let processed = 0;
  let withIngredients = 0;
  const errors: string[] = [];

  for (const recipe of batch) {
    try {
      // Already has ingredients (e.g. hand-entered) — just mark as handled.
      if (recipe._count.ingredients > 0) {
        await prisma.recipe.update({ where: { id: recipe.id }, data: { aiProcessedAt: new Date() } });
        processed++;
        continue;
      }

      const text = htmlToText(recipe.bodyHtml ?? "");
      if (!text) {
        await prisma.recipe.update({ where: { id: recipe.id }, data: { aiProcessedAt: new Date() } });
        processed++;
        continue;
      }

      const ai = await extractRecipeFromText(text);
      await sleep(700); // pace requests to stay under Gemini rate limits

      if (ai?.isRecipe && ai.ingredients.length > 0) {
        const rows = await parseIngredientLines(ai.ingredients);
        if (rows.length > 0) {
          await prisma.recipeIngredient.createMany({
            data: rows.map((r, idx) => ({
              recipeId: recipe.id,
              ingredientId: r.ingredientId,
              quantity: r.quantity,
              unitId: r.unitId,
              notes: r.notes || null,
              optional: r.optional,
              sortOrder: idx,
            })),
          });
          withIngredients++;
        }
        await prisma.recipe.update({
          where: { id: recipe.id },
          data: {
            instructions: ai.instructions?.trim() ? ai.instructions.trim() : undefined,
            servings: ai.servings ?? undefined,
            prepTimeMinutes: recipe.prepTimeMinutes ?? ai.prepTimeMinutes ?? undefined,
            cookTimeMinutes: recipe.cookTimeMinutes ?? ai.cookTimeMinutes ?? undefined,
            aiProcessedAt: new Date(),
          },
        });
      } else {
        // Not a recipe / nothing extractable — mark handled so we don't retry.
        await prisma.recipe.update({ where: { id: recipe.id }, data: { aiProcessedAt: new Date() } });
      }
      processed++;
    } catch (err) {
      // Leave aiProcessedAt null so a transient failure is retried next call.
      errors.push(`recipe ${recipe.id}: ${err instanceof Error ? err.message : "extraction failed"}`);
    }
  }

  const remaining = await prisma.recipe.count({ where });

  return NextResponse.json({
    processed,
    withIngredients,
    remaining,
    done: remaining === 0,
    errors: errors.slice(0, 10),
  });
}
