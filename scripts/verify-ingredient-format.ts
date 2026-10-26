// Offline checks for the shared ingredient formatter (src/lib/ingredient-format.ts).
// No DB or network needed. Run: npx tsx scripts/verify-ingredient-format.ts

import {
  formatAmount,
  formatIngredient,
  formatIngredientLine,
  formatQuantity,
  formatUnit,
  cleanIngredientName,
  cleanIngredientNote,
  cleanIngredientText,
  formatIngredientText,
  makeUnitLookup,
  parseIngredientText,
  pickIngredientMatch,
  ingredientNameVariants,
  readQuantity,
} from "../src/lib/ingredient-format";
import { parseCookSteps, stripFootnoteMarkers } from "../src/lib/parse-steps";
import { cleanScrapedRecipe, extractStructuredRecipe } from "../src/lib/recipe-scrape";
import { readFileSync } from "node:fs";
import { join } from "node:path";

let failures = 0;
function eq(label: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) { failures++; console.log(`  ✗ ${label}: got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)}`); }
  else console.log(`  ✓ ${label}`);
}

console.log("Quantities:");
eq("whole number", formatQuantity(2), "2");
eq("one and a half", formatQuantity(1.5), "1 1/2");
eq("trims float noise", formatQuantity(0.1 + 0.2), "0.3");
eq("a true third", formatQuantity(1 / 3), "1/3");
eq("zero is blank", formatQuantity(0), "");
eq("NaN is blank", formatQuantity(NaN), "");

console.log("Units:");
eq("1 cup", formatAmount(1, "cup"), "1 cup");
eq("1 1/2 cups", formatAmount(1.5, "cup"), "1 1/2 cups");
eq("half a cup stays singular", formatAmount(0.5, "cup"), "1/2 cup");
eq("3 cloves", formatAmount(3, "clove"), "3 cloves");
eq("2 pinches", formatAmount(2, "pinch"), "2 pinches");
eq("cup(s) is cleaned", formatUnit("cup(s)", 2), "cups");
eq("abbreviations unchanged", formatAmount(2, "tbsp"), "2 tbsp");
eq("case kept for L", formatAmount(2, "L"), "2 L");
eq("each is dropped", formatAmount(3, "ea"), "3");
eq("dozen has no s", formatAmount(2, "doz"), "2 doz");
eq("unknown unit kept", formatAmount(2, "tin"), "2 tin");

console.log("Names:");
eq("trailing comma", cleanIngredientName("garlic,"), "garlic");
eq("trailing comma and space", cleanIngredientName("garlic , "), "garlic");
eq("inner spaces collapse", cleanIngredientName("brown   sugar"), "brown sugar");

console.log("Whole lines (the reported bugs):");
eq("no doubled cup", formatIngredientLine(1.5, "cup", "cup(s) powdered sugar"), "1 1/2 cups powdered sugar");
eq("no trailing comma", formatIngredientLine(3, "clove", "garlic,"), "3 cloves garlic");
eq("doubled plural unit", formatIngredientLine(2, "cup", "cups flour"), "2 cups flour");
eq("doubled abbreviation", formatIngredientLine(2, "tsp", "tsp salt"), "2 tsp salt");
eq("unit stuck in name of a count", formatIngredientLine(1.5, "ea", "cup(s) powdered sugar"), "1 1/2 cups powdered sugar");
eq("plain count", formatIngredientLine(3, "ea", "eggs"), "3 eggs");
eq("name that starts like a word is kept", formatIngredientLine(1, "cup", "cupcake liners"), "1 cup cupcake liners");
eq("split parts", formatIngredient(1, "cup", "milk,"), { amount: "1 cup", name: "milk" });
eq("no amount", formatIngredientLine(0, "cup", "salt"), "Salt, to taste");

console.log("Friendly fractions:");
eq("0.5 -> 1/2", formatQuantity(0.5), "1/2");
eq("0.25 -> 1/4", formatQuantity(0.25), "1/4");
eq("0.75 -> 3/4", formatQuantity(0.75), "3/4");
eq("0.33 -> 1/3", formatQuantity(0.33), "1/3");
eq("0.333 -> 1/3", formatQuantity(0.333), "1/3");
eq("0.67 -> 2/3", formatQuantity(0.67), "2/3");
eq("0.666 -> 2/3", formatQuantity(0.666), "2/3");
eq("0.125 -> 1/8", formatQuantity(0.125), "1/8");
eq("2.25 -> 2 1/4", formatQuantity(2.25), "2 1/4");
eq("near-whole snaps up", formatQuantity(1.999), "2");
eq("odd amount keeps decimals", formatQuantity(0.2), "0.2");
eq("odd amount trims to 2 places", formatQuantity(1.157), "1.16");
eq("scaled half recipe", formatAmount(1.5 * (2 / 4), "cup"), "3/4 cup");
eq("scaled 2/3 recipe", formatAmount(1 * (4 / 6), "cup"), "2/3 cup");
eq("grocery total", formatIngredientLine(0.25 + 0.5, "cup", "milk"), "3/4 cup milk");

