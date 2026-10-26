import type { MetadataRoute } from "next";
import { getPublishedBooks, getPublishedBookBySlug } from "@/lib/blog";
import { getSiteUrl } from "@/lib/site";

// Queries the DB, which isn't reachable at build time.
export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const site = getSiteUrl();
  const entries: MetadataRoute.Sitemap = [
    { url: `${site}/`, changeFrequency: "monthly", priority: 1 },
    { url: `${site}/blog`, changeFrequency: "weekly", priority: 0.7 },
    { url: `${site}/help`, changeFrequency: "monthly", priority: 0.5 },
    { url: `${site}/contact`, changeFrequency: "yearly", priority: 0.3 },
    { url: `${site}/privacy`, changeFrequency: "yearly", priority: 0.3 },
    { url: `${site}/terms`, changeFrequency: "yearly", priority: 0.3 },
  ];

  const books = await getPublishedBooks();
  for (const book of books) {
    if (!book.slug) continue;
    entries.push({
      url: `${site}/blog/${book.slug}`,
      lastModified: book.publishedAt ?? undefined,
      changeFrequency: "weekly",
      priority: 0.8,
    });
    const full = await getPublishedBookBySlug(book.slug);
    for (const recipe of full?.posts ?? []) {
      entries.push({
        url: `${site}/blog/${book.slug}/${recipe.slug ?? recipe.id}`,
        lastModified: recipe.publishedAt ?? undefined,
        changeFrequency: "monthly",
        priority: 0.6,
      });
    }
  }

  return entries;
}
