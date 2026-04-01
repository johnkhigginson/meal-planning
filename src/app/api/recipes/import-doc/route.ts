import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";
import { prisma } from "@/lib/prisma";
import { requireHouseholdId } from "@/lib/auth";

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

export async function POST(request: NextRequest) {
  const householdId = await requireHouseholdId();
  const formData = await request.formData();
  const file = formData.get("document") as File | null;
  const text = formData.get("text") as string | null;

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

      const parsed = JSON.parse(jsonStr);

      // Auto-parse ingredients for each recipe
      const results = [];
      for (const recipe of parsed.recipes || []) {
        let ingredients: { ingredientId: number; quantity: number; unitId: number; notes: string; optional: boolean }[] = [];
        if (recipe.ingredients?.length) {
          try {
            const parseRes = await fetch(new URL("/api/ingredients/parse", request.url).toString(), {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ ingredients: recipe.ingredients }),
            });
            if (parseRes.ok) {
              const parsedIngs = await parseRes.json();
              ingredients = parsedIngs.map((p: { ingredientId: number; quantity: number; unitId: number; notes: string; optional: boolean }) => ({
                ingredientId: p.ingredientId,
                quantity: p.quantity,
                unitId: p.unitId,
                notes: p.notes,
                optional: p.optional,
              }));
            }
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

  const parsed = JSON.parse(jsonStr);

  const results = [];
  for (const recipe of parsed.recipes || []) {
    let ingredients: { ingredientId: number; quantity: number; unitId: number; notes: string; optional: boolean }[] = [];
    if (recipe.ingredients?.length) {
      try {
        const parseRes = await fetch(new URL("/api/ingredients/parse", request.url).toString(), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ingredients: recipe.ingredients }),
        });
        if (parseRes.ok) {
          const parsedIngs = await parseRes.json();
          ingredients = parsedIngs.map((p: { ingredientId: number; quantity: number; unitId: number; notes: string; optional: boolean }) => ({
            ingredientId: p.ingredientId,
            quantity: p.quantity,
            unitId: p.unitId,
            notes: p.notes,
            optional: p.optional,
          }));
        }
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