console.log("Import cleanup (costs, markers, tidy):");
eq("cost in parens", cleanIngredientText("1 cup rice ($0.20)"), "1 cup rice");
eq("cost with marker", cleanIngredientText("1 lb chicken thighs ($1.17*)"), "1 lb chicken thighs");
eq("bare cost", cleanIngredientText("2 Tbsp olive oil $0.43"), "2 Tbsp olive oil");
eq("spaced cost", cleanIngredientText("1 can tomatoes ( $2.50 )"), "1 can tomatoes");
eq("non-price parens kept", cleanIngredientText("1 can beans (15 oz can) ($0.89)"), "1 can beans (15 oz can)");
eq("footnote marker", cleanIngredientText("3 cloves garlic*"), "3 cloves garlic");
eq("double marker", cleanIngredientText("1 cup broth**"), "1 cup broth");
eq("dangling comma after cost", cleanIngredientText("1 onion, ($0.32), diced"), "1 onion, diced");
eq("empty parens left behind", cleanIngredientText("salt () to taste"), "salt to taste");
eq("cost-only note is empty", cleanIngredientNote("($0.20)", "rice"), "");
eq("cost stripped from note", cleanIngredientNote("diced ($0.32)", "onion"), "diced");

console.log("Repeated notes:");
eq("note repeats name", cleanIngredientNote("uncooked", "uncooked penne pasta"), "");
eq("repeat is case-insensitive", cleanIngredientNote("Uncooked", "uncooked penne pasta"), "");
eq("only the repeated part goes", cleanIngredientNote("uncooked, divided", "uncooked penne pasta"), "divided");
eq("new detail is kept", cleanIngredientNote("finely chopped", "chopped onion"), "finely chopped");
eq("repeat in the name's parens", cleanIngredientName("uncooked penne pasta (uncooked)"), "uncooked penne pasta");
eq("other name parens kept", cleanIngredientName("black beans (15 oz can)"), "black beans (15 oz can)");

console.log("Saved Budget Bytes lines, on display:");
eq("cost in saved name", formatIngredientLine(8, "oz", "uncooked penne pasta ($0.80)"), "8 oz uncooked penne pasta");
eq("marker in saved name", formatIngredientLine(0.5, "tsp", "garlic powder*"), "1/2 tsp garlic powder");
eq("everything at once", formatIngredient(0.333, "cup", "Parmesan ($0.62*) (parmesan)"), { amount: "1/3 cup", name: "Parmesan" });

console.log("To-taste lines have no amount:");
eq("salt and pepper line", formatIngredientText("Salt and freshly ground black pepper"), "Salt and freshly ground black pepper");
eq("no number reads as 0", readQuantity("Salt and freshly ground black pepper").quantity, 0);
eq("to taste goes to a note", formatIngredientText("Kosher salt, to taste"), "Kosher salt (to taste)");
eq("as needed", formatIngredientText("Olive oil, as needed"), "Olive oil (as needed)");
eq("for garnish in parens", formatIngredientText("Fresh parsley (for garnish)"), "Fresh parsley (for garnish)");
eq("pinch of with no number", formatIngredientText("pinch of salt"), "salt (a pinch)");
eq("plus more to taste keeps the amount", formatIngredientText("1/2 tsp salt, plus more to taste"), "1/2 tsp salt (plus more to taste)");
eq("saved as 1 each shows no count", formatIngredientLine(1, "ea", "Salt and freshly ground black pepper"), "Salt and freshly ground black pepper, to taste");
eq("saved total of 3 each shows no count", formatIngredientLine(3, "ea", "kosher salt"), "Kosher salt, to taste");
eq("saved with no amount", formatIngredientLine(0, "ea", "Salt and freshly ground black pepper"), "Salt and freshly ground black pepper, to taste");
eq("a real count is kept", formatIngredientLine(1, "ea", "red bell pepper"), "1 red bell pepper");
eq("salted butter is not salt", formatIngredientLine(2, "ea", "salted butter sticks"), "2 salted butter sticks");

console.log("Ranges:");
eq("1/2 to 1 teaspoon", formatIngredientText("1/2 to 1 teaspoon red pepper flakes"), "1/2 to 1 tsp red pepper flakes");
eq("range ends", readQuantity("1/2 to 1 teaspoon red pepper flakes"), { quantity: 0.5, quantityMax: 1, rest: "teaspoon red pepper flakes" });
eq("1/2 to 1 tsp", formatIngredientText("1/2 to 1 tsp salt"), "1/2 to 1 tsp salt");
eq("1-2 cloves", formatIngredientText("1-2 cloves garlic"), "1 to 2 cloves garlic");
eq("1 to 2 cups", formatIngredientText("1 to 2 cups chicken broth"), "1 to 2 cups chicken broth");
eq("2-3 tbsp", formatIngredientText("2-3 tbsp olive oil"), "2 to 3 tbsp olive oil");
eq("unicode half and en dash", formatIngredientText("½–1 tsp chili flakes"), "1/2 to 1 tsp chili flakes");
eq("1-1/2 is a mixed number", formatIngredientText("1-1/2 cups milk"), "1 1/2 cups milk");
eq("1 ½ is a mixed number", readQuantity("1 ½ cups milk").quantity, 1.5);
eq("saved range tail in name", formatIngredientLine(0.5, "ea", "to 1 teaspoon red pepper flakes"), "1/2 to 1 tsp red pepper flakes");
eq("saved range tail, summed past the top", formatIngredientLine(1.5, "tsp", "to 1 teaspoon red pepper flakes"), "1 1/2 tsp red pepper flakes");

