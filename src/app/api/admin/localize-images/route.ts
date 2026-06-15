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

  // "Retry failed" clears the given-up marker on previously-failed photos so the
  // normal loop reprocesses them (now with the Wayback Machine fallback). Done
  // once at the start of a retry run; the loop then drains them as usual.
  if (body.reset === true) {
    const { count } = await prisma.recipe.updateMany({
      where: { householdId, sourceType: "BLOG", imageUrl: { startsWith: "http" }, imageLocalizeFailed: true },
      data: { imageLocalizeFailed: false },
    });
    return NextResponse.json({ reset: count });
  }

  // External = an http(s) imageUrl we haven't already self-hosted or given up on.
  const where = {
    householdId,
    sourceType: "BLOG",
    imageUrl: { startsWith: "http" },
    imageLocalizeFailed: false,
  } as const;

  const batch = await prisma.recipe.findMany({
    where,
    select: { id: true, imageUrl: true },
    orderBy: { id: "asc" },
    take: limit,
  });

  let converted = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const recipe of batch) {
    if (!recipe.imageUrl) continue;
    const result = await fetchAndStoreImage(recipe.imageUrl, admin.userId);
    if ("url" in result) {
      await prisma.recipe.update({ where: { id: recipe.id }, data: { imageUrl: result.url } });
      converted++;
    } else {
      // Couldn't download — keep the original link, mark it so we don't retry
      // forever, and keep processing the rest.
      await prisma.recipe.update({ where: { id: recipe.id }, data: { imageLocalizeFailed: true } });
      failed++;
      errors.push(`recipe ${recipe.id}: ${result.error}`);
    }
  }

  const remaining = await prisma.recipe.count({ where });
  // `processed` counts work done this batch (success or given-up) so the client
  // loop always makes progress and never halts on a run of un-fetchable images.
  return NextResponse.json({
    processed: converted + failed,
    converted,
    failed,
    remaining,
    done: remaining === 0,
    errors: errors.slice(0, 10),
  });
}
