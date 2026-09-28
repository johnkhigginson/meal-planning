import * as cheerio from "cheerio";
import {
  cleanSectionName,
  formatSectionHeading,
  groupBySection,
  type ImportedIngredient,
} from "@/lib/recipe-sections";

// Reads a recipe off a web page: schema.org JSON-LD when the site publishes it
// (nearly all recipe sites do), falling back to common HTML patterns. Kept out
// of the route handler so it can be exercised against saved pages.

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ",
  rsquo: "\u2019", lsquo: "\u2018", rdquo: "\u201d", ldquo: "\u201c",
  ndash: "\u2013", mdash: "\u2014", hellip: "\u2026", deg: "\u00b0",
  frac12: "\u00bd", frac14: "\u00bc", frac34: "\u00be",
  frac13: "\u2153", frac23: "\u2154", times: "\u00d7",
};

// JSON-LD recipe fields routinely carry HTML entities ("half &amp; half",
// "don&#39;t add salt"). Decode them rather than dropping them, which is what
// used to turn apostrophes into spaces.
// A code point past U+10FFFF makes String.fromCodePoint throw, which turned one
// bad entity into a failed import.
function fromCodePoint(match: string, code: number): string {
  return code <= 0x10ffff ? String.fromCodePoint(code) : match;
}