console.log("Size words:");
eq("heaping teaspoon", formatIngredientText("1/4 heaping teaspoon ground cinnamon"), "1/4 tsp ground cinnamon (heaping)");
eq("scant cup", formatIngredientText("1 scant cup sugar"), "1 cup sugar (scant)");
eq("Level is not left capitalized", formatIngredientText("2 Level tablespoons cocoa"), "2 tbsp cocoa (level)");
eq("large can", formatIngredientText("1 large can crushed tomatoes"), "1 can crushed tomatoes (large)");
eq("medium stays with onions", formatIngredientText("2 medium onions"), "2 medium onions");
eq("large stays with eggs", formatIngredientText("3 large eggs"), "3 large eggs");
eq("saved Heaping in name", formatIngredientLine(0.25, "ea", "Heaping teaspoon ground cinnamon"), "1/4 tsp ground cinnamon (heaping)");
eq("saved size word before stored unit", formatIngredient(0.25, "tsp", "heaping tsp ground cinnamon"), { amount: "1/4 tsp", name: "ground cinnamon (heaping)" });

console.log("Footnote markers in steps:");
eq("word*", stripFootnoteMarkers("Top the pasta with sliced green onions* and serve."), "Top the pasta with sliced green onions and serve.");
eq("word** before a period", stripFootnoteMarkers("Add the garlic**."), "Add the garlic.");
eq("end of text", stripFootnoteMarkers("Serve with lime wedges*"), "Serve with lime wedges");
eq("each line of a blob", stripFootnoteMarkers("1. Add onions*\n2. Stir"), "1. Add onions\n2. Stir");
eq("spaced multiplication stays", stripFootnoteMarkers("Cut into 5 * 3 inch pieces"), "Cut into 5 * 3 inch pieces");
eq("tight multiplication stays", stripFootnoteMarkers("Use a 9*13 pan"), "Use a 9*13 pan");
eq("emphasis line stays", stripFootnoteMarkers("Do *not* stir"), "Do *not* stir");
eq("bullet stays", stripFootnoteMarkers("* Preheat the oven"), "* Preheat the oven");
eq("cook steps lose markers", parseCookSteps("1. Top with green onions* and serve.").map((s) => s.text), ["Top with green onions and serve."]);

// The real Budget Bytes JSON-LD, run through the same path the scrape API
// takes: read the Recipe off the page, then clean it.
const fixture = readFileSync(join(__dirname, "fixtures/budgetbytes-cajun-chicken-pasta.json"), "utf8");
const page = `<html><head><script type="application/ld+json">${fixture}</script></head><body></body></html>`;
const scraped = extractStructuredRecipe(page);
const recipe = scraped ? cleanScrapedRecipe(scraped) : null;

console.log("Budget Bytes fixture, steps:");
const steps = parseCookSteps(recipe?.instructions).map((s) => s.text);
eq("six steps", steps.length, 6);
eq("no step has a stray asterisk", steps.filter((s) => s.includes("*")), []);
eq("last step", steps[5], "Add the cream cheese to the skillet in chunks, then stir until it has melted into the sauce. Top the pasta with sliced green onions and serve.");

// The units table as prisma/seed.ts fills it, for the import parser.
const UNITS = [
  ["teaspoon", "tsp"], ["tablespoon", "tbsp"], ["cup", "cup"], ["fluid ounce", "fl oz"],
  ["pint", "pt"], ["quart", "qt"], ["gallon", "gal"], ["milliliter", "ml"], ["liter", "L"],
  ["ounce", "oz"], ["pound", "lb"], ["gram", "g"], ["kilogram", "kg"], ["each", "ea"],
  ["dozen", "doz"], ["pinch", "pinch"], ["dash", "dash"], ["clove", "clove"], ["bunch", "bunch"],
  ["can", "can"], ["package", "pkg"], ["slice", "slice"],
].map(([name, abbreviation]) => ({ name, abbreviation }));
const lookup = makeUnitLookup(UNITS);
// An imported line as the importer saves it: [quantity, unit, name, notes].
function imported(line: string) {
  const p = parseIngredientText(line, lookup);
  return p && [p.quantity, p.unit?.name ?? null, p.name, p.notes];
}

console.log("Budget Bytes fixture, ingredients:");
const expected: [number, string | null, string, string][] = [
  [2, "teaspoon", "smoked paprika", ""],
  [1, "teaspoon", "oregano", ""],
  [1, "teaspoon", "thyme", ""],
  [0.5, "teaspoon", "garlic powder", ""],
  [0.5, "teaspoon", "onion powder", ""],
  [0.25, "teaspoon", "cayenne pepper", ""],
  [0.25, "teaspoon", "black pepper", ""],
  [0.25, "teaspoon", "salt", ""],
  [1, "tablespoon", "olive oil", ""],
  [1, "tablespoon", "butter", ""],
  [1, "pound", "boneless skinless chicken breast", ""],
  [1, null, "yellow onion", "diced"],
  [0.5, "pound", "penne pasta", "uncooked"],
  [15, "ounce", "fire roasted diced tomatoes", ""],
  [2, "cup", "chicken broth", ""],
  [2, "ounce", "cream cheese", ""],
  [3, null, "green onions", "sliced"],
];
const lines = recipe?.ingredients.map((i) => i.text) ?? [];
eq("17 lines", lines.length, expected.length);
lines.forEach((line, i) => eq(line, imported(line), expected[i]));

console.log("Import: a word in the name or the note, not both:");
eq("note in parens", imported("1/2 lb. penne pasta (uncooked) ($0.75)"), [0.5, "pound", "penne pasta", "uncooked"]);
eq("state word in both", imported("1/2 lb uncooked penne pasta (uncooked)"), [0.5, "pound", "penne pasta", "uncooked"]);
eq("prep word in both", imported("1 chopped onion, finely chopped"), [1, null, "onion", "finely chopped"]);
eq("other repeat dropped", imported("1 cup Parmesan (parmesan)"), [1, "cup", "Parmesan", ""]);

