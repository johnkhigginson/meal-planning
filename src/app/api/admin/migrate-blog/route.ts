import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import {
  fetchAllBloggerPosts,
  parseBloggerXmlExport,
  htmlToText,
  excerpt,
  extractRecipeSections,
  type BloggerImport,
} from "@/lib/blogger";
import { uniqueSlug } from "@/lib/slug";
import { sanitizeBlogHtml } from "@/lib/sanitize";

export const runtime = "nodejs";
// A full blog can have hundreds of posts; give the import room to run.
export const maxDuration = 300;

interface MigrateInput {
  blogUrl?: string;
  xml?: string;
  bookName?: string;
  ownerUserId?: number;
  updateExisting?: boolean; // refresh already-imported posts (default true)
}

async function readInput(request: NextRequest): Promise<MigrateInput> {
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("multipart/form-data")) {
    const form = await request.formData();
    const file = form.get("file") as File | null;
    const xml = file ? await file.text() : (form.get("xml") as string | null) ?? undefined;
    const ownerRaw = form.get("ownerUserId") as string | null;
    const updateRaw = form.get("updateExisting") as string | null;
    return {
      blogUrl: (form.get("blogUrl") as string | null) ?? undefined,
      xml: xml ?? undefined,
      bookName: (form.get("bookName") as string | null) ?? undefined,
      ownerUserId: ownerRaw ? parseInt(ownerRaw, 10) : undefined,
      updateExisting: updateRaw == null ? undefined : updateRaw === "true",
    };
  }
  return (await request.json()) as MigrateInput;
}

// Build the recipe description, leading with the original "Posted by" credit
// from Blogger when present so authorship is preserved for future reference.
function buildDescription(author: string | null, plain: string): string | null {
  const attribution = author ? `Posted by ${author}` : null;
  const ex = plain ? excerpt(plain) : null;
  return [attribution, ex].filter(Boolean).join("\n\n") || null;
}

