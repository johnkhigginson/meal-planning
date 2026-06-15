import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { fetchAndStoreImage } from "@/lib/image-store";

export const runtime = "nodejs";
export const maxDuration = 300;

const DEFAULT_BATCH = 5;

// Batched pass that downloads externally-hosted recipe photos (e.g. Blogger /
// Google URLs) into the DB so the blog no longer depends on them. Idempotent:
// only recipes whose imageUrl is still external are processed. The client loops
// until `remaining` is 0.
export async function POST(request: NextRequest) {
  let admin;
  try {
    admin = await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const limit = Math.min(Math.max(parseInt(String(body.limit ?? DEFAULT_BATCH), 10) || DEFAULT_BATCH, 1), 15);

  let householdId = admin.householdId;
  if (typeof body.ownerUserId === "number" && body.ownerUserId !== admin.userId) {
    const owner = await prisma.user.findUnique({ where: { id: body.ownerUserId }, select: { householdId: true } });
    if (!owner) return NextResponse.json({ error: "Selected owner not found." }, { status: 400 });
    householdId = owner.householdId;
  }

  // External = has an imageUrl that isn't one of our /api/images paths.
  const where = {
    householdId,
    sourceType: "BLOG",
    imageUrl: { startsWith: "http" },
    NOT: { imageUrl: { startsWith: "/api/images/" } },
  } as const;

  const batch = await prisma.recipe.findMany({
    where,
    select: { id: true, imageUrl: true },
    orderBy: { id: "asc" },
    take: limit,
  });

  let converted = 0;
  const errors: string[] = [];

  for (const recipe of batch) {
    if (!recipe.imageUrl) continue;
    const localUrl = await fetchAndStoreImage(recipe.imageUrl, admin.userId);
    if (localUrl) {
      await prisma.recipe.update({ where: { id: recipe.id }, data: { imageUrl: localUrl } });
      converted++;
    } else {
      errors.push(`recipe ${recipe.id}: could not fetch image`);
    }
  }

  const remaining = await prisma.recipe.count({ where });

  return NextResponse.json({ processed: converted, converted, remaining, done: remaining === 0, errors: errors.slice(0, 10) });
}
