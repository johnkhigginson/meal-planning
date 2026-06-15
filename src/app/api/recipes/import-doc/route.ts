import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";
import { prisma } from "@/lib/prisma";
import { requireHouseholdId } from "@/lib/auth";
import { enforceRateLimit } from "@/lib/rate-limit";
import { parseIngredientLines } from "@/lib/ingredient-parse";

const SYSTEM_PROMPT = `You are a recipe extraction assistant. Given a document that contains one or more recipes, extract each recipe as structured data.

Return ONLY valid JSON with this structure (no markdown, no code fences):
{
  "recipes": [
    {
      "name": "Recipe Name",
      "description": "Brief description",
      "servings": 4,
      "prepTimeMinutes": 15,
      "cookTimeMinutes": 30,
      "ingredients": [
        "2 cups all-purpose flour",
        "1 tsp salt"
      ],
      "instructions": "Step 1. Do this.\\nStep 2. Do that."
    }
  ]
}

Rules:
- Extract ALL recipes found in the document
- Keep ingredient strings exactly as written
- Number each instruction step
- If a field is not found, use null
- For servings, extract the number only
- Separate multiple recipes into separate objects in the array`;

const MAX_IMPORT_RECIPES = 50;

// Safely parse the model's JSON and cap how many recipes a single import can
// create (defends against malformed output and prompt-injection floods).
/* eslint-disable-next-line @typescript-eslint/no-explicit-any */
function safeParseRecipes(jsonStr: string): { recipes: any[] } | null {
  try {
    const parsed = JSON.parse(jsonStr);
    const recipes = Array.isArray(parsed?.recipes) ? parsed.recipes.slice(0, MAX_IMPORT_RECIPES) : [];
    return { recipes };
  } catch {
    return null;
  }
}

export async function POST(request: NextRequest) {
  const householdId = await requireHouseholdId();
  const limited = enforceRateLimit("ai-doc", householdId, 10, 60_000);
  if (limited) return limited;
  const formData = await request.formData();
  const file = formData.get("document") as File | null;
  const text = formData.get("text") as string | null;

  if (file && file.size > 10 * 1024 * 1024) {
    return NextResponse.json({ error: "Document is too large (max 10MB)" }, { status: 400 });
  }
  if (text && text.length > 200_000) {
    return NextResponse.json({ error: "Text is too long" }, { status: 400 });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "GEMINI_API_KEY not configured" }, { status: 500 });
  }

  let content: string;

  if (file) {
    const bytes = await file.arrayBuffer();
    // For text files, read directly. For other formats, send as-is to Gemini.
    if (file.type.includes("text") || file.name.endsWith(".txt") || file.name.endsWith(".md")) {
      content = new TextDecoder().decode(bytes);
    } else {
      // Send file to Gemini for extraction (handles docx, pdf, etc.)
      const ai = new GoogleGenAI({ apiKey });
      const base64 = Buffer.from(bytes).toString("base64");
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash-lite",
        contents: [{
          role: "user",
          parts: [
            { inlineData: { mimeType: file.type || "application/octet-stream", data: base64 } },
            { text: "Extract all recipes from this document. Return only JSON." },
          ],
        }],
        config: { systemInstruction: SYSTEM_PROMPT, maxOutputTokens: 8192 },
      });

      let jsonStr = response.text?.trim() || "";
      if (jsonStr.startsWith("```")) jsonStr = jsonStr.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");

      const parsed = safeParseRecipes(jsonStr);
      if (!parsed) {
        return NextResponse.json({ error: "Could not read recipes from that document" }, { status: 502 });
      }

      // Auto-parse ingredients for each recipe
      const results = [];
      for (const recipe of parsed.recipes || []) {
        let ingredients: { ingredientId: number; quantity: number; unitId: number; notes: string; optional: boolean }[] = [];
        if (recipe.ingredients?.length) {
          try {
            const parsedIngs = await parseIngredientLines(recipe.ingredients);
            ingredients = parsedIngs.map((p) => ({
              ingredientId: p.ingredientId,
              quantity: p.quantity,
              unitId: p.unitId,
              notes: p.notes,
              optional: p.optional,
            }));
          } catch {}
        }

        const created = await prisma.recipe.create({
          data: {
            householdId,
            name: recipe.name || "Untitled Recipe",
            description: recipe.description || null,
            instructions: recipe.instructions || "",
            servings: recipe.servings || 4,
            prepTimeMinutes: recipe.prepTimeMinutes || null,
            cookTimeMinutes: recipe.cookTimeMinutes || null,
            sourceType: "PERSONAL",
            ingredients: ingredients.length ? { create: ingredients.map((ing, idx) => ({ ...ing, sortOrder: idx })) } : undefined,
          },
        });
        results.push({ id: created.id, name: created.name });
      }

      return NextResponse.json({ imported: results.length, recipes: results });
    }
  } else if (text) {
    content = text;
  } else {
    return NextResponse.json({ error: "File or text required" }, { status: 400 });
  }

  // Process text content with Gemini
  const ai = new GoogleGenAI({ apiKey });
  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash-lite",
    contents: [{ role: "user", parts: [{ text: `Extract all recipes from this text:\n\n${content}` }] }],
    config: { systemInstruction: SYSTEM_PROMPT, maxOutputTokens: 8192 },
  });

  let jsonStr = response.text?.trim() || "";
  if (jsonStr.startsWith("```")) jsonStr = jsonStr.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");

  const parsed = safeParseRecipes(jsonStr);
  if (!parsed) {
    return NextResponse.json({ error: "Could not read recipes from that text" }, { status: 502 });
  }

  const results = [];
  for (const recipe of parsed.recipes || []) {
    let ingredients: { ingredientId: number; quantity: number; unitId: number; notes: string; optional: boolean }[] = [];
    if (recipe.ingredients?.length) {
      try {
        const parsedIngs = await parseIngredientLines(recipe.ingredients);
        ingredients = parsedIngs.map((p) => ({
          ingredientId: p.ingredientId,
          quantity: p.quantity,
          unitId: p.unitId,
          notes: p.notes,
          optional: p.optional,
        }));
      } catch {}
    }

    const created = await prisma.recipe.create({
      data: {
        householdId,
        name: recipe.name || "Untitled Recipe",
        description: recipe.description || null,
        instructions: recipe.instructions || "",
        servings: recipe.servings || 4,
        prepTimeMinutes: recipe.prepTimeMinutes || null,
        cookTimeMinutes: recipe.cookTimeMinutes || null,
        sourceType: "PERSONAL",
        ingredients: ingredients.length ? { create: ingredients.map((ing, idx) => ({ ...ing, sortOrder: idx })) } : undefined,
      },
    });
    results.push({ id: created.id, name: created.name });
  }

  return NextResponse.json({ imported: results.length, recipes: results });
}
