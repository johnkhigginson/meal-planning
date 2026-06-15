import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

type RouteParams = { params: Promise<{ id: string }> };

// Public image serving — recipe photos appear on the public blog, so no auth.
// Content is immutable per id, so it can be cached aggressively.
export async function GET(_request: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  const imageId = parseInt(id, 10);
  if (!imageId) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const image = await prisma.uploadedImage.findUnique({
    where: { id: imageId },
    select: { data: true, contentType: true },
  });
  if (!image) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = new Uint8Array(image.data);
  return new NextResponse(body, {
    headers: {
      "Content-Type": image.contentType,
      "Cache-Control": "public, max-age=31536000, immutable",
      "Content-Length": String(body.byteLength),
    },
  });
}
