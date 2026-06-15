import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client.js";
import { PrismaMssql } from "@prisma/adapter-mssql";

const adapter = new PrismaMssql({
  server: process.env.DB_HOST!,
  port: parseInt(process.env.DB_PORT || "1433", 10),
  database: process.env.DB_NAME!,
  user: process.env.DB_USER!,
  password: process.env.DB_PASSWORD!,
  options: {
    encrypt: true,
    trustServerCertificate: true,
  },
});

const prisma = new PrismaClient({ adapter });

async function main() {
  // ─── Units ──────────────────────────────────────────────────
  const units = await Promise.all([
    // VOLUME
    prisma.unit.upsert({ where: { name: "teaspoon" }, update: {}, create: { name: "teaspoon", abbreviation: "tsp", unitType: "VOLUME" } }),
    prisma.unit.upsert({ where: { name: "tablespoon" }, update: {}, create: { name: "tablespoon", abbreviation: "tbsp", unitType: "VOLUME" } }),
    prisma.unit.upsert({ where: { name: "cup" }, update: {}, create: { name: "cup", abbreviation: "cup", unitType: "VOLUME" } }),
    prisma.unit.upsert({ where: { name: "fluid ounce" }, update: {}, create: { name: "fluid ounce", abbreviation: "fl oz", unitType: "VOLUME" } }),
    prisma.unit.upsert({ where: { name: "pint" }, update: {}, create: { name: "pint", abbreviation: "pt", unitType: "VOLUME" } }),
    prisma.unit.upsert({ where: { name: "quart" }, update: {}, create: { name: "quart", abbreviation: "qt", unitType: "VOLUME" } }),
    prisma.unit.upsert({ where: { name: "gallon" }, update: {}, create: { name: "gallon", abbreviation: "gal", unitType: "VOLUME" } }),
    prisma.unit.upsert({ where: { name: "milliliter" }, update: {}, create: { name: "milliliter", abbreviation: "ml", unitType: "VOLUME" } }),
    prisma.unit.upsert({ where: { name: "liter" }, update: {}, create: { name: "liter", abbreviation: "L", unitType: "VOLUME" } }),
    // WEIGHT
    prisma.unit.upsert({ where: { name: "ounce" }, update: {}, create: { name: "ounce", abbreviation: "oz", unitType: "WEIGHT" } }),
    prisma.unit.upsert({ where: { name: "pound" }, update: {}, create: { name: "pound", abbreviation: "lb", unitType: "WEIGHT" } }),
    prisma.unit.upsert({ where: { name: "gram" }, update: {}, create: { name: "gram", abbreviation: "g", unitType: "WEIGHT" } }),
    prisma.unit.upsert({ where: { name: "kilogram" }, update: {}, create: { name: "kilogram", abbreviation: "kg", unitType: "WEIGHT" } }),
    // COUNT
    prisma.unit.upsert({ where: { name: "each" }, update: {}, create: { name: "each", abbreviation: "ea", unitType: "COUNT" } }),
    prisma.unit.upsert({ where: { name: "dozen" }, update: {}, create: { name: "dozen", abbreviation: "doz", unitType: "COUNT" } }),
    // OTHER
    prisma.unit.upsert({ where: { name: "pinch" }, update: {}, create: { name: "pinch", abbreviation: "pinch", unitType: "OTHER" } }),
    prisma.unit.upsert({ where: { name: "dash" }, update: {}, create: { name: "dash", abbreviation: "dash", unitType: "OTHER" } }),
    prisma.unit.upsert({ where: { name: "clove" }, update: {}, create: { name: "clove", abbreviation: "clove", unitType: "OTHER" } }),
    prisma.unit.upsert({ where: { name: "bunch" }, update: {}, create: { name: "bunch", abbreviation: "bunch", unitType: "OTHER" } }),
    prisma.unit.upsert({ where: { name: "can" }, update: {}, create: { name: "can", abbreviation: "can", unitType: "OTHER" } }),
    prisma.unit.upsert({ where: { name: "package" }, update: {}, create: { name: "package", abbreviation: "pkg", unitType: "OTHER" } }),
    prisma.unit.upsert({ where: { name: "slice" }, update: {}, create: { name: "slice", abbreviation: "slice", unitType: "OTHER" } }),
  ]);

  // Build a name→id lookup
  const u: Record<string, number> = {};
  for (const unit of units) {
    u[unit.name] = unit.id;
  }

  // ─── Unit Conversions ───────────────────────────────────────
  const conversions = [
    // Volume
    { from: "teaspoon", to: "tablespoon", factor: 1 / 3 },
    { from: "tablespoon", to: "cup", factor: 1 / 16 },
    { from: "tablespoon", to: "teaspoon", factor: 3 },
    { from: "cup", to: "tablespoon", factor: 16 },
    { from: "fluid ounce", to: "cup", factor: 1 / 8 },
    { from: "cup", to: "fluid ounce", factor: 8 },
    { from: "cup", to: "pint", factor: 1 / 2 },
    { from: "pint", to: "cup", factor: 2 },
    { from: "pint", to: "quart", factor: 1 / 2 },
    { from: "quart", to: "pint", factor: 2 },
    { from: "quart", to: "gallon", factor: 1 / 4 },
    { from: "gallon", to: "quart", factor: 4 },
    { from: "teaspoon", to: "milliliter", factor: 4.929 },
    { from: "tablespoon", to: "milliliter", factor: 14.787 },
    { from: "cup", to: "milliliter", factor: 236.588 },
    { from: "fluid ounce", to: "milliliter", factor: 29.5735 },
    { from: "milliliter", to: "liter", factor: 1 / 1000 },
    { from: "liter", to: "milliliter", factor: 1000 },
    { from: "cup", to: "liter", factor: 0.236588 },
    // Weight
    { from: "ounce", to: "pound", factor: 1 / 16 },
    { from: "pound", to: "ounce", factor: 16 },
    { from: "ounce", to: "gram", factor: 28.3495 },
    { from: "gram", to: "ounce", factor: 1 / 28.3495 },
    { from: "pound", to: "gram", factor: 453.592 },
    { from: "gram", to: "pound", factor: 1 / 453.592 },
    { from: "gram", to: "kilogram", factor: 1 / 1000 },
    { from: "kilogram", to: "gram", factor: 1000 },
    { from: "pound", to: "kilogram", factor: 0.453592 },
    { from: "kilogram", to: "pound", factor: 2.20462 },
    // Count
    { from: "each", to: "dozen", factor: 1 / 12 },
    { from: "dozen", to: "each", factor: 12 },
  ];

  for (const c of conversions) {
    await prisma.unitConversion.upsert({
      where: {
        fromUnitId_toUnitId: { fromUnitId: u[c.from], toUnitId: u[c.to] },
      },
      update: { factor: c.factor },
      create: { fromUnitId: u[c.from], toUnitId: u[c.to], factor: c.factor },
    });
  }

  // ─── Standard categories ────────────────────────────────────
  // Standard (householdId = null) categories everyone sees. Keep in sync with
  // STANDARD_TAGS in src/lib/tags.ts. `name` is no longer globally unique, so
  // find-or-create against the standard scope rather than upserting by name.
  const standardTags = [
    "Breakfast", "Lunch", "Dinner", "Appetizer", "Side Dish", "Salad", "Soup",
    "Bread", "Dessert", "Snack", "Drink", "Sauce", "Vegetarian", "Vegan",
    "Gluten-Free", "Quick", "Healthy", "Comfort Food", "Italian", "Mexican", "Asian",
  ];

  for (const name of standardTags) {
    const existing = await prisma.tag.findFirst({ where: { name, householdId: null } });
    if (!existing) await prisma.tag.create({ data: { name, householdId: null } });
  }

  console.log("Seed completed: units, conversions, and tags created.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
