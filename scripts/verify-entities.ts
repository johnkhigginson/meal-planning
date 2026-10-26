// Offline checks for HTML entity decoding and stray markdown cleanup
// (src/lib/text-clean.ts) and where they are applied. No DB or network needed.
// Run: npx tsx scripts/verify-entities.ts

import {
  cleanImportedRecipeText,
  cleanStepText,
  decodeEntities,
  stripMarkdownMarkers,
} from "../src/lib/text-clean";
import { parseSteps } from "../src/lib/parse-steps";
import { normalizeImportedIngredients } from "../src/lib/recipe-sections";
import { cleanScrapedRecipe, extractStructuredRecipe } from "../src/lib/recipe-scrape";
import { buildRecipeJsonLd, metaDescription, recipeMetadata, type SeoRecipe } from "../src/lib/seo";

let failures = 0;
function eq(label: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) { failures++; console.log(`  ✗ ${label}: got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)}`); }
  else console.log(`  ✓ ${label}`);
}

console.log("Decoding:");
eq("decimal", decodeEntities("Mom&#39;s chili"), "Mom's chili");
eq("zero-padded decimal", decodeEntities("Mom&#039;s chili"), "Mom's chili");
eq("hex", decodeEntities("Mom&#x27;s and &#X2019;"), "Mom's and ’");
eq("named", decodeEntities("Salt &amp; pepper &quot;fresh&quot; &lt;3"), 'Salt & pepper "fresh" <3');
eq("named is case-insensitive", decodeEntities("A &AMP; B"), "A & B");
eq("double-encoded decimal", decodeEntities("don&amp;#39;t"), "don't");
eq("double-encoded named", decodeEntities("half &amp;amp; half"), "half & half");
eq("two passes at most", decodeEntities("&amp;amp;amp;"), "&amp;");
eq("unknown entity left alone", decodeEntities("fish &chips; today"), "fish &chips; today");
eq("bare ampersand", decodeEntities("Mac & Cheese"), "Mac & Cheese");
eq("out-of-range code point left alone", decodeEntities("x &#99999999; y"), "x &#99999999; y");
eq("lone surrogate left alone", decodeEntities("x &#xD800; y"), "x &#xD800; y");
eq("null is empty", decodeEntities(null), "");
eq("nbsp becomes a space", decodeEntities("1&nbsp;cup"), "1 cup");

console.log("Inert text:");
eq("script tag stays text", decodeEntities("&lt;script&gt;alert(1)&lt;/script&gt;"), "<script>alert(1)</script>");
eq("literal script is not stripped or run", decodeEntities("<script>alert(1)</script>"), "<script>alert(1)</script>");
eq("double-encoded script stays text", decodeEntities("&amp;lt;script&amp;gt;"), "<script>");

console.log("Markdown markers:");
eq("bold", stripMarkdownMarkers("Stir **well** now"), "Stir well now");
eq("lone double underscore", stripMarkdownMarkers("__Serve__ warm"), "Serve warm");
eq("blank line of underscores stays", stripMarkdownMarkers("Name: ______"), "Name: ______");
eq("single asterisk stays", stripMarkdownMarkers("2 * 3 and a note*"), "2 * 3 and a note*");
eq("single underscore stays", stripMarkdownMarkers("snake_case"), "snake_case");
eq("step text does both", cleanStepText("**Mix** the don&#39;t"), "Mix the don't");

console.log("Steps:");
eq(
  "stored steps show clean",
  parseSteps("1. **Preheat** the oven.\n2. Don&#39;t __overmix__ &amp; stir."),
  ["Preheat the oven.", "Don't overmix & stir."]
);
eq("html steps keep decoding", parseSteps("<ol><li>Stir &amp;amp; fold</li></ol>"), ["Stir & fold"]);
eq("script in a step stays text", parseSteps("1. &lt;script&gt;x&lt;/script&gt;"), ["<script>x</script>"]);

