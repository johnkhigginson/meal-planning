// Blogger (Blogspot) import helpers.
//
// Two ingestion paths are supported so the migration can run regardless of the
// environment's network egress policy:
//   1. The live Blogger JSON feed  (/feeds/posts/default?alt=json) — needs the
//      blog host to be reachable / allowlisted.
//   2. A Blogger "Back up content" XML export (Atom) — fully offline.
//
// Both normalize to the same `BloggerPost` shape.

import * as cheerio from "cheerio";

export interface BloggerPost {
  title: string;
  contentHtml: string;
  permalink: string | null;
  publishedAt: Date | null;
  labels: string[];
  imageUrl: string | null;
}

export interface BloggerImport {
  blogTitle: string;
  posts: BloggerPost[];
}

const BLOGGER_KIND_POST = "http://schemas.google.com/blogger/2008/kind#post";
const BLOGGER_KIND_SCHEME = "http://schemas.google.com/g/2005#kind";
const BLOGGER_LABEL_SCHEME = "http://www.blogger.com/atom/ns#";

// Blogger serves thumbnail-sized image URLs like .../s72-c/photo.jpg.
// Upgrade the size token so migrated posts keep a high-resolution hero image.
// Only rewrite Blogger/Google-hosted images so unrelated URLs that happen to
// contain an "=s###" token aren't corrupted.
export function upgradeBloggerImage(url: string | null | undefined): string | null {
  if (!url) return null;
  if (!/(\.bp\.blogspot\.com|googleusercontent\.com|blogger\.com)/i.test(url)) return url;
  return url.replace(/\/s\d+(-c)?\//, "/s1600/").replace(/=s\d+(-c)?(-[a-z]+)?$/, "=s1600");
}

function firstImageFromHtml(html: string): string | null {
  if (!html) return null;
  const match = html.match(/<img[^>]+src=["']([^"']+)["']/i);
  return match ? match[1] : null;
}

function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

// ─── JSON feed (live) ───────────────────────────────────────────

/* eslint-disable @typescript-eslint/no-explicit-any */
function postFromJsonEntry(entry: any): BloggerPost {
  const title: string = entry.title?.$t ?? "";
  const contentHtml: string = entry.content?.$t ?? entry.summary?.$t ?? "";

  const links: any[] = entry.link ?? [];
  const alternate = links.find((l) => l.rel === "alternate");

  const categories: any[] = entry.category ?? [];
  const labels = categories
    .map((c) => (typeof c.term === "string" ? c.term : ""))
    .filter(Boolean);

  const thumb: string | undefined = entry["media$thumbnail"]?.url;
  const imageUrl =
    upgradeBloggerImage(thumb) ?? upgradeBloggerImage(firstImageFromHtml(contentHtml));

  return {
    title,
    contentHtml,
    permalink: alternate?.href ?? null,
    publishedAt: parseDate(entry.published?.$t),
    labels,
    imageUrl,
  };
}

export function parseBloggerJsonFeed(json: any): { blogTitle: string; posts: BloggerPost[]; total: number } {
  const feed = json?.feed;
  if (!feed) return { blogTitle: "", posts: [], total: 0 };
  const entries: any[] = feed.entry ?? [];
  const total = parseInt(feed["openSearch$totalResults"]?.$t ?? "0", 10) || entries.length;
  return {
    blogTitle: feed.title?.$t ?? "",
    posts: entries.map(postFromJsonEntry),
    total,
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

// Normalize a user-supplied blog reference into a base origin.
export function normalizeBlogUrl(input: string): string {
  let value = input.trim();
  if (!/^https?:\/\//i.test(value)) value = `https://${value}`;
  const url = new URL(value);
  return `${url.protocol}//${url.host}`;
}

type FetchImpl = typeof fetch;

/**
 * Paginate the Blogger JSON feed to pull every published post. The feed caps
 * page size around 150, so we walk `start-index` until exhausted.
 */
export async function fetchAllBloggerPosts(
  blogUrl: string,
  fetchImpl: FetchImpl = fetch
): Promise<BloggerImport> {
  const origin = normalizeBlogUrl(blogUrl);
  const pageSize = 150;
  let startIndex = 1;
  let blogTitle = "";
  let total = Infinity;
  const posts: BloggerPost[] = [];

  // Hard cap on iterations as a safety net against unexpected pagination loops.
  for (let i = 0; i < 500; i++) {
    const feedUrl = `${origin}/feeds/posts/default?alt=json&max-results=${pageSize}&start-index=${startIndex}`;
    const res = await fetchImpl(feedUrl, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) {
      throw new Error(`Blogger feed request failed (${res.status}) for ${origin}`);
    }
    const json = await res.json();
    const { blogTitle: title, posts: page, total: reported } = parseBloggerJsonFeed(json);
    if (title) blogTitle = title;
    if (reported) total = reported;
    // An empty page is the only reliable end signal — Blogger may return fewer
    // than max-results per page, so don't stop on a short (but non-empty) page.
    if (page.length === 0) break;
    posts.push(...page);
    if (posts.length >= total) break;
    // Advance by the number actually returned to avoid skipping entries.
    startIndex += page.length;
  }

  return { blogTitle, posts };
}

// ─── XML export (offline) ───────────────────────────────────────

/**
 * Parse a Blogger "Back up content" Atom XML export. Only entries whose kind is
 * `#post` are returned (pages, comments, and settings entries are skipped).
 */
export function parseBloggerXmlExport(xml: string): BloggerImport {
  const $ = cheerio.load(xml, { xmlMode: true });

  const blogTitle = $("feed > title").first().text().trim();
  const posts: BloggerPost[] = [];

  $("feed > entry").each((_, el) => {
    const entry = $(el);

    // Determine the entry kind from its #kind category.
    let isPost = false;
    let isDraft = false;
    const labels: string[] = [];

    entry.children("category").each((__, cat) => {
      const scheme = $(cat).attr("scheme");
      const term = $(cat).attr("term") ?? "";
      if (scheme === BLOGGER_KIND_SCHEME && term === BLOGGER_KIND_POST) isPost = true;
      if (scheme === BLOGGER_LABEL_SCHEME && term) labels.push(term);
    });

    // Drafts carry an app:draft=yes control flag. In XML mode the tag keeps its
    // namespace prefix (e.g. <app:draft>), which a plain "draft" selector won't
    // match, so detect by local name instead.
    entry.find("*").each((__, node) => {
      const tag = ("tagName" in node ? node.tagName : (node as { name?: string }).name) || "";
      if (tag === "draft" || tag.endsWith(":draft")) {
        if ($(node).text().trim().toLowerCase() === "yes") isDraft = true;
      }
    });

    if (!isPost || isDraft) return;

    const title = entry.children("title").first().text().trim();
    const contentHtml = entry.children("content").first().text();

    let permalink: string | null = null;
    entry.children("link").each((__, l) => {
      if ($(l).attr("rel") === "alternate") permalink = $(l).attr("href") ?? null;
    });

    const publishedAt = parseDate(entry.children("published").first().text());
    const imageUrl = upgradeBloggerImage(firstImageFromHtml(contentHtml));

    posts.push({ title, contentHtml, permalink, publishedAt, labels, imageUrl });
  });

  return { blogTitle, posts };
}

// ─── Content normalization ──────────────────────────────────────

// Collapse post HTML to plain text (used for descriptions/excerpts).
export function htmlToText(html: string): string {
  if (!html) return "";
  const $ = cheerio.load(`<div>${html}</div>`);
  return $("div")
    .first()
    .text()
    .replace(/\s+/g, " ")
    .trim();
}

export function excerpt(text: string, max = 280): string {
  if (text.length <= max) return text;
  return text.slice(0, max).replace(/\s+\S*$/, "") + "…";
}

// Best-effort split of a recipe post body into ingredient lines and instruction
// text by looking for the conventional "Ingredients" / "Directions" headings.
// This is intentionally conservative — the full HTML is always preserved on the
// recipe regardless, so a miss here never loses content.
export function extractRecipeSections(html: string): {
  ingredients: string[];
  instructions: string;
} {
  const $ = cheerio.load(`<div id="__root">${html}</div>`);
  const root = $("#__root");

  // Pull list items as candidate ingredients.
  const listItems = root
    .find("li")
    .map((_, li) => $(li).text().replace(/\s+/g, " ").trim())
    .get()
    .filter(Boolean);

  const text = root.text();
  const dirMatch = text.match(/(?:directions|instructions|method|preparation)\s*:?\s*([\s\S]+)/i);
  const instructions = dirMatch ? dirMatch[1].replace(/\s+\n/g, "\n").trim() : "";

  return {
    ingredients: listItems,
    instructions,
  };
}
