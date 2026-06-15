import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isRecipePubliclyVisible } from "@/lib/blog";
import { getCurrentUser } from "@/lib/auth";
import { audit, clientIp } from "@/lib/audit";

// Comments on a published blog recipe. Anyone can read; posting requires being
// signed in.

export async function GET(request: NextRequest) {
  const recipeId = parseInt(new URL(request.url).searchParams.get("recipeId") || "", 10);
  if (!recipeId) return NextResponse.json({ error: "recipeId required" }, { status: 400 });

  if (!(await isRecipePubliclyVisible(recipeId))) {
    return NextResponse.json({ comments: [] });
  }

  const viewer = await getCurrentUser();
  const rows = await prisma.comment.findMany({
    where: { recipeId, approved: true },
    orderBy: { createdAt: "asc" },
    select: { id: true, userId: true, authorName: true, body: true, createdAt: true },
  });

  const comments = rows.map((c) => ({
    id: c.id,
    authorName: c.authorName,
    body: c.body,
    createdAt: c.createdAt,
    mine: !!viewer && c.userId === viewer.userId, // lets the author delete their own
  }));
  return NextResponse.json({ comments });
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Please sign in to comment." }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  const recipeId = Number(body.recipeId);
  const text = typeof body.body === "string" ? body.body.trim() : "";

  if (!recipeId || !text) {
    return NextResponse.json({ error: "A comment is required." }, { status: 400 });
  }
  if (text.length > 5000) {
    return NextResponse.json({ error: "Comment is too long." }, { status: 400 });
  }

  if (!(await isRecipePubliclyVisible(recipeId))) {
    return NextResponse.json({ error: "Comments are not available for this recipe." }, { status: 404 });
  }

  const dbUser = await prisma.user.findUnique({ where: { id: user.userId }, select: { name: true } });

  const comment = await prisma.comment.create({
    data: { recipeId, userId: user.userId, authorName: dbUser?.name ?? "Member", body: text },
    select: { id: true, authorName: true, body: true, createdAt: true },
  });

  await audit({
    category: "COMMENT",
    action: "COMMENT_CREATED",
    summary: `${comment.authorName} commented on a recipe`,
    actorUserId: user.userId,
    actorName: comment.authorName,
    targetType: "RECIPE",
    targetId: recipeId,
    ip: clientIp(request),
  });

  return NextResponse.json({ comment: { ...comment, mine: true } }, { status: 201 });
}
