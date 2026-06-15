"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Clock, Users, Search } from "lucide-react";
import { trackEvent } from "@/lib/analytics";

// How many recipes to reveal per "Load more" click on the public blog.
const PER_PAGE = 12;

export interface BrowserPost {
  id: number;
  name: string;
  slug: string | null;
  description: string | null;
  imageUrl: string | null;
  prepTimeMinutes: number | null;
  cookTimeMinutes: number | null;
  servings: number;
  publishedAt: string | null;
  authorName: string | null;
  tags: string[];
}

function formatDate(iso: string | null) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}

export function CookbookBrowser({ bookSlug, posts }: { bookSlug: string; posts: BrowserPost[] }) {
  const [query, setQuery] = useState("");
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [sort, setSort] = useState<"new" | "az">("new");
  const [visible, setVisible] = useState(PER_PAGE);

  // Category counts across all posts.
  const categories = useMemo(() => {
    const counts = new Map<string, number>();
    for (const p of posts) for (const t of p.tags) counts.set(t, (counts.get(t) ?? 0) + 1);
    return Array.from(counts.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  }, [posts]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = posts.filter((p) => {
      const matchesQuery =
        !q || p.name.toLowerCase().includes(q) || (p.description ?? "").toLowerCase().includes(q);
      const matchesTag = !activeTag || p.tags.includes(activeTag);
      return matchesQuery && matchesTag;
    });
    list.sort((a, b) =>
      sort === "az"
        ? a.name.localeCompare(b.name)
        : (b.publishedAt ?? "").localeCompare(a.publishedAt ?? "")
    );
    return list;
  }, [posts, query, activeTag, sort]);

  // Collapse back to the first page whenever the result set changes, so a new
  // search/filter doesn't keep a stale "load more" depth. Adjusting state during
  // render (rather than in an effect) avoids a flash of the old page length.
  const filterKey = `${query}|${activeTag ?? ""}|${sort}`;
  const [prevKey, setPrevKey] = useState(filterKey);
  if (filterKey !== prevKey) {
    setPrevKey(filterKey);
    setVisible(PER_PAGE);
  }

  const shown = filtered.slice(0, visible);

  return (
    <div className="flex flex-col gap-6 lg:flex-row-reverse lg:gap-8">
      {/* Right sidebar: search + categories + sort */}
      <aside className="space-y-5 lg:w-56 lg:shrink-0">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search recipes…"
            className="pl-9"
          />
        </div>

        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Categories</p>
          <div className="flex flex-wrap gap-1.5 lg:flex-col lg:items-start">
            <button
              onClick={() => setActiveTag(null)}
              className={`rounded-full px-2.5 py-1 text-sm transition-colors ${
                activeTag === null ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
              }`}
            >
              All ({posts.length})
            </button>
            {categories.map((c) => (
              <button
                key={c.name}
                onClick={() => { setActiveTag(c.name); trackEvent("blog_category_filter", { category: c.name }); }}
                className={`rounded-full px-2.5 py-1 text-sm transition-colors ${
                  activeTag === c.name ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
                }`}
              >
                {c.name} ({c.count})
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Sort</p>
          <div className="flex gap-1.5">
            <button
              onClick={() => setSort("new")}
              className={`rounded-full px-2.5 py-1 text-sm transition-colors ${
                sort === "new" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
              }`}
            >
              Newest
            </button>
            <button
              onClick={() => setSort("az")}
              className={`rounded-full px-2.5 py-1 text-sm transition-colors ${
                sort === "az" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
              }`}
            >
              A–Z
            </button>
          </div>
        </div>
      </aside>

      {/* Recipe list */}
      <div className="min-w-0 flex-1">
        <p className="mb-4 text-sm text-muted-foreground">
          {filtered.length} recipe{filtered.length === 1 ? "" : "s"}
          {activeTag ? ` in “${activeTag}”` : ""}
          {query ? ` matching “${query}”` : ""}
        </p>
        <div className="space-y-5">
          {shown.map((recipe) => {
            const totalTime = (recipe.prepTimeMinutes || 0) + (recipe.cookTimeMinutes || 0);
            const href = `/blog/${bookSlug}/${recipe.slug ?? recipe.id}`;
            return (
              <Link key={recipe.id} href={href} className="block">
                <Card className="group overflow-hidden p-0 transition-all hover:shadow-md">
                  <div className="flex flex-col sm:flex-row">
                    {recipe.imageUrl && (
                      <div className="relative h-48 w-full shrink-0 overflow-hidden bg-muted sm:h-auto sm:w-52">
                        {/* Fills the card panel: fixed height on mobile, stretches to row height on desktop. */}
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={recipe.imageUrl}
                          alt={recipe.name}
                          className="h-full w-full object-cover sm:absolute sm:inset-0"
                        />
                      </div>
                    )}
                    <CardContent className="flex-1 p-5">
                      <h2 className="font-display text-lg font-semibold group-hover:text-primary">{recipe.name}</h2>
                      {recipe.publishedAt && (
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {formatDate(recipe.publishedAt)}
                          {recipe.authorName ? ` · by ${recipe.authorName}` : ""}
                        </p>
                      )}
                      {recipe.description && (
                        <p className="mt-2 line-clamp-3 text-sm text-muted-foreground">{recipe.description}</p>
                      )}
                      <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                        {totalTime > 0 && (
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {totalTime}m
                          </span>
                        )}
                        <span className="flex items-center gap-1">
                          <Users className="h-3 w-3" />
                          {recipe.servings}
                        </span>
                        {recipe.tags.slice(0, 3).map((t) => (
                          <Badge key={t} variant="outline" className="text-[10px]">
                            {t}
                          </Badge>
                        ))}
                      </div>
                    </CardContent>
                  </div>
                </Card>
              </Link>
            );
          })}
          {filtered.length === 0 && (
            <div className="py-12 text-center text-muted-foreground">No recipes match your search.</div>
          )}
        </div>

        {shown.length < filtered.length && (
          <div className="mt-8 flex flex-col items-center gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setVisible((v) => v + PER_PAGE);
                trackEvent("blog_load_more", { shown: shown.length, total: filtered.length });
              }}
            >
              Load more recipes
            </Button>
            <p className="text-xs text-muted-foreground">
              Showing {shown.length} of {filtered.length}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
