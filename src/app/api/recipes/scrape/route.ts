import { NextRequest, NextResponse } from "next/server";
import { enforceRateLimit, ipKey } from "@/lib/rate-limit";
import { RecipeScrapeError, scrapeRecipeUrl, type ScrapeErrorCode } from "@/lib/recipe-fetch";

export const runtime = "nodejs";
// Worst case is the fetcher's 15s budget plus parsing.
export const maxDuration = 30;

const STATUS: Record<ScrapeErrorCode, number> = {
  INVALID_URL: 400,
  NOT_FOUND: 404,
  NO_RECIPE: 422,
  BLOCKED: 502,
  FETCH_FAILED: 502,
  TIMEOUT: 504,
};

export async function POST(request: NextRequest) {
  const limited = enforceRateLimit("scrape", ipKey(request), 20, 60_000);
  if (limited) return limited;

  const { url } = await request.json();
  if (!url || typeof url !== "string") {
    return NextResponse.json({ error: "URL is required", code: "INVALID_URL" }, { status: 400 });
  }

  try {
    const recipe = await scrapeRecipeUrl(url);
    return NextResponse.json(recipe);
  } catch (err) {
    if (err instanceof RecipeScrapeError) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: STATUS[err.code] });
    }
    console.error("Recipe import failed", url, err);
    return NextResponse.json(
      { error: "Something went wrong importing that page.", code: "FETCH_FAILED" },
      { status: 500 }
    );
  }
}
