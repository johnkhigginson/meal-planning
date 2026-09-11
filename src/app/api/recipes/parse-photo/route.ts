import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";
import { GEMINI_MODEL, guardAi } from "@/lib/ai";

const SYSTEM_PROMPT = `You are a recipe extraction assistant. Given a photo of a cookbook page or recipe card, extract the recipe information and return it as JSON.

Return ONLY valid JSON with this structure (no markdown, no code fences):
{
  "name": "Recipe Name",
  "description": "Brief description of the dish",
  "servings": 4,
  "prepTimeMinutes": 15,
  "cookTimeMinutes": 30,
  "ingredients": [
    "2 cups all-purpose flour",
    { "text": "1 cup buttermilk", "section": "Biscuit topping" }
  ],
  "instructions": "Step 1. Do this.\\nStep 2. Do that.\\nStep 3. Finish."
}

Rules:
- Extract ALL ingredients exactly as written, including quantities and units
- Number each instruction step
- If a field is not visible or unclear, use null
- For servings, extract the number only
- Keep ingredient strings exactly as they appear (don't split into structured data)
- A recipe whose ingredients are split into groups ("For the filling", "Biscuit topping") keeps that grouping: give those lines a "section" with the group's heading. Use a plain string for lines that belong to no group, and never emit a heading as an ingredient of its own.
- Instruction steps that are grouped the same way get a "--- Group name ---" line of their own before the steps in that group, with numbering restarting at 1 inside each group.`;

export async function POST(request: NextRequest) {
  // Signed in, AI allowed on this account, and within the request budget.
  const guard = await guardAi("ai-photo");
  if (!guard.ok) return guard.response;

  const formData = await request.formData();
  const file = formData.get("photo") as File | null;

  if (!file) {
    return NextResponse.json({ error: "Photo is required" }, { status: 400 });
  }
  if (file.size > 10 * 1024 * 1024) {
    return NextResponse.json({ error: "Photo is too large (max 10MB)" }, { status: 400 });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "GEMINI_API_KEY not configured" },
      { status: 500 }
    );
  }

  try {
    const bytes = await file.arrayBuffer();
    const base64 = Buffer.from(bytes).toString("base64");

    const ai = new GoogleGenAI({ apiKey });

    const response = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: [
        {
          role: "user",
          parts: [
            {
              inlineData: {
                mimeType: file.type || "image/jpeg",
                data: base64,
              },
            },
            {
              text: "Extract the recipe from this photo. Return only JSON.",
            },
          ],
        },
      ],
      config: {
        systemInstruction: SYSTEM_PROMPT,
        maxOutputTokens: 4096,
      },
    });

    const text = response.text?.trim();
    if (!text) {
      return NextResponse.json(
        { error: "No response from AI" },
        { status: 500 }
      );
    }

    // Parse JSON from response (handle potential code fences)
    let jsonStr = text;
    if (jsonStr.startsWith("```")) {
      jsonStr = jsonStr.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
    }

    const recipe = JSON.parse(jsonStr);
    return NextResponse.json(recipe);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to parse photo";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