console.log("Import: sizes in parens are notes:");
eq("weight after the name", imported("1.5 lb boneless skinless chicken breast (700 grams)"), [1.5, "pound", "boneless skinless chicken breast", "700 grams"]);
eq("weight after the unit", imported("1.5 lb (700 grams) chicken boneless, skinless chicken breasts"), [1.5, "pound", "boneless skinless chicken breasts", "700 grams"]);
eq("onions", imported("1 cup (150 grams) onions, chopped"), [1, "cup", "onions", "150 grams, chopped"]);
eq("Greek yogurt", imported("1/2 cup (120 ml) Greek yogurt"), [0.5, "cup", "Greek yogurt", "120 ml"]);
eq("tomatoes", imported("1 lb (500 grams) tomatoes"), [1, "pound", "tomatoes", "500 grams"]);
eq("butter", imported("1/2 cup (1 stick) butter"), [0.5, "cup", "butter", "1 stick"]);
eq("packages cream cheese", imported("2 (8 oz.) packages cream cheese"), [2, "package", "cream cheese", "8 oz"]);
eq("package chocolate chips", imported("1 (11.5 oz) package milk chocolate chips"), [1, "package", "milk chocolate chips", "11.5 oz"]);
eq("about 5 cups", imported("1 (about 5 cups) butternut squash, peeled and cut into 3/4 inch cubes"), [1, null, "butternut squash", "about 5 cups, peeled and cut into 3/4 inch cubes"]);
eq("1 package", imported("1 (1 package) frozen mixed vegetables"), [1, null, "frozen mixed vegetables", "1 package"]);
eq("Neufchatel", imported("1 (8 oz) pkg Neufchatel cheese*"), [1, "package", "Neufchatel cheese", "8 oz"]);
eq("adjective list keeps its noun", imported("1 lb. boneless, skinless chicken breast"), [1, "pound", "boneless skinless chicken breast", ""]);

console.log("Import: (s) units:");
eq("teaspoon(s)", imported("1 teaspoon(s) baking powder"), [1, "teaspoon", "baking powder", ""]);
eq("cup(s)", imported("2 cup(s) powdered sugar"), [2, "cup", "powdered sugar", ""]);
eq("cup(s) then a size", imported("1/2 cup(s) (1 stick) unsalted butter"), [0.5, "cup", "unsalted butter", "1 stick"]);

console.log("Import: prep phrases after the noun:");
eq("very large onion", imported("1 very large yellow onion sliced fairly thin"), [1, null, "yellow onion", "very large, sliced fairly thin"]);
eq("large potatoes", imported("3 large potatoes cut in small pieces"), [3, null, "potatoes", "large, cut in small pieces"]);
eq("large onions chopped", imported("2 large onions chopped (diced)"), [2, null, "onions", "large, chopped, diced"]);
eq("garlic minced", imported("3 cloves garlic minced"), [3, "clove", "garlic", "minced"]);
// Changed on purpose: cook's prep before the noun is a note now, the same
// as after it, so "-1 1/2 c. shredded cheddar cheese" and this line agree.
eq("cook's prep before the noun is a note", imported("1 cup shredded cheddar cheese"), [1, "cup", "cheddar cheese", "shredded"]);
eq("diced tomatoes stay", imported("1 can diced tomatoes"), [1, "can", "diced tomatoes", ""]);
eq("shredded coconut stays", imported("1 cup shredded coconut"), [1, "cup", "shredded coconut", ""]);
eq("crushed red pepper stays", imported("1/2 tsp crushed red pepper"), [0.5, "teaspoon", "crushed red pepper", ""]);
eq("large eggs stay", imported("3 large eggs"), [3, null, "large eggs", ""]);

console.log("Import: colors and sizes are never the whole name:");
eq("color choice", imported("3 large red, yellow, or orange bell peppers"), [3, null, "bell peppers", "large, red, yellow, or orange"]);
eq("red or green", imported("1 red or green bell pepper, diced"), [1, null, "bell pepper", "red or green, diced"]);
eq("size before a color", imported("3 large red bell peppers, diced"), [3, null, "red bell peppers", "large, diced"]);
eq("lone size word", imported("3 large, red bell peppers"), [3, null, "red bell peppers", "large"]);

console.log("Import: to taste:");
eq("Salt and pepper keeps its casing", imported("Salt and pepper, to taste"), [0, null, "Salt and pepper", "to taste"]);

console.log("Import: a spaced dash starts the prep note:");
eq("green onions - chopped", imported("4 green onions - chopped"), [4, null, "green onions", "chopped"]);
eq("smoked bacon - chopped", imported("1/2 lb smoked bacon - chopped"), [0.5, "pound", "smoked bacon", "chopped"]);
eq("lg. russet potatoes", imported("2 lg. russet potatoes - scrubbed clean and cubed"), [2, null, "russet potatoes", "large, scrubbed clean and cubed"]);
eq("garlic cloves - peeled", imported("2 garlic cloves - peeled, crushed"), [2, "clove", "garlic", "peeled, crushed"]);
eq("small onion - peeled", imported("1 small onion - peeled, chopped"), [1, null, "onion", "small, peeled, chopped"]);
eq("kale or Swiss chard", imported("2 cups kale or Swiss chard - chopped or torn"), [2, "cup", "kale", "or Swiss chard, chopped or torn"]);
eq("rosemary - crushed", imported("1/2 tsp rosemary - crushed"), [0.5, "teaspoon", "rosemary", "crushed"]);
eq("lemon peel - shredded", imported("1/2 tsp lemon peel - shredded"), [0.5, "teaspoon", "lemon peel", "shredded"]);
eq("en dash", imported("1/2 tsp rosemary \u2013 crushed"), [0.5, "teaspoon", "rosemary", "crushed"]);
eq("em dash", imported("1/2 tsp rosemary \u2014 crushed"), [0.5, "teaspoon", "rosemary", "crushed"]);
eq("dash inside parens stays", imported("1 1/2 cups (150 grams) onions (fine chopped, 1x - 1 large or 2 medium)"), [1.5, "cup", "onions", "150 grams, fine chopped, 1x - 1 large or 2 medium"]);
eq("hyphenated words stay", imported("1 cup all-purpose flour"), [1, "cup", "all-purpose flour", ""]);
eq("sm. and med.", [imported("1 sm. onion"), imported("2 med. carrots")], [[1, null, "onion", "small"], [2, null, "carrots", "medium"]]);
eq("lg. eggs keep their size", imported("2 lg. eggs"), [2, null, "large eggs", ""]);

