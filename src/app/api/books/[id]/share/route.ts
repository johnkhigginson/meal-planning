import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { getSiteUrl } from "@/lib/site";
import crypto from "crypto";

type RouteParams = { params: Promise<{ id: string }> };

const SHARE_TTL_DAYS = 365;

export async function POST(_request: NextRequest, { params }: RouteParams) {
  const { userId, householdId } = await requireUser();
  const { id } = await params;
  const bookId = parseInt(id, 10);

  const book = await prisma.recipeBook.findFirst({ where: { id: bookId, householdId } });
  if (!book) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const expiresAt = new Date(Date.now() + SHARE_TTL_DAYS * 24 * 60 * 60 * 1000);
  let link = await prisma.shareLink.findFirst({ where: { recipeBookId: bookId, shareType: "BOOK" } });
  if (!link) {
    link = await prisma.shareLink.create({
      data: {
        token: crypto.randomBytes(24).toString("hex"),
        shareType: "BOOK",
        recipeBookId: bookId,
        createdById: userId,
        expiresAt,
      },
    });
  } else {
    link = await prisma.shareLink.update({
      where: { id: link.id },
      data: { expiresAt, revokedAt: null },
    });
  }

  return NextResponse.json({ token: link.token, url: `${getSiteUrl()}/share/${link.token}` });
}

// Revoke (stop sharing) a book's share link.
export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  const { householdId } = await requireUser();
  const { id } = await params;
  const bookId = parseInt(id, 10);

  const book = await prisma.recipeBook.findFirst({ where: { id: bookId, householdId }, select: { id: true } });
  if (!book) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.shareLink.updateMany({
    where: { recipeBookId: bookId, shareType: "BOOK", revokedAt: null },
    data: { revokedAt: new Date() },
  });
  return NextResponse.json({ success: true });
}
