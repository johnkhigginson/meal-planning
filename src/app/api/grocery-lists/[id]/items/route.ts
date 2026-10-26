import { NextRequest, NextResponse } from "next/server";
import { requireHouseholdId } from "@/lib/auth";
import { addItemToList } from "@/lib/grocery";
import { enforceRateLimit, ipKey } from "@/lib/rate-limit";

type RouteParams = { params: Promise<{ id: string }> };

// Adds a typed line ("2 lb chicken") to a list that isn't tied to a meal plan.
export async function POST(request: NextRequest, { params }: RouteParams) {
  const householdId = await requireHouseholdId();
  const { id } = await params;
  const listId = parseInt(id, 10);
  if (Number.isNaN(listId)) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const limited = enforceRateLimit("grocery-item", ipKey(request), 60, 60_000);
  if (limited) return limited;

  const body = await request.json().catch(() => null);
  const text = typeof body?.text === "string" ? body.text.trim() : "";
  if (!text || text.length > 200) {
    return NextResponse.json({ error: "Type an item, like 2 lb chicken" }, { status: 400 });
  }

  const result = await addItemToList(listId, householdId, text);
  if (result === "not-found") return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (result === "plan-list") {
    return NextResponse.json(
      { error: "This list comes from a meal plan. Add meals to the plan, then generate it again." },
      { status: 409 }
    );
  }
  if (result === "unreadable") {
    return NextResponse.json({ error: "Couldn't read that item. Try something like 2 lb chicken." }, { status: 400 });
  }
  return NextResponse.json({ success: true }, { status: 201 });
}
