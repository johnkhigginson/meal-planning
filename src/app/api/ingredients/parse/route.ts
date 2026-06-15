import { NextRequest, NextResponse } from "next/server";
import { parseIngredientLines } from "@/lib/ingredient-parse";
import { enforceRateLimit, ipKey } from "@/lib/rate-limit";

export async function POST(request: NextRequest) {
  const limited = enforceRateLimit("ing-parse", ipKey(request), 30, 60_000);
  if (limited) return limited;

  const { ingredients: rawList } = await request.json();

  if (!Array.isArray(rawList) || rawList.length === 0) {
    return NextResponse.json({ error: "ingredients array required" }, { status: 400 });
  }

  const results = await parseIngredientLines(rawList);
  return NextResponse.json(results);
}
