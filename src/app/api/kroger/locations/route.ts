import { NextRequest, NextResponse } from "next/server";
import { requireHouseholdId } from "@/lib/auth";
import { searchLocations } from "@/lib/kroger";

export async function GET(request: NextRequest) {
  await requireHouseholdId();
  const { searchParams } = new URL(request.url);
  const zip = searchParams.get("zip");

  if (!zip) {
    return NextResponse.json({ error: "zip parameter required" }, { status: 400 });
  }

  try {
    const locations = await searchLocations(zip);
    return NextResponse.json(locations);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to search locations";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
