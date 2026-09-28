import type { IngredientCategory } from "./constants";

// Best-guess grocery aisle from an ingredient's name, so a new ingredient lands
// in a sensible section of the grocery list instead of "Other". The cook can
// correct it from the list, and a correction sticks to the ingredient.
//
// Rules run in order and the first match wins. Order carries the meaning:
// "chicken broth" hits Pantry before Meat, "garlic powder" hits Spices before
// Produce, "peanut butter" hits Pantry before Dairy, and "flour tortillas" hits
// Bakery before Baking.
const RULES: [IngredientCategory, RegExp][] = [
  ["Frozen", /\bfrozen\b|\bice cream\b/],
  [
    "Pantry",
    /\b(broth|stock|bouillon|canned|peanut butter|almond butter|coconut milk|evaporated milk|condensed milk|cream of|soup|tomato (sauce|paste)|(diced|crushed|stewed) tomatoes|bread ?crumbs|panko|tortilla chips|potato chips|egg noodles|butter beans|coconut cream|soda crackers|saltines?|oyster crackers)\b/,
  ],
  ["Spices", /\b((crushed|ground) red pepper|celery (seed|salt))\b/],
  [
    "Produce",
    /\b(celery|egg roll wrappers?|wonton wrappers?|tofu|(bell|green|red|yellow|orange|sweet) peppers?(?! flakes)|jalape(n|ñ)os?( peppers?)?|poblanos?( peppers?)?|serranos?( peppers?)?|habaneros?|snap peas|fresh (basil|oregano|thyme|parsley|rosemary|dill|sage|mint|cilantro|chives|ginger))\b/,
  ],
  ["Bakery", /\btortillas?\b/],
  [
    "Baking",
    /\b(flour|sugar|baking (soda|powder)|yeast|cocoa|chocolate chips?|(milk|dark|white|semi-?sweet|bittersweet|baking) chocolate|chocolate bars?|vanilla( extract| bean)?$|cornstarch|corn starch|cornmeal|molasses|shortening|sprinkles|cake mix|pudding mix|graham crackers?|food coloring|corn syrup|marshmallows?)\b/,
  ],
  [
    "Spices",
    /\b(salt|pepper|peppercorns?|red pepper flakes|cayenne|paprika|cumin|cinnamon|nutmeg|allspice|ground (ginger|cloves|mustard|coriander)|whole cloves|dry mustard|chili|curry|turmeric|oregano|italian seasoning|seasoning|bay lea(f|ves)|(garlic|onion) (powder|salt)|dried (basil|oregano|thyme|parsley|rosemary|dill|sage|herbs|chives))( powder| salt| sticks?| leaves| flakes)?$|^(salt|pepper)( and (salt|pepper))?$/,
  ],
  [
    "Condiments",
    /\b(ketchup|mustard|mayo(nnaise)?|soy sauce|hot sauce|sriracha|worcestershire|bbq sauce|barbecue sauce|teriyaki|fish sauce|steak sauce|oyster sauce|hoisin|salsa|relish|pickles?|apple butter|vinegar|dressing|ranch|honey|maple syrup|jam|jelly|pesto)\b/,
  ],
  [
    "Deli",
    /\b(deli|salami|pepperoni|prosciutto|pastrami|bologna|lunch ?meat|rotisserie chicken|sliced (turkey|ham|provolone|swiss|cheddar))\b/,
  ],
  [
    "Seafood",
    /\b(salmon|shrimp|prawns?|tuna|cod|tilapia|halibut|crab|lobster|scallops?|clams?|mussels|fish|anchov(y|ies))\b/,
  ],
  [
    "Meat",
    /\b(chicken|beef|pork|bacon|sausages?|ham|turkey|lamb|steaks?|veal|chorizo|brisket|ribs|meatballs?|roast|sirloin|rib-?eye|tenderloin|pork chops?)\b/,
  ],
  [
    "Dairy",
    /\b(milk|buttermilk|butter|cheese|cheddar|mozzarella|parmesan|feta|ricotta|provolone|swiss|gouda|monterey jack|colby|cream|yogurt|eggs?|half (and|&) half|ghee)\b/,
  ],
  [
    "Bakery",
    /\b(bread|buns?|rolls?|bagels?|pitas?|croissants?|english muffins?|baguette|naan)\b/,
  ],
  // Before Produce so "orange juice" is a drink. Lemon and lime juice stay produce.
  ["Beverages", /\b(?<!(lemon|lime) )juice\b|\b(soda|coffee|tea|wine|beer|sparkling water|ginger ale|ginger beer)\b/],
  [
    "Produce",
    /\b(onions?|garlic|potato(es)?|tomato(es)?|lettuce|romaine|spinach|kale|arugula|carrots?|celery|cucumbers?|zucchini|squash|peppers?|broccoli|cauliflower|cabbage|mushrooms?|avocados?|lemons?|limes?|oranges?|apples?|bananas?|berries|strawberries|blueberries|raspberries|grapes|pineapple|mangos?|peach(es)?|pears?|cherries|cilantro|parsley|basil|mint|dill|thyme|rosemary|sage|ginger|scallions?|shallots?|leeks?|corn|peas|green beans|asparagus|radish(es)?|beets?|herbs?|fruit|chives|eggplants?|cranberries|blackberries|plums?|kiwis?|watermelon|cantaloupe|jicama|okra|bok choy|brussels sprouts)\b/,
  ],
  [
    "Pantry",
    /\b(rice|pasta|spaghetti|penne|noodles|macaroni|oats|oatmeal|oil|beans|lentils|chickpeas|quinoa|cereal|crackers|chips|nuts|almonds|walnuts|pecans|peanuts|raisins|coconut|popcorn)\b/,
  ],
];

export function guessIngredientCategory(name: string): IngredientCategory | null {
  const n = name.toLowerCase().trim();
  for (const [category, pattern] of RULES) {
    if (pattern.test(n)) return category;
  }
  return null;
}
