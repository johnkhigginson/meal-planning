import { NextRequest, NextResponse } from "next/server";
import { requireHouseholdId } from "@/lib/auth";
import { findMatchingRecipes } from "@/lib/matching";

export async function GET(request: NextRequest) {
  const householdId = await requireHouseholdId();
  const { searchParams } = new URL(request.url);
  const minMatch = parseFloat(searchParams.get("minMatch") || "0");
  const results = await findMatchingRecipes(householdId, minMatch);
  return NextResponse.json(results);
}
