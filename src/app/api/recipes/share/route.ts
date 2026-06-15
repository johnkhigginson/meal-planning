import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { getSiteUrl } from "@/lib/site";
import crypto from "crypto";

const SHARE_TTL_DAYS = 365;

export async function POST(request: NextRequest) {
  const { userId, householdId } = await requireUser();
  const { recipeId } = await request.json();
  if (typeof recipeId !== "number" || !Number.isInteger(recipeId)) {
    return NextResponse.json({ error: "Valid recipeId required" }, { status: 400 });
  }

  const recipe = await prisma.recipe.findFirst({ where: { id: recipeId, householdId } });
  if (!recipe) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const expiresAt = new Date(Date.now() + SHARE_TTL_DAYS * 24 * 60 * 60 * 1000);
  let link = await prisma.shareLink.findFirst({ where: { recipeId, shareType: "RECIPE" } });
  if (!link) {
    link = await prisma.shareLink.create({
      data: {
        token: crypto.randomBytes(24).toString("hex"),
        shareType: "RECIPE",
        recipeId,
        createdById: userId,
        expiresAt,
      },
    });
  } else {
    // Re-sharing refreshes the window and clears any prior revocation.
    link = await prisma.shareLink.update({
      where: { id: link.id },
      data: { expiresAt, revokedAt: null },
    });
  }

  return NextResponse.json({ token: link.token, url: `${getSiteUrl()}/share/${link.token}` });
}

// Revoke (stop sharing) a recipe's share link.
export async function DELETE(request: NextRequest) {
  const { householdId } = await requireUser();
  const recipeId = parseInt(new URL(request.url).searchParams.get("recipeId") || "0", 10);
  if (!recipeId) return NextResponse.json({ error: "recipeId required" }, { status: 400 });

  // Only revoke links for the caller's own recipe.
  const recipe = await prisma.recipe.findFirst({ where: { id: recipeId, householdId }, select: { id: true } });
  if (!recipe) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.shareLink.updateMany({
    where: { recipeId, shareType: "RECIPE", revokedAt: null },
    data: { revokedAt: new Date() },
  });
  return NextResponse.json({ success: true });
}
