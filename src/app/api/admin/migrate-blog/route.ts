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

export const runtime = "nodejs";
// A full blog can have hundreds of posts; give the import room to run.
export const maxDuration = 300;

interface MigrateInput {
  blogUrl?: string;
  xml?: string;
  bookName?: string;
}

async function readInput(request: NextRequest): Promise<MigrateInput> {
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("multipart/form-data")) {
    const form = await request.formData();
    const file = form.get("file") as File | null;
    const xml = file ? await file.text() : (form.get("xml") as string | null) ?? undefined;
    return {
      blogUrl: (form.get("blogUrl") as string | null) ?? undefined,
      xml: xml ?? undefined,
      bookName: (form.get("bookName") as string | null) ?? undefined,
    };
  }
  return (await request.json()) as MigrateInput;
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

  const { householdId, userId } = admin;
  const bookName = (input.bookName || data.blogTitle || "The Recipe Society").trim();

  // Find-or-create the destination cookbook for this household.
  let book = await prisma.recipeBook.findFirst({ where: { householdId, name: bookName } });
  if (!book) {
    book = await prisma.recipeBook.create({
      data: { householdId, name: bookName, description: data.blogTitle ? `Imported from ${data.blogTitle}` : null },
    });
  }

  // Build dedupe + slug-collision sets from existing household data.
  const existingRecipes = await prisma.recipe.findMany({
    where: { householdId },
    select: { id: true, slug: true, sourceUrl: true },
  });
  const importedUrls = new Set(
    existingRecipes.map((r) => r.sourceUrl).filter((u): u is string => !!u)
  );
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
  let skipped = 0;
  const errors: string[] = [];

  // Import oldest-first so blog ordering (newest first) falls out naturally
  // from the publish dates while sortOrder stays stable.
  const ordered = [...data.posts].sort((a, b) => {
    const at = a.publishedAt?.getTime() ?? 0;
    const bt = b.publishedAt?.getTime() ?? 0;
    return at - bt;
  });

  for (const post of ordered) {
    if (post.permalink && importedUrls.has(post.permalink)) {
      skipped++;
      continue;
    }

    try {
      const name = (post.title || "Untitled Recipe").slice(0, 300);
      const slug = uniqueSlug(name, takenSlugs, `recipe-${imported + 1}`);
      const plain = htmlToText(post.contentHtml);
      const sections = extractRecipeSections(post.contentHtml);
      // `instructions` is non-nullable; fall back to the full post text so the
      // structured view always has something even before manual cleanup.
      const instructions = sections.instructions || plain || "See original post for details.";

      const recipe = await prisma.recipe.create({
        data: {
          householdId,
          authorId: userId,
          name,
          slug,
          description: plain ? excerpt(plain) : null,
          instructions,
          bodyHtml: post.contentHtml || null,
          servings: 4,
          sourceType: "BLOG",
          sourceUrl: post.permalink ?? null,
          imageUrl: post.imageUrl ?? null,
          publishedAt: post.publishedAt ?? null,
        },
      });

      if (post.permalink) importedUrls.add(post.permalink);

      // Labels → tags.
      for (const label of post.labels) {
        const tagId = await getTagId(label);
        await prisma.recipeTag.upsert({
          where: { recipeId_tagId: { recipeId: recipe.id, tagId } },
          update: {},
          create: { recipeId: recipe.id, tagId },
        });
      }

      if (!entryRecipeIds.has(recipe.id)) {
        await prisma.recipeBookEntry.create({
          data: { recipeBookId: book.id, recipeId: recipe.id, sortOrder: sortOrder++ },
        });
        entryRecipeIds.add(recipe.id);
      }

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
    skipped,
    errors: errors.slice(0, 20),
  });
}
