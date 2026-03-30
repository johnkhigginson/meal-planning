import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";

const SYSTEM_PROMPT = `You are a grocery receipt parser. Given a photo of a grocery receipt, extract each purchased item with structured detail.

Return ONLY valid JSON with this structure (no markdown, no code fences):
{
  "storeName": "Store Name or null if not visible",
  "items": [
    {
      "rawName": "exactly as printed on receipt",
      "genericName": "generic ingredient name for pantry tracking (e.g. 'chicken breast' not 'Tyson Boneless Skinless Chicken Breast')",
      "brand": "brand name or null",
      "size": "package size as printed (e.g. '16 oz', '1 lb', '1 gal') or null",
      "quantity": 1,
      "unit": "each",
      "price": 4.99,
      "category": "one of: Produce, Dairy, Meat, Seafood, Pantry, Frozen, Bakery, Beverages, Condiments, Spices, Other"
    }
  ]
}

Rules:
- genericName should be the common ingredient name stripped of brand, size, and descriptors. Examples:
  - "BNLS SKNLS CHKN BRST" → genericName: "chicken breast"
  - "GV 2% MILK 1GAL" → genericName: "milk", brand: "Great Value", size: "1 gal"
  - "ORGANIC BABY SPINACH 5OZ" → genericName: "baby spinach", size: "5 oz"
  - "KROGER SHARP CHEDDAR 8OZ" → genericName: "sharp cheddar cheese", brand: "Kroger", size: "8 oz"
- Always include the price if visible on the receipt
- Parse abbreviated sizes: 16OZ → "16 oz", 1LB → "1 lb", 1GAL → "1 gal"
- For produce sold by weight, use the weight and lb/oz unit
- quantity is number of that item purchased (usually 1, but 2 if bought twice)
- unit for pantry: use weight/volume if on package, otherwise "each"
- Skip non-grocery items: bags, tax, subtotals, totals, discounts, payment, change, coupons
- Skip duplicate/subtotal lines`;

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
              text: "Extract all grocery items from this receipt with generic names, brands, sizes, and prices. Return only JSON.",
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
