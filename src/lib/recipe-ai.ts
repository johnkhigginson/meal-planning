import { GoogleGenAI } from "@google/genai";
import { GEMINI_MODEL } from "@/lib/ai";

// AI extraction of structured recipe data from a (messy) blog post. Used by the
// blog importer's ingredient-extraction pass. Returns null when no API key is
// configured or the model can't find a recipe in the text.

const SYSTEM_PROMPT = `You extract structured recipe data from a blog post. The post may contain stories, photos captions, and chatter around the recipe.

Return ONLY valid JSON (no markdown, no code fences) with this shape:
{
  "isRecipe": true,
  "servings": 4,
  "prepTimeMinutes": 15,
  "cookTimeMinutes": 30,
  "ingredients": ["2 cups all-purpose flour", "1 tsp salt"],
  "instructions": "1. Do this.\\n2. Do that."
}

Rules:
- Set "isRecipe" to false if the post does not actually contain a cookable recipe (no ingredient list). In that case other fields may be empty/null.
- Keep each ingredient as a single human-readable line, exactly as a cook would read it (quantity + unit + item).
- Number the instruction steps; keep them faithful to the post.
- Use null for any time/servings you can't determine. servings should be a number only.`;

export interface AiRecipe {
  isRecipe: boolean;
  servings: number | null;
  prepTimeMinutes: number | null;
  cookTimeMinutes: number | null;
  ingredients: string[];
  instructions: string;
}

export function isAiConfigured(): boolean {
  return Boolean(process.env.GEMINI_API_KEY);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Rate limits (429) and transient overloads (503) are common on the Gemini
// free tier; retry those a few times with exponential backoff instead of
// failing the whole extraction run.
// A per-day free-tier quota cap (vs a transient per-minute spike). Retrying
// these is pointless — they only reset after ~24h or by enabling billing.
export function isDailyQuotaError(err: unknown): boolean {
  const m = ((err as { message?: string })?.message || String(err)).toLowerCase();
  return m.includes("perday") || m.includes("per day") || m.includes("free_tier_requests");
}

function isTransient(err: unknown): boolean {
  if (isDailyQuotaError(err)) return false; // don't retry a daily cap
  const e = err as { status?: number; code?: number; message?: string };
  const status = e?.status ?? e?.code;
  if (status === 429 || status === 503 || status === 500) return true;
  const m = (e?.message || String(err)).toLowerCase();
  return /rate limit|quota|overload|unavailable|temporarily|try again|timeout|429|503/.test(m);
}

export function isQuotaError(err: unknown): boolean {
  const e = err as { status?: number; code?: number; message?: string };
  if ((e?.status ?? e?.code) === 429) return true;
  const m = (e?.message || String(err)).toLowerCase();
  return m.includes("resource_exhausted") || m.includes("quota") || m.includes("429");
}

/* eslint-disable @typescript-eslint/no-explicit-any */
async function generateWithRetry(ai: GoogleGenAI, req: any, attempts = 4): Promise<any> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await ai.models.generateContent(req);
    } catch (err) {
      lastErr = err;
      if (!isTransient(err) || i === attempts - 1) throw err;
      await sleep(1500 * Math.pow(2, i)); // 1.5s, 3s, 6s
    }
  }
  throw lastErr;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export async function extractRecipeFromText(text: string): Promise<AiRecipe | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || !text.trim()) return null;

  const ai = new GoogleGenAI({ apiKey });
  const response = await generateWithRetry(ai, {
    model: GEMINI_MODEL,
    contents: [
      {
        role: "user",
        parts: [{ text: `Extract the recipe from this blog post:\n\n${text.slice(0, 24000)}` }],
      },
    ],
    config: { systemInstruction: SYSTEM_PROMPT, maxOutputTokens: 4096 },
  });

  let jsonStr = response.text?.trim() || "";
  if (jsonStr.startsWith("```")) {
    jsonStr = jsonStr.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
  }

  try {
    const parsed = JSON.parse(jsonStr) as Partial<AiRecipe>;
    return {
      isRecipe: parsed.isRecipe !== false,
      servings: typeof parsed.servings === "number" ? parsed.servings : null,
      prepTimeMinutes: typeof parsed.prepTimeMinutes === "number" ? parsed.prepTimeMinutes : null,
      cookTimeMinutes: typeof parsed.cookTimeMinutes === "number" ? parsed.cookTimeMinutes : null,
      ingredients: Array.isArray(parsed.ingredients)
        ? parsed.ingredients.filter((i): i is string => typeof i === "string" && i.trim().length > 0)
        : [],
      instructions: typeof parsed.instructions === "string" ? parsed.instructions : "",
    };
  } catch {
    return null;
  }
}
