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

console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
