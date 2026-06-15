import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isRecipePubliclyVisible } from "@/lib/blog";
import { verifyTurnstile } from "@/lib/turnstile";

// Public comments for a blog recipe. No auth required to read or post; posting
// is gated by Turnstile + a honeypot, and only allowed on publicly-visible
// (published) recipes.

export async function GET(request: NextRequest) {
  const recipeId = parseInt(new URL(request.url).searchParams.get("recipeId") || "", 10);
  if (!recipeId) return NextResponse.json({ error: "recipeId required" }, { status: 400 });

  if (!(await isRecipePubliclyVisible(recipeId))) {
    return NextResponse.json({ comments: [] });
  }

  const comments = await prisma.comment.findMany({
    where: { recipeId, approved: true },
    orderBy: { createdAt: "asc" },
    select: { id: true, authorName: true, body: true, createdAt: true },
  });
  return NextResponse.json({ comments });
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  const recipeId = Number(body.recipeId);
  const authorName = typeof body.authorName === "string" ? body.authorName.trim() : "";
  const text = typeof body.body === "string" ? body.body.trim() : "";
  const honeypot = typeof body.website === "string" ? body.website : "";

  // Honeypot: bots fill hidden fields. Pretend success without storing.
  if (honeypot) return NextResponse.json({ ok: true });

  if (!recipeId || !authorName || !text) {
    return NextResponse.json({ error: "Name and comment are required." }, { status: 400 });
  }
  if (authorName.length > 120 || text.length > 5000) {
    return NextResponse.json({ error: "Comment is too long." }, { status: 400 });
  }

  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const human = await verifyTurnstile(body.turnstileToken, ip);
  if (!human) {
    return NextResponse.json({ error: "Bot verification failed. Please try again." }, { status: 400 });
  }

  if (!(await isRecipePubliclyVisible(recipeId))) {
    return NextResponse.json({ error: "Comments are not available for this recipe." }, { status: 404 });
  }

  const comment = await prisma.comment.create({
    data: { recipeId, authorName, body: text },
    select: { id: true, authorName: true, body: true, createdAt: true },
  });
  return NextResponse.json({ comment }, { status: 201 });
}
