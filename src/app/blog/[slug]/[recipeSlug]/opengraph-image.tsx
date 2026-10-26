import { ImageResponse } from "next/og";
import sharp from "sharp";
import { prisma } from "@/lib/prisma";
import { getPublishedRecipe } from "@/lib/blog";
import { safeFetch } from "@/lib/ssrf";
import { OG_COLORS, OG_SIZE, OgBrand, OgLemonMark } from "@/lib/og";
import { decodeEntities } from "@/lib/text-clean";

export const alt = "Recipe from My Lemon Kitchen";
export const size = OG_SIZE;
export const contentType = "image/png";
export const dynamic = "force-dynamic";

const PHOTO_WIDTH = 520;
const MAX_BYTES = 10 * 1024 * 1024;

// Load the recipe photo and re-encode it as a JPEG data URI. Satori can't
// decode webp (how uploads are stored), and a data URI avoids a second fetch.
// Only called for recipes in a published book, so the photo is already public.
async function loadPhoto(imageUrl: string | null): Promise<string | null> {
  if (!imageUrl) return null;
  try {
    let input: Buffer | null = null;
    const stored = imageUrl.match(/^\/api\/images\/(\d+)$/);
    if (stored) {
      const image = await prisma.uploadedImage.findUnique({
        where: { id: parseInt(stored[1], 10) },
        select: { data: true },
      });
      if (image) input = Buffer.from(image.data);
    } else if (/^https?:\/\//i.test(imageUrl)) {
      const res = await safeFetch(imageUrl, { signal: AbortSignal.timeout(8000) });
      const type = res.headers.get("content-type") || "";
      if (res.ok && type.startsWith("image/")) {
        const buf = Buffer.from(await res.arrayBuffer());
        if (buf.byteLength > 0 && buf.byteLength <= MAX_BYTES) input = buf;
      }
    }
    if (!input) return null;
    const jpeg = await sharp(input, { limitInputPixels: 40_000_000 })
      .rotate()
      .resize({ width: PHOTO_WIDTH, height: OG_SIZE.height, fit: "cover" })
      .jpeg({ quality: 80 })
      .toBuffer();
    return `data:image/jpeg;base64,${jpeg.toString("base64")}`;
  } catch {
    return null;
  }
}

export default async function Image({
  params,
}: {
  params: Promise<{ slug: string; recipeSlug: string }>;
}) {
  const { slug, recipeSlug } = await params;
  const data = await getPublishedRecipe(slug, recipeSlug);
  if (!data) return new Response("Not found", { status: 404 });

  const { book, recipe } = data;
  const photo = await loadPhoto(recipe.imageUrl);
  const fullName = decodeEntities(recipe.name);
  const title = fullName.length > 90 ? `${fullName.slice(0, 87).trimEnd()}...` : fullName;
  const titleSize = title.length > 50 ? 56 : title.length > 28 ? 68 : 80;

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", background: OG_COLORS.background }}>
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            padding: "64px 64px 56px",
            borderBottom: `20px solid ${OG_COLORS.brand}`,
          }}
        >
          <div
            style={{
              display: "flex",
              alignSelf: "flex-start",
              padding: "8px 20px",
              borderRadius: 999,
              background: OG_COLORS.brandSoft,
              color: OG_COLORS.gold,
              fontSize: 26,
              fontWeight: 700,
            }}
          >
            {book.name}
          </div>
          <div
            style={{
              display: "flex",
              fontSize: titleSize,
              fontWeight: 700,
              lineHeight: 1.1,
              color: OG_COLORS.ink,
            }}
          >
            {title}
          </div>
          <OgBrand />
        </div>
        {photo ? (
          <img src={photo} alt="" width={PHOTO_WIDTH} height={OG_SIZE.height} style={{ objectFit: "cover" }} />
        ) : (
          <div
            style={{
              width: PHOTO_WIDTH,
              height: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: OG_COLORS.brand,
            }}
          >
            <OgLemonMark size={320} />
          </div>
        )}
      </div>
    ),
    { ...size }
  );
}
