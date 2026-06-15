import { NextResponse } from "next/server";
import { getPublishedBookBySlug } from "@/lib/blog";
import { getSiteUrl } from "@/lib/site";

export const dynamic = "force-dynamic";

type RouteParams = { params: Promise<{ slug: string }> };

function xml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// RSS 2.0 feed for a published cookbook so readers can follow new recipes.
export async function GET(_request: Request, { params }: RouteParams) {
  const { slug } = await params;
  const book = await getPublishedBookBySlug(slug);
  if (!book) return new NextResponse("Not found", { status: 404 });

  const site = getSiteUrl();
  const feedUrl = `${site}/blog/${slug}`;

  const items = book.posts
    .map((r) => {
      const link = `${feedUrl}/${r.slug ?? r.id}`;
      const date = (r.publishedAt ?? new Date()).toUTCString();
      const desc = r.description ?? "";
      return `    <item>
      <title>${xml(r.name)}</title>
      <link>${xml(link)}</link>
      <guid isPermaLink="true">${xml(link)}</guid>
      <pubDate>${date}</pubDate>
      <description>${xml(desc)}</description>
    </item>`;
    })
    .join("\n");

  const rss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>${xml(book.name)}</title>
    <link>${xml(feedUrl)}</link>
    <description>${xml(book.description ?? `Recipes from ${book.name}`)}</description>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
${items}
  </channel>
</rss>`;

  return new NextResponse(rss, {
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
