import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import crypto from "crypto";

export async function POST(request: NextRequest) {
  const { userId, householdId } = await requireUser();
  const { recipeId } = await request.json();

  const recipe = await prisma.recipe.findFirst({ where: { id: recipeId, householdId } });
  if (!recipe) return NextResponse.json({ error: "Not found" }, { status: 404 });

  let link = await prisma.shareLink.findFirst({ where: { recipeId, shareType: "RECIPE" } });
  if (!link) {
    link = await prisma.shareLink.create({
      data: {
        token: crypto.randomBytes(24).toString("hex"),
        shareType: "RECIPE",
        recipeId,
        createdById: userId,
      },
    });
  }

  return NextResponse.json({ token: link.token, url: `https://mylemonkitchen.com/share/${link.token}` });
}