console.log("Importers:");
eq(
  "recipe fields",
  cleanImportedRecipeText({
    name: "Mom&#39;s &amp; Dad&#039;s Chili",
    description: "It&amp;#39;s &quot;good&quot;",
    instructions: "1. **Brown** the beef.",
    notes: "__Freezes__ well",
    servings: 4,
  }),
  { name: "Mom's & Dad's Chili", description: 'It\'s "good"', instructions: "1. Brown the beef.", notes: "Freezes well", servings: 4 }
);
eq(
  "ingredient lines and sections",
  normalizeImportedIngredients([
    "1 cup half &amp; half",
    { text: "2 tbsp Mom&#39;s spice", section: "For the &quot;rub&quot;" },
  ]),
  [
    { text: "1 cup half & half", section: null },
    { text: "2 tbsp Mom's spice", section: 'For the "rub"' },
  ]
);
const scraped = cleanScrapedRecipe({
  name: "White Chicken Chili &amp; Rice",
  description: "Don&#39;t skip the lime.",
  instructions: "1. **Simmer** it.",
  servings: 4,
  prepTimeMinutes: null,
  cookTimeMinutes: null,
  ingredients: [{ text: "1 cup half &amp; half", section: null }],
  imageUrl: null,
});
eq("scraped name", scraped.name, "White Chicken Chili & Rice");
eq("scraped description", scraped.description, "Don't skip the lime.");
eq("scraped steps", scraped.instructions, "1. Simmer it.");
eq("scraped ingredient", scraped.ingredients[0].text, "1 cup half & half");
const page = `<script type="application/ld+json">${JSON.stringify({
  "@type": "Recipe",
  name: "Mom&#39;s Soup",
  description: "Warm &amp;amp; cozy",
  recipeIngredient: ["1 cup broth"],
  recipeInstructions: [{ "@type": "HowToStep", text: "**Heat** it." }],
})}</script>`;
const structured = extractStructuredRecipe(page);
eq("JSON-LD page name", structured?.name, "Mom's Soup");
eq("JSON-LD page description", structured?.description, "Warm & cozy");

console.log("Display of stored data (SEO, meta, JSON-LD):");
const recipe: SeoRecipe = {
  id: 269,
  name: "White Chicken Chili &amp; Rice",
  slug: "white-chicken-chili",
  description: "It&#39;s a &quot;family&quot; favorite &amp;amp; easy.",
  instructions: "1. **Simmer** the chili.",
  imageUrl: null,
  servings: 4,
  prepTimeMinutes: 10,
  cookTimeMinutes: 30,
  publishedAt: null,
  ingredients: [
    { quantity: 1, notes: "Mom&#39;s", unit: { abbreviation: "cup" }, ingredient: { name: "half &amp; half" } },
  ],
  tags: [{ tag: { name: "Soups &amp; Stews" } }],
};
const book = { name: "Lemon &amp; Lime", slug: "lemon" };
eq("meta decodes", metaDescription("It&#39;s &amp;amp; fine"), "It's & fine");
eq("meta keeps a script as text", metaDescription("&lt;script&gt;x&lt;/script&gt;"), "<script>x</script>");
const meta = recipeMetadata(recipe, book);
eq("meta description", meta.description, "It's a \"family\" favorite & easy.");
eq("og description", meta.openGraph?.description, "It's a \"family\" favorite & easy.");
eq("og title", (meta.openGraph as { title?: string }).title, "White Chicken Chili & Rice");
const ld = buildRecipeJsonLd(recipe, book) as Record<string, unknown>;
eq("JSON-LD name", ld.name, "White Chicken Chili & Rice");
eq("JSON-LD description", ld.description, "It's a \"family\" favorite & easy.");
eq("JSON-LD ingredient", ld.recipeIngredient, ["1 cup half & half (Mom's)"]);
eq("JSON-LD keywords", ld.keywords, "Soups & Stews");
eq("JSON-LD steps", ld.recipeInstructions, [{ "@type": "HowToStep", text: "Simmer the chili." }]);

if (failures) {
  console.log(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log("\nAll entity checks passed");