console.log("Import: a range end left at the front of a name:");
const fragmentLine = (line: string) => { const p = parseIngredientText(line, lookup); return p && [p.quantity, p.unit?.name ?? null, p.name, p.notes, p.doubts.length]; };
eq("4-5 chicken breasts", fragmentLine("4-5 chicken breasts cut in pieces or 12-ish chicken tenders"), [5, null, "chicken breasts", "4 to 5, cut in pieces or 12-ish chicken tenders", 0]);
eq("4 -5 chicken breasts (saved count)", fragmentLine("4 -5 chicken breasts cut in pieces or 12-ish chicken tenders"), [5, null, "chicken breasts", "4 to 5, cut in pieces or 12-ish chicken tenders", 0]);
eq("4 each -5 chicken breasts", fragmentLine("4 each -5 chicken breasts cut in pieces or 12-ish chicken tenders"), [5, "each", "chicken breasts", "4 to 5, cut in pieces or 12-ish chicken tenders", 0]);
eq("2 lb -5 chicken breasts is a doubt", fragmentLine("2 lb -5 chicken breasts cut in pieces or 12-ish chicken tenders"), [2, "pound", "chicken breasts", "cut in pieces or 12-ish chicken tenders", 1]);
eq("-5 with no amount is a doubt", fragmentLine("-5 chicken breasts"), [0, null, "chicken breasts", "", 1]);
eq("matches Chicken Breast", pickIngredientMatch("chicken breasts", [{ id: 73, name: "Chicken Breast" }])?.id, 73);

console.log("Import: choices with \"or\":");
eq("first noun is the name", imported("1 cup butter or margarine, softened"), [1, "cup", "butter", "or margarine, softened"]);
eq("baguette or french bread", imported("1 baguette or french bread sliced lengthwise"), [1, null, "baguette", "or french bread, sliced lengthwise"]);
eq("shared last word", imported("2 cups chicken or vegetable broth"), [2, "cup", "chicken broth", "or vegetable broth"]);
eq("rotisserie or left-over chicken", imported("2 1/2 cups shredded cooked rotisserie or left-over chicken*"), [2.5, "cup", "cooked chicken", "shredded, rotisserie or left-over"]);
eq("large or 40 small tomatoes", imported("20 large or 40 small tomatoes"), [20, null, "tomatoes", "large or 40 small"]);
eq("crushed or diced tomatoes", imported("1 (14-ounce) can crushed or diced tomatoes"), [1, "can", "tomatoes", "14-ounce, crushed or diced"]);
eq("fresh or frozen", imported("1 cup fresh or frozen peas"), [1, "cup", "peas", "fresh or frozen"]);
eq("salt and pepper stays whole", imported("Salt and pepper"), [0, null, "Salt and pepper", ""]);
eq("half and half stays whole", imported("1 cup half and half"), [1, "cup", "half and half", ""]);
eq("salt and freshly ground black pepper stays whole", imported("Salt and freshly ground black pepper"), [0, null, "Salt and freshly ground black pepper", ""]);

console.log("Import: parens across the name and the note:");
eq("cheese (such as cheddar, jack, and/or fontina), grated", imported("1 lb cheese (such as cheddar, jack, and/or fontina), grated"), [1, "pound", "cheese", "such as cheddar, jack, and/or fontina, grated"]);
eq("cheese (such as cheddar)", imported("1 cheese (such as cheddar)"), [1, null, "cheese", "such as cheddar"]);
eq("nested parens stay in the note", imported("1.35 lb (500 grams) tomatoes (pureed/chopped or 10 oz. (1 cup) tomato puree/ passata or 14 oz can peeled tomatoes, read notes)"), [1.35, "pound", "tomatoes", "500 grams, pureed/chopped or 10 oz. (1 cup) tomato puree/passata or 14 oz can peeled tomatoes, read notes"]);
eq("parenthetical comma parts unwrap", imported("1 (8 oz) pkg Neufchatel cheese*, (aka light cream cheese), (cut into small cubes, softened)"), [1, "package", "Neufchatel cheese", "8 oz, aka light cream cheese, cut into small cubes, softened"]);

console.log("Import: descriptors after the noun:");
eq("chicken boneless", imported("1.5 lb (700 grams) chicken boneless (Preferably thighs, or breasts)"), [1.5, "pound", "boneless chicken", "700 grams, Preferably thighs, or breasts"]);
eq("beef ground", imported("1 lb beef ground"), [1, "pound", "ground beef", ""]);
eq("cooked ham stays cooked", imported("1 (or so) cup cooked ham, diced"), [1, "cup", "cooked ham", "or so, diced"]);

