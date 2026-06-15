import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { audit } from "@/lib/audit";

type RouteParams = { params: Promise<{ id: string }> };

// Delete a comment. Allowed for an admin or a member of the household that owns
// the commented recipe (i.e. the blog owner moderating their own posts).
export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { id } = await params;
  const commentId = parseInt(id, 10);
  if (!commentId) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const comment = await prisma.comment.findUnique({
    where: { id: commentId },
    select: { id: true, userId: true, recipe: { select: { householdId: true } } },
  });
  if (!comment) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Allowed: an admin, the recipe owner's household, or the comment's author.
  const isAuthor = comment.userId != null && comment.userId === user.userId;
  if (!user.isAdmin && comment.recipe.householdId !== user.householdId && !isAuthor) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  await prisma.comment.delete({ where: { id: commentId } });

  await audit({
    category: "COMMENT",
    action: "COMMENT_DELETED",
    summary: `${user.name} deleted a comment`,
    actorUserId: user.userId,
    actorName: user.name,
    householdId: user.householdId,
    targetType: "COMMENT",
    targetId: commentId,
  });

  return NextResponse.json({ success: true });
}
