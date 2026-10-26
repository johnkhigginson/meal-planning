import type { MetadataRoute } from "next";
import { getPublishedBooks, getPublishedBookBySlug } from "@/lib/blog";
import { getSiteUrl } from "@/lib/site";
import { bookUrl, recipeUrl } from "@/lib/seo";

// Queries the DB, which isn't reachable at build time.
export const dynamic = "force-dynamic";

function latest(...dates: (Date | null | undefined)[]): Date | undefined {
  const times = dates.filter((d): d is Date => !!d).map((d) => d.getTime());
  return times.length ? new Date(Math.max(...times)) : undefined;
}

// Only public, indexable pages: the site pages, published cookbooks and the
// recipes in them. Nothing behind sign-in.
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const site = getSiteUrl();
  const books = await getPublishedBooks();

  const entries: MetadataRoute.Sitemap = [
    { url: `${site}/`, changeFrequency: "monthly", priority: 1 },
    { url: `${site}/help`, changeFrequency: "monthly", priority: 0.5 },
    { url: `${site}/contact`, changeFrequency: "yearly", priority: 0.3 },
    { url: `${site}/privacy`, changeFrequency: "yearly", priority: 0.3 },
    { url: `${site}/terms`, changeFrequency: "yearly", priority: 0.3 },
  ];
  // /blog redirects to the cookbook when only one is published, and a
  // redirect does not belong in a sitemap.
  if (books.length !== 1) {
    entries.splice(1, 0, {
      url: `${site}/blog`,
      lastModified: latest(...books.map((b) => b.updatedAt)),
      changeFrequency: "weekly",
      priority: 0.7,
    });
  }

  for (const book of books) {
    if (!book.slug) continue;
    const full = await getPublishedBookBySlug(book.slug);
    const posts = full?.posts ?? [];
    entries.push({
      url: bookUrl(book),
      lastModified: latest(book.updatedAt, book.publishedAt, ...posts.map((r) => r.updatedAt)),
      changeFrequency: "weekly",
      priority: 0.8,
    });
    for (const recipe of posts) {
      entries.push({
        url: recipeUrl(book, recipe),
        lastModified: latest(recipe.updatedAt, recipe.publishedAt),
        changeFrequency: "monthly",
        priority: 0.6,
      });
    }
  }

  return entries;
}