console.log("Import: other saved shapes:");
eq("size before the unit, no parens", imported("1 16 oz. can tomatoes, cut up"), [1, "can", "tomatoes", "16 oz, cut up"]);
eq("unit said twice", imported("1 can (8 oz) cans tomato sauce, 8 oz"), [1, "can", "tomato sauce", "8 oz"]);
eq("slightly beaten", imported("2 eggs slightly beaten"), [2, null, "eggs", "slightly beaten"]);
eq("from a can", imported("28 oz (800 grams) whole peeled tomatoes from a can, San Marzano"), [28, "ounce", "whole peeled tomatoes", "800 grams, from a can, San Marzano"]);
eq("in water", imported("2 cans (4.5 ounces each) white chunk chicken breast in water, drained"), [2, "can", "white chunk chicken breast", "4.5 ounces each, in water, drained"]);
eq("with juice", imported("1 (14.5-ounce) can diced tomatoes with juice"), [1, "can", "diced tomatoes", "14.5-ounce, with juice"]);
eq("cut in cubes stays a prep note", imported("3 lb butternut squash cut in 3/4 inch cubes"), [3, "pound", "butternut squash", "cut in 3/4 inch cubes"]);
eq("cream of chicken soup stays whole", imported("1 can cream of chicken soup"), [1, "can", "cream of chicken soup", ""]);

console.log("Import: choices with \"or\", head nouns:");
eq("water or chicken broth", imported("4 cups water or chicken broth"), [4, "cup", "water", "or chicken broth"]);
eq("button or cremini mushrooms", imported("1.5 lb button or cremini mushrooms, quartered"), [1.5, "pound", "button mushrooms", "or cremini mushrooms, quartered"]);
eq("kosher or coarse salt", imported("1.5 tsp kosher or coarse salt"), [1.5, "teaspoon", "kosher salt", "or coarse salt"]);
eq("bittersweet or semisweet chocolate", imported("4 oz bittersweet or semisweet chocolate, chopped"), [4, "ounce", "bittersweet chocolate", "or semisweet chocolate, chopped"]);
eq("olive or vegetable oil", imported("2 tbsp olive or vegetable oil"), [2, "tablespoon", "olive oil", "or vegetable oil"]);
eq("apple or white grape juice", imported("1/2 cup apple or white grape juice"), [0.5, "cup", "apple juice", "or white grape juice"]);
eq("water or orange juice stays water", imported("1 cup water or orange juice"), [1, "cup", "water", "or orange juice"]);
eq("jar or can chili sauce", imported("1 14 oz. jar or can chili sauce, the chunkier, the better"), [1, "each", "chili sauce", "14 oz jar or can, the chunkier, the better"]);
eq("sleeve Ritz or Town House crackers", imported("1 sleeve Ritz or Town House crackers, crumbled"), [1, "each", "Ritz crackers", "1 sleeve, or Town House crackers, crumbled"]);
eq("chopped Vidalia or other sweet onion", imported("1 cup chopped Vidalia or other sweet onion, about 1small"), [1, "cup", "Vidalia onion", "chopped, or other sweet onion, about 1 small"]);
eq("chopped pecans or walnuts", imported("1/2 cup chopped pecans or walnuts"), [0.5, "cup", "pecans", "chopped, or walnuts"]);
eq("chopped chorizo or sausage", imported("1/2 cup chopped chorizo or sausage"), [0.5, "cup", "chorizo", "chopped, or sausage"]);
eq("grated pecorino or parmesan cheese", imported("1/4 cup grated pecorino or parmesan cheese"), [0.25, "cup", "pecorino cheese", "grated, or parmesan cheese"]);
eq("good quality sourdough or country bread", imported("4 slices good quality sourdough or country bread"), [4, "slice", "sourdough bread", "good quality, or country bread"]);
eq("shredded mozzarella or swiss cheese", imported("1 cup shredded mozzarella or swiss cheese"), [1, "cup", "mozzarella cheese", "shredded, or swiss cheese"]);
eq("shredded mozzarella or pizza blend cheese", imported("1 cup shredded mozzarella or pizza blend cheese"), [1, "cup", "mozzarella cheese", "shredded, or pizza blend cheese"]);
eq("shredded Monterey Jack or Cheddar Jack cheese", imported("1.5 cups shredded Monterey Jack or Cheddar Jack cheese"), [1.5, "cup", "Monterey Jack cheese", "shredded, or Cheddar Jack cheese"]);
eq("finely ground rolled oats or fine bread crumbs", imported("1/2 cup finely ground rolled oats or fine bread crumbs"), [0.5, "cup", "rolled oats", "finely ground, or fine bread crumbs"]);
eq("zest from one lemon or orange", imported("1 zest from one lemon or orange, for topping"), [1, null, "lemon zest", "from one lemon, or orange, for topping"]);
eq("Tortillas or taco shells, for serving", imported("1 Tortillas or taco shells, for serving"), [1, null, "Tortillas", "or taco shells, for serving"]);
eq("grated sharp cheddar or 1/2 cup grated Parmesan", imported("1/4 cup grated sharp cheddar or 1/2 cup grated Parmesan cheese"), [0.25, "cup", "sharp cheddar", "grated, or 1/2 cup grated Parmesan cheese"]);

