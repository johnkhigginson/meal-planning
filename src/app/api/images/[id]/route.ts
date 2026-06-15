import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

export const runtime = "nodejs";

type RouteParams = { params: Promise<{ id: string }> };

// Public if the image is referenced by published content (a recipe in a
// published book, a published book cover) or used as an author avatar.
async function isPublicImage(url: string): Promise<boolean> {
  const [recipe, book, avatar] = await Promise.all([
    prisma.recipe.findFirst({
      where: { imageUrl: url, bookEntries: { some: { recipeBook: { isPublished: true } } } },
      select: { id: true },
    }),
    prisma.recipeBook.findFirst({ where: { coverImageUrl: url, isPublished: true }, select: { id: true } }),
    prisma.user.findFirst({ where: { avatarUrl: url }, select: { id: true } }),
  ]);
  return !!(recipe || book || avatar);
}

// Referenced by something the viewer's household owns.
async function inHousehold(url: string, householdId: number): Promise<boolean> {
  const [recipe, book, avatar] = await Promise.all([
    prisma.recipe.findFirst({ where: { imageUrl: url, householdId }, select: { id: true } }),
    prisma.recipeBook.findFirst({ where: { coverImageUrl: url, householdId }, select: { id: true } }),
    prisma.user.findFirst({ where: { avatarUrl: url, householdId }, select: { id: true } }),
  ]);
  return !!(recipe || book || avatar);
}

// Serves a stored image. Published/avatar images are public; otherwise only the
// uploader or the owning household may view it (prevents id-enumeration of
// private recipe photos).
export async function GET(_request: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  const imageId = parseInt(id, 10);
  if (!imageId) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const image = await prisma.uploadedImage.findUnique({
    where: { id: imageId },
    select: { data: true, contentType: true, uploadedBy: true },
  });
  if (!image) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const url = `/api/images/${imageId}`;
  let cache = "public, max-age=31536000, immutable";
  if (!(await isPublicImage(url))) {
    const user = await getCurrentUser();
    const ownUpload = !!user && image.uploadedBy === user.userId;
    if (!ownUpload && (!user || !(await inHousehold(url, user.householdId)))) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    cache = "private, max-age=300";
  }

  const body = new Uint8Array(image.data);
  return new NextResponse(body, {
    headers: {
      "Content-Type": image.contentType,
      "Cache-Control": cache,
      "Content-Length": String(body.byteLength),
    },
  });
}
