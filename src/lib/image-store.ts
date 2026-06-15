import sharp from "sharp";
import { prisma } from "@/lib/prisma";
import { safeFetch } from "@/lib/ssrf";

const MAX_BYTES = 25 * 1024 * 1024;
const MAX_PIXELS = 40_000_000; // ~ guards against decompression bombs

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

// Resize/normalize an image buffer to webp and store it; returns the new id.
export async function storeImageBuffer(input: Buffer, uploadedBy?: number | null): Promise<number> {
  const output = await sharp(input, { limitInputPixels: MAX_PIXELS })
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

// For Blogger / Google-hosted images, the failure is often a broken or oversized
// size token. Produce an alternate URL with a sane size so we can retry. Handles
// both the path form (…/s1600/… , …/w640-h480/…) and the appended form (…=s1600).
function googleSizeVariant(url: string): string | null {
  let host: string;
  try {
    host = new URL(url).hostname;
  } catch {
    return null;
  }
  if (!/(\.bp\.blogspot\.com|googleusercontent\.com)$/i.test(host)) return null;
  const variant = url
    .replace(/\/(s\d+|w\d+-h\d+)(-[a-z]+)?\//i, "/s1600/")
    .replace(/=(s\d+|w\d+-h\d+)(-[a-z]+)?/i, "=s1600");
  return variant !== url ? variant : null;
}

// Look up the closest Wayback Machine snapshot of a URL and return a link to the
// raw, unmodified original capture (the `id_` modifier), or null if none.
async function resolveWaybackImage(url: string): Promise<string | null> {
  try {
    const api = `https://archive.org/wayback/available?url=${encodeURIComponent(url)}`;
    const res = await safeFetch(api, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(10000) });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      archived_snapshots?: { closest?: { available?: boolean; url?: string } };
    };
    const snap = data.archived_snapshots?.closest;
    if (!snap?.available || !snap.url) return null;
    // .../web/<timestamp>/<original> → .../web/<timestamp>id_/<original>
    return snap.url.replace(/\/web\/(\d+)\//, "/web/$1id_/");
  } catch {
    return null;
  }
}

// Fetch + validate a single image URL into a buffer (SSRF-guarded).
async function fetchImageBuffer(url: string): Promise<{ buf: Buffer } | { error: string }> {
  try {
    const res = await safeFetch(url, {
      headers: { "User-Agent": UA },
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) return { error: `HTTP ${res.status}` };
    const type = res.headers.get("content-type") || "";
    if (!type.startsWith("image/")) return { error: `not an image (${type || "unknown type"})` };
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.byteLength === 0) return { error: "empty response" };
    if (buf.byteLength > MAX_BYTES) return { error: "image too large" };
    return { buf };
  } catch (e) {
    return { error: e instanceof Error ? e.message.slice(0, 120) : "fetch failed" };
  }
}

// Fetch one URL and, on success, store it locally — catching sharp decode errors.
async function fetchValidateStore(
  url: string,
  uploadedBy?: number | null
): Promise<{ url: string } | { error: string }> {
  const r = await fetchImageBuffer(url);
  if ("error" in r) return r;
  try {
    const id = await storeImageBuffer(r.buf, uploadedBy);
    return { url: `/api/images/${id}` };
  } catch (e) {
    return { error: e instanceof Error ? `decode failed: ${e.message.slice(0, 80)}` : "decode failed" };
  }
}

// Download a remote image and store it locally; returns the new /api/images URL,
// or an error reason the caller can surface/record. Tries the source URL, then a
// normalized Google/Blogger size variant, then the Wayback Machine (the
// originals are often archived even when the live link is dead).
export async function fetchAndStoreImage(
  url: string,
  uploadedBy?: number | null
): Promise<{ url: string } | { error: string }> {
  const candidates = [url];
  const variant = googleSizeVariant(url);
  if (variant) candidates.push(variant);

  let lastError = "fetch failed";
  for (const candidate of candidates) {
    const result = await fetchValidateStore(candidate, uploadedBy);
    if ("url" in result) return result;
    lastError = result.error;
  }

  // Fallback: the Internet Archive's Wayback Machine.
  const archived = await resolveWaybackImage(url);
  if (archived) {
    const result = await fetchValidateStore(archived, uploadedBy);
    if ("url" in result) return result;
    lastError = `wayback: ${result.error}`;
  } else {
    lastError = `${lastError}; no wayback snapshot`;
  }

  return { error: lastError };
}
