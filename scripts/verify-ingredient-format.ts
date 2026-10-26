// Offline checks for the shared ingredient formatter (src/lib/ingredient-format.ts).
// No DB or network needed. Run: npx tsx scripts/verify-ingredient-format.ts

import {
  formatAmount,
  formatIngredient,
  formatIngredientLine,
  formatQuantity,
  formatUnit,
  cleanIngredientName,
} from "../src/lib/ingredient-format";

let failures = 0;
function eq(label: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) { failures++; console.log(`  ✗ ${label}: got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)}`); }
  else console.log(`  ✓ ${label}`);
}

console.log("Quantities:");
eq("whole number", formatQuantity(2), "2");
eq("half", formatQuantity(1.5), "1.5");
eq("trims float noise", formatQuantity(0.1 + 0.2), "0.3");
eq("thirds round to 2 places", formatQuantity(1 / 3), "0.33");
eq("zero is blank", formatQuantity(0), "");
eq("NaN is blank", formatQuantity(NaN), "");

console.log("Units:");
eq("1 cup", formatAmount(1, "cup"), "1 cup");
eq("1.5 cups", formatAmount(1.5, "cup"), "1.5 cups");
eq("half a cup stays singular", formatAmount(0.5, "cup"), "0.5 cup");
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
eq("no doubled cup", formatIngredientLine(1.5, "cup", "cup(s) powdered sugar"), "1.5 cups powdered sugar");
eq("no trailing comma", formatIngredientLine(3, "clove", "garlic,"), "3 cloves garlic");
eq("doubled plural unit", formatIngredientLine(2, "cup", "cups flour"), "2 cups flour");
eq("doubled abbreviation", formatIngredientLine(2, "tsp", "tsp salt"), "2 tsp salt");
eq("unit stuck in name of a count", formatIngredientLine(1.5, "ea", "cup(s) powdered sugar"), "1.5 cups powdered sugar");
eq("plain count", formatIngredientLine(3, "ea", "eggs"), "3 eggs");
eq("name that starts like a word is kept", formatIngredientLine(1, "cup", "cupcake liners"), "1 cup cupcake liners");
eq("split parts", formatIngredient(1, "cup", "milk,"), { amount: "1 cup", name: "milk" });
eq("no amount", formatIngredientLine(0, "cup", "salt"), "salt");

console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
