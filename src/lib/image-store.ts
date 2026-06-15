import sharp from "sharp";
import { prisma } from "@/lib/prisma";

const MAX_BYTES = 25 * 1024 * 1024;

// Resize/normalize an image buffer to webp and store it; returns the new id.
export async function storeImageBuffer(input: Buffer, uploadedBy?: number | null): Promise<number> {
  const output = await sharp(input)
    .rotate()
    .resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true })
    .webp({ quality: 82 })
    .toBuffer();
  const image = await prisma.uploadedImage.create({
    data: { data: Uint8Array.from(output), contentType: "image/webp", uploadedBy: uploadedBy ?? null },
    select: { id: true },
  });
  return image.id;
}

// Download a remote image and store it locally; returns the /api/images URL, or
// null if the fetch/processing fails (caller keeps the original URL).
export async function fetchAndStoreImage(url: string, uploadedBy?: number | null): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) return null;
    const type = res.headers.get("content-type") || "";
    if (!type.startsWith("image/")) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.byteLength === 0 || buf.byteLength > MAX_BYTES) return null;
    const id = await storeImageBuffer(buf, uploadedBy);
    return `/api/images/${id}`;
  } catch {
    return null;
  }
}