console.log("Import: a dash and a second amount (saved apart by older imports):");
eq("1 -1/2 lbs. ground beef", fragmentLine("1 -1/2 lbs. ground beef"), [1.5, "pound", "ground beef", "", 1]);
eq("2 -1/2 cups Monterey Jack Cheese, Grated", fragmentLine("2 -1/2 cups Monterey Jack Cheese, Grated"), [2.5, "cup", "Monterey Jack Cheese", "grated", 1]);
eq("1 - 1/2 C whipped cream", fragmentLine("1 - 1/2 C whipped cream"), [1.5, "cup", "whipped cream", "", 1]);
eq("1 -1/4 cups (2-1/2 sticks) butter", fragmentLine("1 -1/4 cups (2-1/2 sticks) butter, softened"), [1.25, "cup", "butter", "2 1/2 sticks, softened", 1]);
eq("1 -1/2 cups chopped onion", fragmentLine("1 -1/2 cups chopped onion"), [1.5, "cup", "onion", "chopped", 1]);
eq("2 -1/4 cups packed brown sugar", fragmentLine("2 -1/4 cups packed brown sugar"), [2.25, "cup", "brown sugar", "packed", 1]);
eq("mixed number doubt reads as a question", parseIngredientText("1 -1/2 lbs. ground beef", lookup)?.doubts, ['Read "1 -1/2" as 1 1/2 lb?']);
eq("0.25 - 1/2 cup is a range", fragmentLine("0.25 - 1/2 cup shredded Monterey jack cheese"), [0.5, "cup", "Monterey jack cheese", "1/4 to 1/2 cup, shredded", 0]);
eq("2 \u2013 8 ounce pkg", fragmentLine("2 \u2013 8 ounce pkg cream cheese at room temperature"), [2, "package", "cream cheese", "8 oz, at room temperature", 0]);
eq("2 - 8 ounce pkgs.", fragmentLine("2 - 8 ounce pkgs. cream cheese, softened"), [2, "package", "cream cheese", "8 oz, softened", 0]);
eq("1 -10-oz. pkg.", fragmentLine("1 -10-oz. pkg. REESE'S Peanut Butter Chips"), [1, "package", "REESE'S Peanut Butter Chips", "10 oz", 0]);
eq("0.5 -10-oz. pkg. asks", fragmentLine("0.5 -10-oz. pkg. REESE'S Peanut Butter Chips"), [0.5, "package", "REESE'S Peanut Butter Chips", "10 oz", 1]);
eq("1 - 14 ounce can", fragmentLine("1 - 14 ounce can sweetened condensed milk"), [1, "can", "sweetened condensed milk", "14 oz", 0]);
eq("1 -16 oz is one container", fragmentLine("1 -16 oz sour cream"), [16, "ounce", "sour cream", "", 1]);
eq("1 cup -1 1/2 c.", fragmentLine("1 cup -1 1/2 c. shredded cheddar cheese"), [1.5, "cup", "cheddar cheese", "1 to 1 1/2 cups, shredded", 0]);
eq("2 cup -2 cups, shredded", fragmentLine("2 cup -2 cups shredded mozzarella cheese, shredded"), [2, "cup", "mozzarella cheese", "shredded", 0]);
eq("2.5 cup -3 cups", fragmentLine("2.5 cup -3 cups quick oats"), [3, "cup", "quick oats", "2 1/2 to 3 cups", 0]);
eq("4 -6 slices bacon cooked and crumbled", fragmentLine("4 -6 slices bacon cooked and crumbled"), [6, "slice", "bacon", "4 to 6 slices, cooked and crumbled", 0]);
eq("4 -6 cooked and cubed chicken breast", fragmentLine("4 -6 cooked and cubed chicken breast"), [6, null, "cooked chicken breast", "4 to 6, cubed", 0]);
eq("4 -5 stalks of celery", fragmentLine("4 -5 stalks of celery, sliced"), [5, "each", "celery", "4 to 5 stalks, sliced", 0]);
eq("0.5 - 1 stick of butter", fragmentLine("0.5 - 1 stick of butter, 1/4-1/2 cup"), [1, "each", "butter", "1/2 to 1 stick, 1/4-1/2 cup", 0]);
eq("list with etc. keeps the name's word", imported("4 -5 cups milk, or combination of cream, milk, etc."), [5, "cup", "milk", "4 to 5 cups, or combination of cream, milk, etc."]);

console.log("Import: T. is a tablespoon, t. a teaspoon:");
eq("-4 T. milk", imported("2 -4 T. milk, for frosting"), [4, "tablespoon", "milk", "2 to 4 tbsp, for frosting"]);
eq("-2 T. margarine", imported("1 -2 T. margarine or butter, melted"), [2, "tablespoon", "margarine", "1 to 2 tbsp, or butter, melted"]);
eq("-6 T. cocoa", imported("5 -6 T. cocoa"), [6, "tablespoon", "cocoa", "5 to 6 tbsp"]);
eq("-5 T. whipping cream", imported("4 -5 T. whipping cream, for icing"), [5, "tablespoon", "whipping cream", "4 to 5 tbsp, for icing"]);
eq("-4 T. Salad Supreme", imported("2 -4 T. Salad Supreme"), [4, "tablespoon", "Salad Supreme", "2 to 4 tbsp"]);
eq("-3 t. grated orange peel", imported("2 -3 t. grated orange peel"), [3, "teaspoon", "orange peel", "2 to 3 tsp, grated"]);
eq("2 T butter, no range", imported("2 T butter"), [2, "tablespoon", "butter", ""]);
eq("1 t salt", imported("1 t salt"), [1, "teaspoon", "salt", ""]);
eq("3 C flour", imported("3 C flour"), [3, "cup", "flour", ""]);
eq("T. on display", formatIngredientText("2 T. butter"), "2 tbsp butter");

