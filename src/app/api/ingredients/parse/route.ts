import { NextRequest, NextResponse } from "next/server";
import { parseIngredientLines } from "@/lib/ingredient-parse";

export async function POST(request: NextRequest) {
  const { ingredients: rawList } = await request.json();

  if (!Array.isArray(rawList) || rawList.length === 0) {
    return NextResponse.json({ error: "ingredients array required" }, { status: 400 });
  }

  const results = await parseIngredientLines(rawList);
  return NextResponse.json(results);
}
