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

function parseDuration(iso8601: unknown): number | null {
  if (!iso8601 || typeof iso8601 !== "string") return null;
  const match = iso8601.match(/P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return null;
  const days = parseInt(match[1] || "0", 10);
  const hours = parseInt(match[2] || "0", 10);
  const minutes = parseInt(match[3] || "0", 10);
  return days * 1440 + hours * 60 + minutes || null;
}

function parseServings(raw: unknown): number | null {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (value == null) return null;
  const match = String(value).match(/\d+/);
  return match ? parseInt(match[0], 10) : null;
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

// schema.org types arrive as "Recipe", ["Recipe", "NewsArticle"], or a full IRI
// like "http://schema.org/Recipe".
function hasType(node: unknown, type: string): boolean {
  if (!node || typeof node !== "object") return false;
  const raw = (node as { "@type"?: unknown })["@type"];
  const types = Array.isArray(raw) ? raw : [raw];
  return types.some((t) => typeof t === "string" && t.replace(/^.*[/:]/, "") === type);
}

// Flattens schema.org instructions (plain strings, HowToStep, HowToSection,
// sections inside sections) into steps that remember which section they belong
// to.
function collectSteps(raw: unknown): RawStep[] {
  const steps: RawStep[] = [];

  const walk = (value: unknown, section: string | null) => {
    if (Array.isArray(value)) {
      for (const item of value) walk(item, section);
      return;
    }
    if (typeof value === "string") {
      const text = cleanText(value);
      if (text) steps.push({ section, text });
      return;
    }
    if (!value || typeof value !== "object") return;

    const node = value as { name?: string; text?: string; description?: string; itemListElement?: unknown };
    if (hasType(node, "HowToSection")) {
      walk(node.itemListElement, cleanSectionName(cleanText(node.name || "")) ?? section);
      return;
    }
    const text = cleanText(node.text || node.description || "");
    if (text) steps.push({ section, text });
    else if (node.itemListElement) walk(node.itemListElement, section);
  };

  walk(raw, null);
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

// Finds the Recipe node wherever the site put it: at the top level, in an
// array, in @graph, or under a page's mainEntity.
function findRecipeNode(data: unknown, depth = 0): Record<string, unknown> | null {
  if (!data || typeof data !== "object" || depth > 5) return null;
  if (Array.isArray(data)) {
    for (const item of data) {
      const found = findRecipeNode(item, depth + 1);
      if (found) return found;
    }
    return null;
  }
  const node = data as Record<string, unknown>;
  if (hasType(node, "Recipe")) return node;
  for (const key of ["@graph", "mainEntity"]) {
    const found = findRecipeNode(node[key], depth + 1);
    if (found) return found;
  }
  return null;
}

// Some sites emit JSON-LD with raw newlines or tabs inside strings, which
// JSON.parse rejects. Retry with those control characters turned into spaces.
function parseJsonLd(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return JSON.parse(text.replace(/[\u0000-\u001f]+/g, " "));
  }
}

function imageFrom(raw: unknown): string | null {
  const first = Array.isArray(raw) ? raw[0] : raw;
  if (typeof first === "string") return first;
  if (first && typeof first === "object") {
    const url = (first as { url?: unknown }).url;
    if (typeof url === "string") return url;
  }
  return null;
}

export function extractJsonLdRecipe(html: string): ScrapedRecipe | null {
  const $ = cheerio.load(html);
  const scripts = $('script[type="application/ld+json"]');

  for (let i = 0; i < scripts.length; i++) {
    try {
      const text = $(scripts[i]).html();
      if (!text) continue;

      const data = findRecipeNode(parseJsonLd(text));
      if (!data) continue;

      // Extract instructions - handle many formats
      let instructions = "";
      const rawInstructions = data.recipeInstructions;
      if (typeof rawInstructions === "string") {
        // Could be HTML or plain text
        instructions = cleanText(rawInstructions);
      } else if (rawInstructions && typeof rawInstructions === "object") {
        instructions = renderInstructions(collectSteps(rawInstructions));
      }

      // Extract ingredients, restoring the group headings from the page HTML.
      // Older markup uses "ingredients", and a few sites send one string.
      let ingredients: ImportedIngredient[] = [];
      const rawIngredients = data.recipeIngredient ?? data.ingredients;
      const ingredientList = Array.isArray(rawIngredients)
        ? rawIngredients
        : typeof rawIngredients === "string"
          ? [rawIngredients]
          : [];
      if (ingredientList.length > 0) {
        const flatLines = ingredientList.map((i) => cleanText(String(i))).filter(Boolean);
        ingredients = applyIngredientSections(flatLines, extractIngredientLines($));
      }

      return {
        name: cleanText(String(data.name || "")),
        description: cleanText(String(data.description || "")),
        instructions,
        servings: parseServings(data.recipeYield),
        prepTimeMinutes: parseDuration(data.prepTime),
        cookTimeMinutes: parseDuration(data.cookTime),
        ingredients,
        imageUrl: imageFrom(data.image),
      };
    } catch {
      continue;
    }
  }

  return null;
}

// ─── Microdata ──────────────────────────────────────────────────
//
// Older recipe plugins and hand-built sites mark the recipe up with
// itemscope/itemprop attributes instead of JSON-LD.

export function extractMicrodataRecipe(html: string): ScrapedRecipe | null {
  const $ = cheerio.load(html);
  const scope = $("[itemscope][itemtype]")
    .filter((_, el) => /schema\.org\/Recipe$/i.test($(el).attr("itemtype")?.trim() ?? ""))
    .first();
  if (scope.length === 0) return null;

  // Properties of the recipe itself, not of things nested inside it (the
  // author's name, a review's rating).
  const props = (name: string) =>
    scope
      .find(`[itemprop~="${name}"]`)
      .filter((_, el) => $(el).parent().closest("[itemscope]")[0] === scope[0]);

  const valueOf = (el: Parameters<typeof $>[0]) => {
    const node = $(el);
    return (
      node.attr("content") ??
      node.attr("datetime") ??
      (node.is("img") ? node.attr("src") : undefined) ??
      (node.is("a, link") ? node.attr("href") : undefined) ??
      node.text()
    );
  };
  const first = (name: string) => {
    const el = props(name).first();
    return el.length ? cleanText(valueOf(el[0]) ?? "") : "";
  };

  const steps: RawStep[] = [];
  props("recipeInstructions").each((_, el) => {
    const node = $(el);
    const stepText = node.find('[itemprop="text"]');
    const items = stepText.length ? stepText : node.find("li");
    if (items.length) {
      items.each((_, item) => {
        const text = cleanText($(item).text());
        if (text) steps.push({ section: null, text });
      });
      return;
    }
    const text = cleanText(node.text());
    if (text) steps.push({ section: null, text });
  });

  const flatLines = [...props("recipeIngredient").toArray(), ...props("ingredients").toArray()]
    .map((el) => cleanText($(el).text()))
    .filter(Boolean);

  const name = first("name");
  if (!name || (flatLines.length === 0 && steps.length === 0)) return null;

  const image = props("image").first();
  return {
    name,
    description: first("description"),
    instructions: renderInstructions(steps),
    servings: parseServings(first("recipeYield")),
    prepTimeMinutes: parseDuration(first("prepTime")),
    cookTimeMinutes: parseDuration(first("cookTime")),
    ingredients: applyIngredientSections(flatLines, extractIngredientLines($)),
    imageUrl: image.length ? valueOf(image[0])?.trim() || null : null,
  };
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
    ".wprm-recipe-instructions",
    ".tasty-recipes-instructions",
    ".mv-create-instructions",
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

// Structured data only: JSON-LD, then microdata. The fetcher uses this to decide
// whether an alternate copy of the page (AMP, print) is worth trying before it
// settles for the heuristic read.
export function extractStructuredRecipe(html: string): ScrapedRecipe | null {
  return extractJsonLdRecipe(html) || extractMicrodataRecipe(html);
}

// The page-level entry point: structured data first, then a best-effort read of
// the markup.
export function extractRecipeFromHtml(html: string): ScrapedRecipe | null {
  return extractStructuredRecipe(html) || extractFallback(html);
}
