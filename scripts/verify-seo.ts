// Offline checks for the SEO builders (src/lib/seo.ts): titles, descriptions,
// Recipe and BreadcrumbList JSON-LD. No DB or network needed.
// Run: npx tsx scripts/verify-seo.ts

import {
  buildRecipeBreadcrumbJsonLd,
  buildRecipeJsonLd,
  isoDuration,
  jsonLdString,
  metaDescription,
  pageTitle,
  recipeCategory,
  recipeIngredientLines,
  recipeInstructionsLd,
  recipeMetadata,
  TITLE_SUFFIX,
  type SeoBook,
  type SeoRecipe,
} from "../src/lib/seo";
import { getSiteUrl } from "../src/lib/site";

let failures = 0;
function eq(label: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) { failures++; console.log(`  ✗ ${label}: got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)}`); }
  else console.log(`  ✓ ${label}`);
}
function check(label: string, cond: boolean, extra?: unknown) {
  if (!cond) { failures++; console.log(`  ✗ ${label}${extra === undefined ? "" : `: ${JSON.stringify(extra)}`}`); }
  else console.log(`  ✓ ${label}`);
}

const site = getSiteUrl();
const isAbsolute = (url: unknown) => typeof url === "string" && /^https?:\/\/[^/]+\//.test(url);
const ISO_DURATION = /^PT(\d+H)?(\d+M)?$/;

const book: SeoBook = { name: "Kimball Family Favorites", slug: "kimball-family-favorites" };

const recipe: SeoRecipe = {
  id: 42,
  name: "White Chicken Enchiladas",
  slug: "white-chicken-enchiladas",
  description: "Creamy, cheesy chicken enchiladas with a green chile sour cream sauce.",
  instructions: [
    "--- Filling ---",
    "1. Preheat the oven to 350°F.",
    "2. Mix the chicken, half the cheese and the chiles.",
    "--- Sauce ---",
    "1. Melt the butter and whisk in the flour.",
    "2. Stir in the broth, then the sour cream.",
  ].join("\n"),
  imageUrl: "/api/images/7",
  servings: 8,
  prepTimeMinutes: 20,
  cookTimeMinutes: 70,
  publishedAt: new Date("2024-03-05T12:00:00Z"),
  authorName: "Grandma Jean",
  author: null,
  ingredients: [
    { quantity: 1.5, notes: "cooked and shredded", unit: { abbreviation: "lb" }, ingredient: { name: "chicken breast" } },
    { quantity: 2, notes: null, unit: { abbreviation: "cup" }, ingredient: { name: "shredded Monterey Jack cheese" } },
    { quantity: 1, notes: null, optional: true, unit: { abbreviation: "can" }, ingredient: { name: "diced green chiles" } },
    { quantity: 0, notes: null, unit: { abbreviation: "" }, ingredient: { name: "salt" } },
  ],
  tags: [{ tag: { name: "Chicken" } }, { tag: { name: "Dinner" } }],
};

console.log("Durations:");
eq("minutes only", isoDuration(15), "PT15M");
eq("whole hours", isoDuration(60), "PT1H");
eq("hours and minutes", isoDuration(75), "PT1H15M");
eq("zero is unset", isoDuration(0), undefined);
eq("null is unset", isoDuration(null), undefined);

console.log("Titles:");
eq("short name unchanged", pageTitle("White Chicken Enchiladas"), "White Chicken Enchiladas");
const longTitle = pageTitle("Grandma Jean's Famous Slow Cooker Green Chile Chicken Enchilada Casserole");
check("long name fits with the suffix", (longTitle + TITLE_SUFFIX).length <= 60, longTitle + TITLE_SUFFIX);
check("long name ends with an ellipsis", longTitle.endsWith("…"), longTitle);
check("long name cut on a word", !/\s…$/.test(longTitle), longTitle);

console.log("Descriptions:");
eq("first non-empty candidate", metaDescription(null, "  ", "Second  one"), "Second one");
eq("tags removed", metaDescription("<p>Soft <b>rolls</b></p>"), "Soft rolls");
const longDesc = metaDescription("word ".repeat(80));
check("long text cut to about 155", !!longDesc && longDesc.length <= 155 && longDesc.endsWith("…"), longDesc);
eq("all empty is unset", metaDescription(null, undefined, ""), undefined);

console.log("Ingredients:");
eq("formatted lines with notes and optional", recipeIngredientLines(recipe.ingredients), [
  "1 1/2 lb chicken breast (cooked and shredded)",
  "2 cups shredded Monterey Jack cheese",
  "1 can diced green chiles (optional)",
  "Salt, to taste",
]);

console.log("Instructions:");
const instructions = recipeInstructionsLd(recipe.instructions);
eq("named sections become HowToSections", instructions.map((s) => [s["@type"], s.name]), [
  ["HowToSection", "Filling"],
  ["HowToSection", "Sauce"],
]);
const steps = instructions.flatMap((s) => s.itemListElement as Record<string, unknown>[]);
check("every step is a HowToStep with text", steps.length === 4 && steps.every((s) => s["@type"] === "HowToStep" && typeof s.text === "string" && s.text.length > 0), steps);
eq("step numbers removed", steps[0].text, "Preheat the oven to 350°F.");
const plain = recipeInstructionsLd("1. Boil water.\n2. Add pasta.");
eq("no sections, plain HowToStep array", plain, [
  { "@type": "HowToStep", text: "Boil water." },
  { "@type": "HowToStep", text: "Add pasta." },
]);
eq("empty instructions, no steps", recipeInstructionsLd(""), []);

