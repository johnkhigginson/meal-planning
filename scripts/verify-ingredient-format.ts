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
  readQuantity,
} from "../src/lib/ingredient-format";

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
eq("no amount", formatIngredientLine(0, "cup", "salt"), "salt");

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
eq("saved as 1 each shows no count", formatIngredientLine(1, "ea", "Salt and freshly ground black pepper"), "Salt and freshly ground black pepper");
eq("saved total of 3 each shows no count", formatIngredientLine(3, "ea", "kosher salt"), "kosher salt");
eq("saved with no amount", formatIngredientLine(0, "ea", "Salt and freshly ground black pepper"), "Salt and freshly ground black pepper");
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

console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
