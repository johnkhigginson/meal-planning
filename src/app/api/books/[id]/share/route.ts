import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import crypto from "crypto";

type RouteParams = { params: Promise<{ id: string }> };

export async function POST(_request: NextRequest, { params }: RouteParams) {
  const { userId, householdId } = await requireUser();
  const { id } = await params;
  const bookId = parseInt(id, 10);

  const book = await prisma.recipeBook.findFirst({ where: { id: bookId, householdId } });
  if (!book) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Reuse existing share link or create new
  let link = await prisma.shareLink.findFirst({ where: { recipeBookId: bookId, shareType: "BOOK" } });
  if (!link) {
    link = await prisma.shareLink.create({
      data: {
        token: crypto.randomBytes(24).toString("hex"),
        shareType: "BOOK",
        recipeBookId: bookId,
        createdById: userId,
      },
    });
  }

  return NextResponse.json({ token: link.token, url: `https://mylemonkitchen.com/share/${link.token}` });
}