console.log("Categories:");
eq("a course tag is the category", recipeCategory(["Chicken", "Dinner"]), "Dinner");
eq("no course tag, no category", recipeCategory(["Chicken", "Quick"]), undefined);

console.log("Recipe JSON-LD:");
const ld = buildRecipeJsonLd(recipe, book)!;
const url = `${site}/blog/kimball-family-favorites/white-chicken-enchiladas`;
check("built", !!ld);
eq("context", ld["@context"], "https://schema.org");
eq("type", ld["@type"], "Recipe");
eq("name", ld.name, recipe.name);
eq("description", ld.description, recipe.description);
eq("url", ld.url, url);
check("image is an array of absolute URLs", Array.isArray(ld.image) && (ld.image as unknown[]).length > 0 && (ld.image as unknown[]).every(isAbsolute), ld.image);
eq("uploaded image made absolute", ld.image, [`${site}/api/images/7`]);
eq("author", ld.author, { "@type": "Person", name: "Grandma Jean" });
eq("datePublished", ld.datePublished, "2024-03-05T12:00:00.000Z");
eq("recipeYield", ld.recipeYield, "8 servings");
eq("prepTime", ld.prepTime, "PT20M");
eq("cookTime", ld.cookTime, "PT1H10M");
eq("totalTime", ld.totalTime, "PT1H30M");
check("durations are ISO 8601", [ld.prepTime, ld.cookTime, ld.totalTime].every((d) => ISO_DURATION.test(String(d))));
eq("recipeIngredient", ld.recipeIngredient, recipeIngredientLines(recipe.ingredients));
eq("recipeInstructions", ld.recipeInstructions, instructions);
eq("recipeCategory", ld.recipeCategory, "Dinner");
eq("keywords", ld.keywords, "Chicken, Dinner");
check("no unset values", Object.values(ld).every((v) => v !== undefined && v !== null));
eq("survives a JSON round trip", JSON.parse(JSON.stringify(ld)), ld);

const bare = buildRecipeJsonLd(
  { ...recipe, slug: null, description: null, imageUrl: null, authorName: null, prepTimeMinutes: null, cookTimeMinutes: null, tags: [] },
  book
)!;
eq("no slug, URL uses the id", bare.url, `${site}/blog/kimball-family-favorites/42`);
eq("no photo, falls back to the share image", bare.image, [`${site}/blog/kimball-family-favorites/42/opengraph-image`]);
eq("no author, credits the site", (bare.author as Record<string, unknown>)["@type"], "Organization");
eq("no description, uses the first steps", bare.description, "Preheat the oven to 350°F. Mix the chicken, half the cheese and the chiles. Melt the butter and whisk in the flour.");
check("no times, no time fields", !("prepTime" in bare) && !("cookTime" in bare) && !("totalTime" in bare), bare);
check("no tags, no keywords or category", !("keywords" in bare) && !("recipeCategory" in bare), bare);
eq("remote photo kept as is", buildRecipeJsonLd({ ...recipe, imageUrl: "https://blogger.googleusercontent.com/x.jpg" }, book)!.image, ["https://blogger.googleusercontent.com/x.jpg"]);
eq("nothing to cook, no JSON-LD", buildRecipeJsonLd({ ...recipe, instructions: "", ingredients: [] }, book), null);

console.log("Breadcrumbs:");
const crumbs = buildRecipeBreadcrumbJsonLd(recipe, book);
eq("type", crumbs["@type"], "BreadcrumbList");
const items = crumbs.itemListElement as Record<string, unknown>[];
eq("positions", items.map((i) => i.position), [1, 2, 3]);
eq("names", items.map((i) => i.name), ["My Lemon Kitchen", "Kimball Family Favorites", "White Chicken Enchiladas"]);
check("absolute item URLs", items.every((i) => i["@type"] === "ListItem" && isAbsolute(i.item)), items);
eq("last item is the recipe", items[2].item, url);

console.log("Script safety:");
const unsafe = jsonLdString({ name: "</script><script>alert(1)</script>" });
check("no raw < in the output", !unsafe.includes("<"), unsafe);
eq("still parses back", JSON.parse(unsafe).name, "</script><script>alert(1)</script>");

console.log("Page metadata:");
const meta = recipeMetadata(recipe, book);
eq("title", meta.title, "White Chicken Enchiladas");
eq("canonical", meta.alternates?.canonical, url);
eq("og:type article", (meta.openGraph as Record<string, unknown>).type, "article");
eq("og:url", meta.openGraph?.url, url);
check("no og:images, so the generated share image is used", !("images" in (meta.openGraph ?? {})));
check("description about 150 chars or less", !!meta.description && meta.description.length <= 155, meta.description);

console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
