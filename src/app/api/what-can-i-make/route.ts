import { NextRequest, NextResponse } from "next/server";
import { requireUserId } from "@/lib/auth";
import { findMatchingRecipes } from "@/lib/matching";

export async function GET(request: NextRequest) {
  const userId = await requireUserId();
  const { searchParams } = new URL(request.url);
  const minMatch = parseFloat(searchParams.get("minMatch") || "0");

  const results = await findMatchingRecipes(userId, minMatch);
  return NextResponse.json(results);
}
