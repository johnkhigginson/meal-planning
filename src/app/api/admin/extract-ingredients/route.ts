import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { htmlToText, extractRecipeSections } from "@/lib/blogger";
import { extractRecipeFromText, isAiConfigured, isQuotaError, isDailyQuotaError } from "@/lib/recipe-ai";
import { parseIngredientLines } from "@/lib/ingredient-parse";

export const runtime = "nodejs";
export const maxDuration = 300;

const DEFAULT_BATCH = 6;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Fills in structured ingredients for imported blog recipes, in small batches
// the client loops over. Two modes:
//   - "ai" (default): Gemini extraction (best quality, uses API quota).
//   - "heuristic": free, no-AI parse of the post's ingredient list (rough).
// Idempotent: AI mode stamps aiProcessedAt; heuristic only stamps recipes where
// it found nothing, so a later AI run can still try the rest.
export async function POST(request: NextRequest) {
  let admin;
  try {
    admin = await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const mode = body.mode === "heuristic" ? "heuristic" : "ai";
  const limit = Math.min(Math.max(parseInt(String(body.limit ?? DEFAULT_BATCH), 10) || DEFAULT_BATCH, 1), 20);

  if (mode === "ai" && !isAiConfigured()) {
    return NextResponse.json({ error: "AI is not configured (GEMINI_API_KEY missing)." }, { status: 400 });
  }

  // Resolve the target household (the owner's), matching the importer.
  let householdId = admin.householdId;
  if (typeof body.ownerUserId === "number" && body.ownerUserId !== admin.userId) {
    const owner = await prisma.user.findUnique({ where: { id: body.ownerUserId }, select: { householdId: true } });
    if (!owner) return NextResponse.json({ error: "Selected owner not found." }, { status: 400 });
    householdId = owner.householdId;
  }

  let processed = 0;
  let withIngredients = 0;
  const errors: string[] = [];

  // ─── Heuristic (free, no AI) ──────────────────────────────────
  if (mode === "heuristic") {
    const where = { householdId, sourceType: "BLOG", aiProcessedAt: null, ingredients: { none: {} } } as const;
    const batch = await prisma.recipe.findMany({
      where,
      select: { id: true, bodyHtml: true },
      orderBy: { id: "asc" },
      take: limit,
    });

    for (const recipe of batch) {
      try {
        const sections = extractRecipeSections(recipe.bodyHtml ?? "");
        const rows = sections.ingredients.length ? await parseIngredientLines(sections.ingredients) : [];
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
          // Leave aiProcessedAt null — having ingredients excludes it from the
          // query anyway, and AI won't re-process a recipe that already has them.
        } else {
          // Nothing found heuristically — mark handled so we don't loop forever.
          await prisma.recipe.update({ where: { id: recipe.id }, data: { aiProcessedAt: new Date() } });
        }
        processed++;
      } catch (err) {
        errors.push(`recipe ${recipe.id}: ${err instanceof Error ? err.message : "parse failed"}`);
      }
    }

    const remaining = await prisma.recipe.count({ where });
    return NextResponse.json({ processed, withIngredients, remaining, done: remaining === 0, errors: errors.slice(0, 10) });
  }

  // ─── AI (Gemini) ──────────────────────────────────────────────
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

  let quotaExceeded = false;
  let dailyQuota = false;

  for (const recipe of batch) {
    try {
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
      await sleep(700); // pace requests to stay under per-minute rate limits

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
        await prisma.recipe.update({ where: { id: recipe.id }, data: { aiProcessedAt: new Date() } });
      }
      processed++;
    } catch (err) {
      // A quota error won't clear by retrying mid-run — stop and report it so
      // the user can enable billing, wait, or switch to the free Quick extract.
      if (isQuotaError(err)) {
        quotaExceeded = true;
        dailyQuota = isDailyQuotaError(err);
        break;
      }
      errors.push(`recipe ${recipe.id}: ${err instanceof Error ? err.message.slice(0, 200) : "extraction failed"}`);
    }
  }

  const remaining = await prisma.recipe.count({ where });
  return NextResponse.json({
    processed,
    withIngredients,
    remaining,
    done: remaining === 0,
    quotaExceeded,
    dailyQuota,
    errors: errors.slice(0, 10),
  });
}