function decodeEntities(text: string): string {
  const once = (s: string) =>
    s
      .replace(/&#x([0-9a-f]+);/gi, (m, hex) => fromCodePoint(m, parseInt(hex, 16)))
      .replace(/&#(\d+);/g, (m, dec) => fromCodePoint(m, parseInt(dec, 10)))
      .replace(/&([a-z][a-z0-9]*);/gi, (m, name) => NAMED_ENTITIES[name.toLowerCase()] ?? m);
  // Sites often double-encode ("don&amp;#39;t"), so a second pass finishes
  // the job.
  return once(once(text));
}

const stripTags = (text: string) => text.replace(/<[^>]*>/g, "");

function cleanText(text: string): string {
  // Strip again after decoding, since "&lt;b&gt;" decodes into a tag.
  return stripTags(decodeEntities(stripTags(text)))
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export interface ScrapedRecipe {
  name: string;
  description: string;
  instructions: string;
  servings: number | null;
  prepTimeMinutes: number | null;
  cookTimeMinutes: number | null;
  // Each line keeps the ingredient group it came from ("Pot Pie Filling"), or
  // null when the recipe has one undivided list.
  ingredients: ImportedIngredient[];
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

// ─── Ingredient groups ──────────────────────────────────────────
//
// Recipe plugins (WP Recipe Maker, Tasty Recipes, Mediavine Create) render an
// ingredient list broken into named groups, but publish a single flat
// `recipeIngredient` array in JSON-LD. The group names exist only in the HTML,
// so that is where we read them from.

const INGREDIENT_ITEM_SELECTORS = [
  "li.wprm-recipe-ingredient",
  ".tasty-recipes-ingredients li",
  ".mv-create-ingredients li",
  '[itemprop="recipeIngredient"]',
  '[itemprop="ingredients"]',
  ".recipe-ingredients li",
  ".ingredients li",
];

const GROUP_HEADING_SELECTOR = 'h2, h3, h4, h5, h6, legend, [class*="group-name"]';

// Headings that label the list as a whole rather than a group inside it.
// The list's own header often holds serving and unit toggles ("Ingredients
// 1x2x3x", "US Customary Metric"). Drop those before judging the text, or the
// unnamed first group gets labeled "Ingredients 1x2x3x".
const HEADER_CONTROLS = /\b(?:\d+(?:\.\d+)?x)+\b|\b(?:us customary|metric)\b/gi;

const NOT_A_GROUP_NAME =
  /^(ingredients?|equipment|instructions?|directions?|method|notes?|nutrition|what you need)$/i;

// The nearest element containing every matched ingredient row. The ordered walk
// below is scoped to it, so headings from elsewhere on the page (sidebars,
// related posts) can't leak in as group names.
function commonAncestor($: cheerio.CheerioAPI, nodes: unknown[]): unknown | null {
  let ancestor = (nodes[0] as { parent?: unknown })?.parent ?? null;
  while (ancestor) {
    const current = ancestor;
    if (nodes.every((n) => $.contains(current as never, n as never))) return current;
    ancestor = (current as { parent?: unknown }).parent ?? null;
  }
  return null;
}

// Ingredient lines in document order, each tagged with the group heading that
// precedes it. Returns null when the page has no recognizable ingredient list.
export function extractIngredientLines($: cheerio.CheerioAPI): ImportedIngredient[] | null {
  for (const selector of INGREDIENT_ITEM_SELECTORS) {
    const items = $(selector);
    if (items.length === 0) continue;

    const nodes = items.toArray();
    const ancestor = commonAncestor($, nodes);
    if (!ancestor) continue;

    const itemNodes = new Set<unknown>(nodes);
    const lines: ImportedIngredient[] = [];
    let section: string | null = null;

    $(ancestor as never)
      .find("*")
      .each((_, el) => {
        if (itemNodes.has(el)) {
          const text = cleanText($(el).text());
          if (text) lines.push({ text, section });
          return;
        }
        if ($(el).is(GROUP_HEADING_SELECTOR)) {
          const name = cleanSectionName(cleanText($(el).text()).replace(HEADER_CONTROLS, ""));
          // A long "heading" is almost always a stray paragraph, not a label.
          if (name && name.length <= 80 && !NOT_A_GROUP_NAME.test(name)) section = name;
        }
      });

    if (lines.length > 0) return lines;
  }

  return null;
}

// JSON-LD carries the canonical ingredient text; the HTML carries the group
// names. Marry them by position, and only when both lists are the same length.
// A mismatch means our HTML read missed or invented a row, and a misaligned
// group name is worse than no group at all.
function applyIngredientSections(
  jsonLdIngredients: string[],
  htmlLines: ImportedIngredient[] | null
): ImportedIngredient[] {
  if (!htmlLines || htmlLines.length !== jsonLdIngredients.length) {
    return jsonLdIngredients.map((text) => ({ text, section: null }));
  }
  return jsonLdIngredients.map((text, idx) => ({ text, section: htmlLines[idx].section }));
}

interface RawStep {
  section: string | null;
  text: string;
}

// Flattens schema.org instructions (plain strings, HowToStep, HowToSection)
// into steps that remember which section they belong to.
function collectSteps(raw: unknown[]): RawStep[] {
  const steps: RawStep[] = [];

  const pushStep = (value: unknown, section: string | null) => {
    if (typeof value === "string") {
      const text = cleanText(value);
      if (text) steps.push({ section, text });
      return;
    }
    const item = value as { text?: string; description?: string } | null;
    const text = cleanText(item?.text || item?.description || "");
    if (text) steps.push({ section, text });
  };

  for (const item of raw) {
    const node = item as { "@type"?: string; name?: string; itemListElement?: unknown[] } | null;
    if (node?.["@type"] === "HowToSection" && Array.isArray(node.itemListElement)) {
      const section = cleanSectionName(cleanText(node.name || ""));
      for (const sub of node.itemListElement) pushStep(sub, section);
      continue;
    }
    pushStep(item, null);
  }

  return steps;
}

// Renders steps into the stored instructions blob: a heading line per section,
// with step numbers restarting inside each one, the way the source page shows
// them. Without sections this is a plain numbered list, as before.
function renderInstructions(steps: RawStep[]): string {
  return groupBySection(steps)
    .map((group) => {
      const body = group.items.map((step, idx) => `${idx + 1}. ${step.text}`).join("\n");
      return group.name ? `${formatSectionHeading(group.name)}\n${body}` : body;
    })
    .filter(Boolean)
    .join("\n\n");
}

export function extractJsonLdRecipe(html: string): ScrapedRecipe | null {
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

      // Extract instructions - handle many formats
      let instructions = "";
      const rawInstructions = data.recipeInstructions;
      if (typeof rawInstructions === "string") {
        // Could be HTML or plain text
        instructions = cleanText(rawInstructions);
      } else if (Array.isArray(rawInstructions)) {
        instructions = renderInstructions(collectSteps(rawInstructions));
      }

      // Extract ingredients, restoring the group headings from the page HTML.
      let ingredients: ImportedIngredient[] = [];
      if (Array.isArray(data.recipeIngredient)) {
        const flatLines = data.recipeIngredient.map((i: string) =>
          typeof i === "string" ? cleanText(i) : cleanText(String(i))
        );
        ingredients = applyIngredientSections(flatLines, extractIngredientLines($));
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
        name: cleanText(String(data.name || "")),
        description: cleanText(String(data.description || "")),
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

export function extractFallback(html: string): ScrapedRecipe | null {
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

  // Try to find ingredients, keeping any group headings they sit under
  const ingredients: ImportedIngredient[] = extractIngredientLines($) ?? [];

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

// The page-level entry point: structured data first, then a best-effort read of
// the markup.
export function extractRecipeFromHtml(html: string): ScrapedRecipe | null {
  return extractJsonLdRecipe(html) || extractFallback(html);
}
