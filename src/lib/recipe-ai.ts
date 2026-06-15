import { GoogleGenAI } from "@google/genai";

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

export async function extractRecipeFromText(text: string): Promise<AiRecipe | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || !text.trim()) return null;

  const ai = new GoogleGenAI({ apiKey });
  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash-lite",
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