export async function POST(request: NextRequest) {
  let admin;
  try {
    admin = await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  let input: MigrateInput;
  try {
    input = await readInput(request);
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  // Gather posts from whichever source was provided.
  let data: BloggerImport;
  try {
    if (input.xml && input.xml.trim()) {
      data = parseBloggerXmlExport(input.xml);
    } else if (input.blogUrl && input.blogUrl.trim()) {
      data = await fetchAllBloggerPosts(input.blogUrl);
    } else {
      return NextResponse.json(
        { error: "Provide either a blog URL or a Blogger XML export." },
        { status: 400 }
      );
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to read blog content";
    return NextResponse.json({ error: message }, { status: 502 });
  }

  if (data.posts.length === 0) {
    return NextResponse.json({ error: "No posts found in the provided source." }, { status: 404 });
  }

  // Resolve the OWNER of the imported content. The cookbook and recipes are
  // created in the owner's household (households are the ownership boundary in
  // this app) and credited to the owner via authorId — so an admin can import a
  // blog into, say, Mom's own household and have her truly own it, not just be
  // labeled. Defaults to the importing admin's own account.
  let householdId = admin.householdId;
  let authorId = admin.userId;
  if (input.ownerUserId != null && input.ownerUserId !== admin.userId) {
    const owner = await prisma.user.findUnique({
      where: { id: input.ownerUserId },
      select: { id: true, householdId: true },
    });
    if (!owner) {
      return NextResponse.json({ error: "Selected owner not found." }, { status: 400 });
    }
    householdId = owner.householdId;
    authorId = owner.id;
  }

  const bookName = (input.bookName || data.blogTitle || "The Recipe Society").trim();

  // Find-or-create the destination cookbook for this household.
  let book = await prisma.recipeBook.findFirst({ where: { householdId, name: bookName } });
  if (!book) {
    book = await prisma.recipeBook.create({
      data: { householdId, name: bookName, description: data.blogTitle ? `Imported from ${data.blogTitle}` : null },
    });
  }
  const bookId = book.id;

  // A stable identity for a post so re-runs are idempotent. Prefer the
  // permalink; fall back to title+date for exports that omit the alternate link.
  const postKey = (name: string, permalink: string | null, published: Date | null) =>
    permalink || `${name}|${published?.toISOString() ?? ""}`;

  const updateExisting = input.updateExisting !== false; // default: refresh existing

  // Map existing recipes by their post identity so re-runs can update in place.
  const existingRecipes = await prisma.recipe.findMany({
    where: { householdId },
    select: { id: true, name: true, slug: true, sourceUrl: true, publishedAt: true },
  });
  const existingByKey = new Map<string, number>();
  for (const r of existingRecipes) {
    existingByKey.set(postKey(r.name, r.sourceUrl, r.publishedAt), r.id);
  }
  const takenSlugs = new Set(
    existingRecipes.map((r) => r.slug).filter((s): s is string => !!s)
  );

  const existingEntries = await prisma.recipeBookEntry.findMany({
    where: { recipeBookId: book.id },
    select: { recipeId: true },
  });
  const entryRecipeIds = new Set(existingEntries.map((e) => e.recipeId));
  let sortOrder = existingEntries.length;

  // Cache tag ids so repeated labels don't re-query.
  const tagCache = new Map<string, number>();
  async function getTagId(name: string): Promise<number> {
    const key = name.trim();
    if (tagCache.has(key)) return tagCache.get(key)!;
    const tag = await prisma.tag.upsert({
      where: { name: key },
      update: {},
      create: { name: key },
    });
    tagCache.set(key, tag.id);
    return tag.id;
  }

  let imported = 0;
  let updated = 0;
  let skipped = 0;
  const errors: string[] = [];

  async function applyTagsAndBook(recipeId: number, labels: string[]) {
    for (const label of labels) {
      const tagId = await getTagId(label);
      await prisma.recipeTag.upsert({
        where: { recipeId_tagId: { recipeId, tagId } },
        update: {},
        create: { recipeId, tagId },
      });
    }
    if (!entryRecipeIds.has(recipeId)) {
      await prisma.recipeBookEntry.create({
        data: { recipeBookId: bookId, recipeId, sortOrder: sortOrder++ },
      });
      entryRecipeIds.add(recipeId);
    }
  }

  // Import oldest-first so blog ordering (newest first) falls out naturally
  // from the publish dates while sortOrder stays stable.
  const ordered = [...data.posts].sort((a, b) => {
    const at = a.publishedAt?.getTime() ?? 0;
    const bt = b.publishedAt?.getTime() ?? 0;
    return at - bt;
  });

  for (const post of ordered) {
    const name = (post.title || "Untitled Recipe").slice(0, 300);
    const key = postKey(name, post.permalink, post.publishedAt);
    const existingId = existingByKey.get(key);

    try {
      const safeHtml = sanitizeBlogHtml(post.contentHtml);
      const plain = htmlToText(post.contentHtml);
      const description = buildDescription(post.author, plain);

      if (existingId != null) {
        if (!updateExisting) {
          skipped++;
          continue;
        }
        // Refresh import-derived fields only; leave name/slug/author/ingredients
        // (ingredients are managed by the AI extraction pass).
        await prisma.recipe.update({
          where: { id: existingId },
          data: {
            description,
            bodyHtml: safeHtml || undefined,
            imageUrl: post.imageUrl ?? undefined,
            publishedAt: post.publishedAt ?? undefined,
          },
        });
        await applyTagsAndBook(existingId, post.labels);
        updated++;
        continue;
      }

      const slug = uniqueSlug(name, takenSlugs, `recipe-${imported + 1}`);
      const sections = extractRecipeSections(post.contentHtml);
      // `instructions` is non-nullable; fall back to the full post text. The AI
      // pass refines this later.
      const instructions = sections.instructions || plain || "See original post for details.";

      const recipe = await prisma.recipe.create({
        data: {
          householdId,
          authorId,
          name,
          slug,
          description,
          instructions,
          bodyHtml: safeHtml || null,
          servings: 4,
          sourceType: "BLOG",
          sourceUrl: post.permalink ?? null,
          imageUrl: post.imageUrl ?? null,
          publishedAt: post.publishedAt ?? null,
        },
      });
      existingByKey.set(key, recipe.id);
      await applyTagsAndBook(recipe.id, post.labels);
      imported++;
    } catch (err) {
      errors.push(`${post.title}: ${err instanceof Error ? err.message : "import failed"}`);
    }
  }

  return NextResponse.json({
    blogTitle: data.blogTitle,
    bookId: book.id,
    bookName: book.name,
    totalPosts: data.posts.length,
    imported,
    updated,
    skipped,
    errors: errors.slice(0, 20),
  });
}
