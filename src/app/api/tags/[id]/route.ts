import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { audit } from "@/lib/audit";

type RouteParams = { params: Promise<{ id: string }> };

// Delete a custom category. Only a tag owned by the caller's household may be
// removed — standard categories and other households' categories are off
// limits. Removing it also detaches it from this household's recipes (RecipeTag
// cascades on tag delete).
export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  const user = await requireUser();
  const { id } = await params;
  const tagId = parseInt(id, 10);
  if (Number.isNaN(tagId)) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const tag = await prisma.tag.findFirst({
    where: { id: tagId, householdId: user.householdId },
    select: { id: true, name: true },
  });
  if (!tag) {
    // Either it doesn't exist, it's a standard category, or it belongs to
    // another household — none of which this user may delete.
    return NextResponse.json({ error: "You can't delete this category" }, { status: 403 });
  }

  await prisma.tag.delete({ where: { id: tagId } });

  await audit({
    category: "RECIPE",
    action: "TAG_DELETED",
    summary: `${user.name} deleted the category “${tag.name}”`,
    actorUserId: user.userId,
    actorName: user.name,
    householdId: user.householdId,
    targetType: "TAG",
    targetId: tagId,
  });

  return NextResponse.json({ success: true });
}
