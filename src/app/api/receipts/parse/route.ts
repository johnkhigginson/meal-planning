import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";

const SYSTEM_PROMPT = `You are a grocery receipt parser. Given a photo of a grocery receipt, extract each purchased item with its name and quantity.

Return ONLY valid JSON with this structure (no markdown, no code fences):
{
  "storeName": "Store Name or null if not visible",
  "items": [
    {
      "name": "item name (normalized, lowercase, e.g. 'chicken breast', 'whole milk', 'bananas')",
      "quantity": 1,
      "unit": "each"
    }
  ]
}

Rules:
- Normalize item names to common grocery terms (e.g. "BNLS SKNLS CHKN BRST" → "chicken breast")
- Default quantity to 1 and unit to "each" if not specified on the receipt
- For weighted items, use the weight and appropriate unit (lb, oz, etc.)
- For liquid items, use volume units if listed (gallon, oz, etc.)
- Skip non-food items like bags, tax lines, totals, discounts, and payment info
- Skip duplicate/subtotal lines
- Keep it simple: just the food/grocery items`;

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const file = formData.get("receipt") as File | null;

  if (!file) {
    return NextResponse.json({ error: "Receipt photo is required" }, { status: 400 });
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
      model: "gemini-2.5-flash-lite",
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
              text: "Extract all grocery items from this receipt. Return only JSON.",
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

    let jsonStr = text;
    if (jsonStr.startsWith("```")) {
      jsonStr = jsonStr.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
    }

    const result = JSON.parse(jsonStr);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to parse receipt";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
