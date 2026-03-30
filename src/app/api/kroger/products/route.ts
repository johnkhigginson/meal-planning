import { NextRequest, NextResponse } from "next/server";
import { requireHouseholdId } from "@/lib/auth";
import { searchProducts } from "@/lib/kroger";

export async function GET(request: NextRequest) {
  await requireHouseholdId();
  const { searchParams } = new URL(request.url);
  const term = searchParams.get("term");
  const locationId = searchParams.get("locationId") || undefined;

  if (!term) {
    return NextResponse.json({ error: "term parameter required" }, { status: 400 });
  }

  try {
    const products = await searchProducts(term, locationId);
    return NextResponse.json(products);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to search products";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