console.log("Import: containers after a weight or volume:");
eq("6 ounce package feta cheese", imported("6 ounce package feta cheese, crumbled"), [6, "ounce", "feta cheese", "package, crumbled"]);
eq("12 ounce can of salsa", imported("12 ounce can of salsa"), [12, "ounce", "salsa", "can"]);
eq("12 ounce box jumbo shells pasta", imported("12 ounce box jumbo shells pasta"), [12, "ounce", "jumbo shells pasta", "box"]);
eq("36 ounce (28 oz) can crushed tomatoes", imported("36 ounce (28 oz) can crushed tomatoes"), [36, "ounce", "crushed tomatoes", "28 oz can"]);
eq("3 cup (1/4-inch-thick) slices small zucchini", imported("3 cup (1/4-inch-thick) slices small zucchini"), [3, "cup", "zucchini", "1/4-inch-thick slices, small"]);

console.log("Import: other shapes from the second run:");
eq("whole Eggs Beaten", imported("3 whole Eggs Beaten"), [3, null, "Eggs", "whole, beaten"]);
eq("Soy Sauce Or More To Taste", imported("2 tbsp Soy Sauce Or More To Taste"), [2, "tablespoon", "Soy Sauce", "or more to taste"]);
eq("peeled and cut in cubes before the noun", imported("3 lb (about 5 cups) peeled and cut in 3/4 inch cubes butternut squash"), [3, "pound", "butternut squash", "about 5 cups, peeled and cut in 3/4 inch cubes"]);
eq("cooked and shredded chicken", imported("2 cups cooked and shredded chicken"), [2, "cup", "cooked chicken", "shredded"]);
eq("cooked and cut up chicken breast", imported("2 cups cooked and cut up chicken breast"), [2, "cup", "cooked chicken breast", "cut up"]);
eq("cooked diced chicken", imported("2 cups cooked diced chicken"), [2, "cup", "cooked chicken", "diced"]);
eq("cooked and crumbled bacon", imported("1/2 cup cooked and crumbled bacon"), [0.5, "cup", "cooked bacon", "crumbled"]);

console.log("Matching a name to the Ingredient table:");
const rows = [
  { id: 1, name: "garlic parmesan breading" },
  { id: 2, name: "uncooked penne pasta" },
  { id: 3, name: "onion" },
  { id: 4, name: "salt and pepper" },
  { id: 5, name: "Tomatoes" },
  { id: 6, name: "berries" },
];
const match = (name: string) => pickIngredientMatch(name, rows)?.id ?? null;
eq("garlic is not garlic parmesan breading", match("garlic"), null);
eq("penne pasta is not uncooked penne pasta", match("penne pasta"), null);
eq("plural finds the singular", match("onions"), 3);
eq("singular finds the plural", match("tomato"), 5);
eq("ies plural", match("berry"), 6);
eq("case doesn't matter", match("Salt and Pepper"), 4);
eq("exact wins over a plural", pickIngredientMatch("onion", [{ id: 7, name: "onions" }, { id: 3, name: "onion" }])?.id, 3);
eq("a longer name never matches", match("salt"), null);
eq("variants hold both forms", ["green onions", "green onion"].every((v) => ingredientNameVariants("green onions").includes(v)), true);

console.log("Display: saved names with a size in front:");
eq("(8 oz.) packages", formatIngredientLine(2, "ea", "(8 oz.) packages cream cheese"), "2 packages cream cheese (8 oz)");
eq("(1 stick) butter", formatIngredientLine(0.5, "cup", "(1 stick) butter"), "1/2 cup butter (1 stick)");
eq("(700 grams) chicken", formatIngredient(1.5, "lb", "(700 grams) chicken boneless"), { amount: "1 1/2 lb", name: "chicken boneless (700 grams)" });
eq("(about 5 cups)", formatIngredientLine(1, "ea", "(about 5 cups) butternut squash"), "1 butternut squash (about 5 cups)");
eq("(11.5 oz) package", formatIngredientLine(1, "ea", "(11.5 oz) package milk chocolate chips"), "1 package milk chocolate chips (11.5 oz)");
eq("Neufchatel", formatIngredientLine(1, "ea", "(8 oz) pkg Neufchatel cheese*"), "1 pkg Neufchatel cheese (8 oz)");
eq("cup(s) then a size", formatIngredientLine(1, "ea", "cup(s) (1 stick) unsalted butter"), "1 cup unsalted butter (1 stick)");
eq("teaspoon(s)", formatIngredientLine(1, "ea", "teaspoon(s) baking powder"), "1 tsp baking powder");
eq("teaspoon(s) with its unit", formatIngredientLine(1, "tsp", "teaspoon(s) baking powder"), "1 tsp baking powder");
eq("Neufchatel as imported now", formatIngredientLine(1, "pkg", "Neufchatel cheese"), "1 pkg Neufchatel cheese");

console.log("Display: seasoning with no amount:");
eq("to taste", formatIngredientLine(0, "ea", "salt and pepper"), "Salt and pepper, to taste");
eq("author casing kept", formatIngredientLine(0, "ea", "Salt and freshly ground black pepper"), "Salt and freshly ground black pepper, to taste");
eq("no doubled to taste", formatIngredientLine(0, "ea", "salt, to taste"), "Salt, to taste");
eq("measured salt unchanged", formatIngredientLine(0.25, "tsp", "salt"), "1/4 tsp salt");
eq("to-taste note drops", cleanIngredientNote("to taste", formatIngredient(0, "ea", "salt and pepper").name), "");

console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
