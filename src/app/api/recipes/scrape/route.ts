import { NextRequest, NextResponse } from "next/server";
import { enforceRateLimit, ipKey } from "@/lib/rate-limit";
import { safeFetch } from "@/lib/ssrf";
import { extractRecipeFromHtml } from "@/lib/recipe-scrape";

export async function POST(request: NextRequest) {
  const limited = enforceRateLimit("scrape", ipKey(request), 20, 60_000);
  if (limited) return limited;

  const { url } = await request.json();
  if (!url || typeof url !== "string") {
    return NextResponse.json({ error: "URL is required" }, { status: 400 });
  }

  try {
    const response = await safeFetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: `Failed to fetch URL: ${response.status}` },
        { status: 400 }
      );
    }

    const html = await response.text();
    const recipe = extractRecipeFromHtml(html);

    if (!recipe) {
      return NextResponse.json(
        { error: "Could not find recipe data on this page" },
        { status: 404 }
      );
    }

    return NextResponse.json(recipe);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to scrape URL";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
