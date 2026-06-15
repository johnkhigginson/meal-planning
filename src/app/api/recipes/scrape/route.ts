import { NextRequest, NextResponse } from "next/server";
import * as cheerio from "cheerio";
import { enforceRateLimit, ipKey } from "@/lib/rate-limit";

function cleanText(text: string): string {
  return text
    .replace(/&nbsp;/g, " ")
    .replace(/&#\d+;/g, " ")
    .replace(/<[^>]*>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

interface ScrapedRecipe {
  name: string;
  description: string;
  instructions: string;
  servings: number | null;
  prepTimeMinutes: number | null;
  cookTimeMinutes: number | null;
  ingredients: string[];
  imageUrl: string | null;
}

function parseDuration(iso8601: string): number | null {
  if (!iso8601) return null;
  const match = iso8601.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return null;
  const hours = parseInt(match[1] || "0", 10);
  const minutes = parseInt(match[2] || "0", 10);
  return hours * 60 + minutes || null;
}

function extractJsonLdRecipe(html: string): ScrapedRecipe | null {
  const $ = cheerio.load(html);
  const scripts = $('script[type="application/ld+json"]');

  for (let i = 0; i < scripts.length; i++) {
    try {
      const text = $(scripts[i]).html();
      if (!text) continue;

      let data = JSON.parse(text);

      // Handle @graph arrays
      if (data["@graph"]) {
        data = data["@graph"];
      }

      // Handle arrays
      if (Array.isArray(data)) {
        data = data.find(
          (item: Record<string, unknown>) =>
            item["@type"] === "Recipe" ||
            (Array.isArray(item["@type"]) &&
              (item["@type"] as string[]).includes("Recipe"))
        );
      }

      if (!data) continue;

      const type = data["@type"];
      if (type !== "Recipe" && !(Array.isArray(type) && type.includes("Recipe"))) {
        continue;
      }

      // Extract instructions — handle many formats
      let instructions = "";
      const rawInstructions = data.recipeInstructions;
      if (typeof rawInstructions === "string") {
        // Could be HTML or plain text
        instructions = cleanText(rawInstructions);
      } else if (Array.isArray(rawInstructions)) {
        const steps: string[] = [];
        for (const item of rawInstructions) {
          if (typeof item === "string") {
            steps.push(cleanText(item));
          } else if (item?.["@type"] === "HowToStep") {
            steps.push(cleanText(item.text || item.description || ""));
          } else if (
            item?.["@type"] === "HowToSection" &&
            Array.isArray(item.itemListElement)
          ) {
            if (item.name) steps.push(`--- ${cleanText(item.name)} ---`);
            for (const sub of item.itemListElement) {
              if (typeof sub === "string") {
                steps.push(cleanText(sub));
              } else {
                steps.push(cleanText(sub?.text || sub?.description || ""));
              }
            }
          } else if (item?.text) {
            steps.push(cleanText(item.text));
          } else if (item?.description) {
            steps.push(cleanText(item.description));
          }
        }
        instructions = steps
          .filter(Boolean)
          .map((step, idx) =>
            step.startsWith("---") ? step : `${idx + 1}. ${step}`
          )
          .join("\n");
      }

      // Extract ingredients
      let ingredients: string[] = [];
      if (Array.isArray(data.recipeIngredient)) {
        ingredients = data.recipeIngredient.map((i: string) =>
          typeof i === "string" ? cleanText(i) : cleanText(String(i))
        );
      }

      // Extract servings
      let servings: number | null = null;
      if (data.recipeYield) {
        const yieldVal = Array.isArray(data.recipeYield)
          ? data.recipeYield[0]
          : data.recipeYield;
        const match = String(yieldVal).match(/\d+/);
        if (match) servings = parseInt(match[0], 10);
      }

      // Extract image
      let imageUrl: string | null = null;
      if (data.image) {
        if (typeof data.image === "string") {
          imageUrl = data.image;
        } else if (Array.isArray(data.image)) {
          imageUrl = typeof data.image[0] === "string" ? data.image[0] : data.image[0]?.url;
        } else if (data.image.url) {
          imageUrl = data.image.url;
        }
      }

      return {
        name: data.name || "",
        description: data.description || "",
        instructions,
        servings,
        prepTimeMinutes: parseDuration(data.prepTime),
        cookTimeMinutes: parseDuration(data.cookTime),
        ingredients,
        imageUrl,
      };
    } catch {
      continue;
    }
  }

  return null;
}

function extractFallback(html: string): ScrapedRecipe | null {
  const $ = cheerio.load(html);

  const name =
    $("h1").first().text().trim() ||
    $('meta[property="og:title"]').attr("content") ||
    $("title").text().trim() ||
    "";

  const description =
    $('meta[name="description"]').attr("content") ||
    $('meta[property="og:description"]').attr("content") ||
    "";

  const imageUrl =
    $('meta[property="og:image"]').attr("content") || null;

  if (!name) return null;

  // Try to find instructions from common selectors
  let instructions = "";
  const instructionSelectors = [
    '[itemprop="recipeInstructions"]',
    ".recipe-instructions",
    ".instructions",
    ".recipe-directions",
    ".directions",
    ".steps",
    ".recipe-steps",
  ];
  for (const sel of instructionSelectors) {
    const el = $(sel);
    if (el.length) {
      const items = el.find("li, p, [itemprop='step'], [itemprop='text']");
      if (items.length) {
        instructions = items
          .map((_: number, e: unknown) => cleanText($(e as string).text()))
          .get()
          .filter(Boolean)
          .map((s: string, i: number) => `${i + 1}. ${s}`)
          .join("\n");
      } else {
        instructions = cleanText(el.text());
      }
      if (instructions) break;
    }
  }

  // Try to find ingredients
  let ingredients: string[] = [];
  const ingredientSelectors = [
    '[itemprop="recipeIngredient"]',
    '[itemprop="ingredients"]',
    ".recipe-ingredients li",
    ".ingredients li",
  ];
  for (const sel of ingredientSelectors) {
    const items = $(sel);
    if (items.length) {
      ingredients = items
        .map((_: number, e: unknown) => cleanText($(e as string).text()))
        .get()
        .filter(Boolean);
      if (ingredients.length) break;
    }
  }

  return {
    name,
    description,
    instructions,
    servings: null,
    prepTimeMinutes: null,
    cookTimeMinutes: null,
    ingredients,
    imageUrl,
  };
}

export async function POST(request: NextRequest) {
  const limited = enforceRateLimit("scrape", ipKey(request), 20, 60_000);
  if (limited) return limited;

  const { url } = await request.json();
  if (!url || typeof url !== "string") {
    return NextResponse.json({ error: "URL is required" }, { status: 400 });
  }

  try {
    const response = await fetch(url, {
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
    const recipe = extractJsonLdRecipe(html) || extractFallback(html);

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
