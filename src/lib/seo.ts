// Pure builders for page titles, meta descriptions and JSON-LD on the public
// site. No DB access, so scripts/verify-seo.ts can check them on fixtures.

import type { Metadata } from "next";
import { cleanIngredientNote, formatIngredient } from "@/lib/ingredient-format";
import { parseSteps } from "@/lib/parse-steps";
import { parseInstructionSections } from "@/lib/recipe-sections";
import { recipeAuthorName } from "@/lib/recipe-author";
import { absoluteUrl, getSiteUrl, SITE_NAME } from "@/lib/site";

// The root layout's title template appends this to every page title.
export const TITLE_SUFFIX = ` | ${SITE_NAME}`;
const TITLE_MAX = 60;
const DESCRIPTION_MAX = 155;

// Cuts text at a word boundary so it fits in `max` characters, ellipsis included.
export function truncateText(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1).replace(/\s+\S*$/, "").replace(/[\s,;:.]+$/, "");
  return `${cut || text.slice(0, max - 1)}…`;
}

// A page title that stays under about 60 characters once the suffix is added.
export function pageTitle(name: string): string {
  return truncateText(name.replace(/\s+/g, " ").trim(), TITLE_MAX - TITLE_SUFFIX.length);
}

// The first candidate with text, tags and extra spaces removed, cut to about
// 155 characters. Undefined when every candidate is empty.
export function metaDescription(...candidates: (string | null | undefined)[]): string | undefined {
  for (const candidate of candidates) {
    const text = (candidate ?? "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
    if (text) return truncateText(text, DESCRIPTION_MAX);
  }
  return undefined;
}

// Minutes as an ISO 8601 duration: 15 -> "PT15M", 75 -> "PT1H15M".
export function isoDuration(minutes: number | null | undefined): string | undefined {
  if (!minutes || minutes <= 0) return undefined;
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return `PT${h ? `${h}H` : ""}${m || !h ? `${m}M` : ""}`;
}

// The fields of a published recipe the SEO builders read. getPublishedRecipe
// returns a superset of this.
export interface SeoRecipe {
  id: number;
  name: string;
  slug: string | null;
  description: string | null;
  instructions: string;
  imageUrl: string | null;
  servings: number;
  prepTimeMinutes: number | null;
  cookTimeMinutes: number | null;
  publishedAt: Date | null;
  authorName?: string | null;
  author?: { name: string } | null;
  ingredients: {
    quantity: number;
    notes: string | null;
    optional?: boolean;
    unit: { abbreviation: string };
    ingredient: { name: string };
  }[];
  tags: { tag: { name: string } }[];
}

export interface SeoBook {
  name: string;
  slug: string | null;
}

export function bookUrl(book: SeoBook): string {
  return `${getSiteUrl()}/blog/${book.slug}`;
}

export function recipeUrl(book: SeoBook, recipe: Pick<SeoRecipe, "id" | "slug">): string {
  return `${bookUrl(book)}/${recipe.slug ?? recipe.id}`;
}

// Ingredient lines as the recipe page shows them: "1 1/2 cups flour (sifted)".
export function recipeIngredientLines(ingredients: SeoRecipe["ingredients"]): string[] {
  return ingredients
    .map((ri) => {
      const shown = formatIngredient(ri.quantity, ri.unit.abbreviation, ri.ingredient.name);
      const extras = [cleanIngredientNote(ri.notes, shown.name), ri.optional ? "optional" : ""].filter(Boolean);
      const line = [shown.amount, shown.name].filter(Boolean).join(" ");
      return extras.length ? `${line} (${extras.join(", ")})` : line;
    })
    .filter(Boolean);
}

// HowToStep objects, grouped into HowToSections when the recipe names its
// sections ("--- Pot Pie Filling ---"), so the headings are not published as
// steps of their own.
export function recipeInstructionsLd(instructions: string): Record<string, unknown>[] {
  const toSteps = (body: string) => parseSteps(body).map((text) => ({ "@type": "HowToStep", text }));
  return parseInstructionSections(instructions).flatMap((section): Record<string, unknown>[] => {
    const steps = toSteps(section.body);
    if (steps.length === 0) return [];
    return section.name ? [{ "@type": "HowToSection", name: section.name, itemListElement: steps }] : steps;
  });
}

// Plain text of the first steps, for a meta description when the recipe has
// no description of its own.
export function firstStepsText(instructions: string): string {
  return parseInstructionSections(instructions)
    .flatMap((section) => parseSteps(section.body))
    .slice(0, 3)
    .join(" ");
}

export function recipeDescription(recipe: SeoRecipe, book: SeoBook): string {
  return metaDescription(
    recipe.description,
    firstStepsText(recipe.instructions),
    `${recipe.name}, a recipe from ${book.name} on ${SITE_NAME}.`
  )!;
}

// The recipe photo, or the generated share image when there is none. Google
// needs an image for recipe rich results.
export function recipeImages(recipe: SeoRecipe, book: SeoBook): string[] {
  const photo = absoluteUrl(recipe.imageUrl);
  return [photo ?? `${recipeUrl(book, recipe)}/opengraph-image`];
}

// Tags that name a course or meal, which schema.org calls recipeCategory.
// Other tags ("Chicken", "Quick") only go in keywords.
const RECIPE_CATEGORIES = new Set([
  "appetizer", "appetizers", "breakfast", "brunch", "lunch", "dinner", "main dish", "main course",
  "side dish", "sides", "salad", "salads", "soup", "soups", "dessert", "desserts", "snack", "snacks",
  "bread", "breads", "drink", "drinks", "beverage", "beverages", "sauce", "sauces",
]);

export function recipeCategory(tags: string[]): string | undefined {
  return tags.find((tag) => RECIPE_CATEGORIES.has(tag.trim().toLowerCase()));
}

// Schema.org Recipe for Google rich results. Null when there is neither an
// ingredient nor a step, since that is not a usable recipe.
export function buildRecipeJsonLd(recipe: SeoRecipe, book: SeoBook): Record<string, unknown> | null {
  const ingredients = recipeIngredientLines(recipe.ingredients);
  const instructions = recipeInstructionsLd(recipe.instructions);
  if (ingredients.length === 0 && instructions.length === 0) return null;

  const author = recipeAuthorName(recipe);
  const tags = recipe.tags.map((t) => t.tag.name);
  const totalMinutes = (recipe.prepTimeMinutes || 0) + (recipe.cookTimeMinutes || 0);
  const data: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Recipe",
    name: recipe.name,
    description: recipeDescription(recipe, book),
    image: recipeImages(recipe, book),
    url: recipeUrl(book, recipe),
    author: author
      ? { "@type": "Person", name: author }
      : { "@type": "Organization", name: SITE_NAME, url: getSiteUrl() },
    datePublished: recipe.publishedAt?.toISOString(),
    recipeYield: recipe.servings > 0 ? `${recipe.servings} servings` : undefined,
    prepTime: isoDuration(recipe.prepTimeMinutes),
    cookTime: isoDuration(recipe.cookTimeMinutes),
    totalTime: isoDuration(totalMinutes),
    recipeIngredient: ingredients.length ? ingredients : undefined,
    recipeInstructions: instructions.length ? instructions : undefined,
    recipeCategory: recipeCategory(tags),
    keywords: tags.length ? tags.join(", ") : undefined,
  };
  // Drop unset fields so the output only holds real values.
  return Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined));
}

