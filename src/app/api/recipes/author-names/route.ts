import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireHouseholdId } from "@/lib/auth";

// Free-text author names already used on the household's recipes, offered as
// choices in the recipe form so "Grandma Jean" is typed once.
export async function GET() {
  const householdId = await requireHouseholdId();
  const rows = await prisma.recipe.findMany({
    where: { householdId, authorName: { not: null } },
    distinct: ["authorName"],
    select: { authorName: true },
    orderBy: { authorName: "asc" },
    take: 200,
  });
  return NextResponse.json(rows.map((r) => r.authorName).filter(Boolean));
}
