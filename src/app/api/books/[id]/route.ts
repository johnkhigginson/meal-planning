import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireHouseholdId } from "@/lib/auth";
import { slugify } from "@/lib/slug";

type RouteParams = { params: Promise<{ id: string }> };

// Pick a globally-unique slug for a published book, ignoring the book itself.
async function resolveBookSlug(desired: string, bookId: number): Promise<string> {
  const root = slugify(desired) || `cookbook-${bookId}`;
  let candidate = root;
  let n = 2;
  // Slugs are unique across published books so /blog/[slug] is unambiguous.
  while (
    await prisma.recipeBook.findFirst({
      where: { slug: candidate, id: { not: bookId } },
      select: { id: true },
    })
  ) {
    candidate = `${root}-${n++}`;
  }
  return candidate;
}

export async function GET(_request: NextRequest, { params }: RouteParams) {
  const householdId = await requireHouseholdId();
  const { id } = await params;
  const book = await prisma.recipeBook.findFirst({
    where: { id: parseInt(id, 10), householdId },
    include: {
      entries: {
        include: {
          recipe: {
            include: {
              tags: { include: { tag: true } },
              ingredients: { include: { ingredient: true, unit: true } },
            },
          },
        },
        orderBy: { sortOrder: "asc" },
      },
    },
  });
  if (!book) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(book);
}

export async function PUT(request: NextRequest, { params }: RouteParams) {
  const householdId = await requireHouseholdId();
  const { id } = await params;
  const bookId = parseInt(id, 10);
  const body = await request.json();

  const existing = await prisma.recipeBook.findFirst({ where: { id: bookId, householdId } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const data: {
    name?: string;
    description?: string | null;
    coverImageUrl?: string | null;
    isPublished?: boolean;
    publishedAt?: Date | null;
    slug?: string;
  } = {};

  if (body.name !== undefined) data.name = body.name;
  if (body.description !== undefined) data.description = body.description ?? null;
  if (body.coverImageUrl !== undefined) data.coverImageUrl = body.coverImageUrl || null;

  if (body.isPublished !== undefined) {
    data.isPublished = !!body.isPublished;
    if (body.isPublished) {
      // Assign a stable slug on first publish (or honor an explicit override).
      const desired = body.slug || existing.slug || body.name || existing.name;
      data.slug = await resolveBookSlug(desired, bookId);
      if (!existing.publishedAt) data.publishedAt = new Date();
    }
  } else if (body.slug !== undefined && body.slug) {
    data.slug = await resolveBookSlug(body.slug, bookId);
  }

  const book = await prisma.recipeBook.update({ where: { id: bookId }, data });
  return NextResponse.json(book);
}

export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  const householdId = await requireHouseholdId();
  const { id } = await params;
  const bookId = parseInt(id, 10);

  const existing = await prisma.recipeBook.findFirst({ where: { id: bookId, householdId } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.recipeBook.delete({ where: { id: bookId } });
  return NextResponse.json({ success: true });
}