// Title, description, canonical URL and share tags for a public recipe page.
// The share image comes from the opengraph-image.tsx beside the page, which
// Next only uses when `images` is left unset here.
export function recipeMetadata(recipe: SeoRecipe, book: SeoBook): Metadata {
  const url = recipeUrl(book, recipe);
  const description = recipeDescription(recipe, book);
  const author = recipeAuthorName(recipe);
  return {
    title: pageTitle(recipe.name),
    description,
    alternates: { canonical: url },
    openGraph: {
      type: "article",
      siteName: SITE_NAME,
      title: recipe.name,
      description,
      url,
      publishedTime: recipe.publishedAt?.toISOString(),
      authors: author ? [author] : undefined,
      tags: recipe.tags.length ? recipe.tags.map((t) => t.tag.name) : undefined,
    },
    twitter: { card: "summary_large_image", title: recipe.name, description },
  };
}

// Home, cookbook, recipe. /blog is left out because it redirects to the only
// cookbook when there is just one.
export function buildRecipeBreadcrumbJsonLd(recipe: SeoRecipe, book: SeoBook): Record<string, unknown> {
  const items = [
    { name: SITE_NAME, url: `${getSiteUrl()}/` },
    { name: book.name, url: bookUrl(book) },
    { name: recipe.name, url: recipeUrl(book, recipe) },
  ];
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: item.name,
      item: item.url,
    })),
  };
}

// JSON for a <script type="application/ld+json">, with "<" escaped so recipe
// text can't close the script tag.
export function jsonLdString(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
