import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { canAccessBook, eligibleAuthorsForBook } from "@/lib/collab";

type RouteParams = { params: Promise<{ id: string }> };

// Eligible authors for recipes in this cookbook (household members + its
// collaborators). Used by the new-recipe form when contributing to a cookbook.
export async function GET(_request: NextRequest, { params }: RouteParams) {
  const user = await requireUser();
  const bookId = parseInt((await params).id, 10);
  if (Number.isNaN(bookId) || !(await canAccessBook(bookId, user))) {
    return NextResponse.json([], { status: 200 });
  }
  return NextResponse.json(await eligibleAuthorsForBook(bookId));
}
