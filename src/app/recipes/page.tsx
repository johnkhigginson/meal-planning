"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Button, buttonVariants } from "@/components/ui/button";
import { SearchInput } from "@/components/shared/SearchInput";
import { RecipeCard } from "@/components/recipes/RecipeCard";
import { RecipeFilters } from "@/components/recipes/RecipeFilters";
import { Plus, Upload, Loader2, UtensilsCrossed } from "lucide-react";
import { PageLoader } from "@/components/shared/PageLoader";
import { cn } from "@/lib/utils";

interface Tag {
  id: number;
  name: string;
}

interface Recipe {
  id: number;
  name: string;
  description: string | null;
  servings: number;
  prepTimeMinutes: number | null;
  cookTimeMinutes: number | null;
  sourceType: string;
  imageUrl: string | null;
  isFavorite: boolean;
  tags: { tag: Tag }[];
  author?: { id: number; name: string } | null;
  authorName?: string | null;
}

const PAGE_SIZE = 24;

export default function RecipesPage() {
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [total, setTotal] = useState(0);
  const [tags, setTags] = useState<Tag[]>([]);
  const [search, setSearch] = useState("");
  const [importingDoc, setImportingDoc] = useState(false);
  const [importResult, setImportResult] = useState<string | null>(null);
  const [sourceType, setSourceType] = useState("ALL");
  const [selectedTagIds, setSelectedTagIds] = useState<number[]>([]);
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  // Only surface per-recipe authorship when the household is actually shared.
  const [multiMember, setMultiMember] = useState(false);

  const buildParams = useCallback(
    (page: number) => {
      const params = new URLSearchParams();
      if (search) params.set("q", search);
      if (sourceType !== "ALL") params.set("sourceType", sourceType);
      if (selectedTagIds.length > 0) params.set("tagIds", selectedTagIds.join(","));
      if (favoritesOnly) params.set("favorites", "true");
      params.set("page", String(page));
      params.set("limit", String(PAGE_SIZE));
      return params;
    },
    [search, sourceType, selectedTagIds, favoritesOnly]
  );

  const fetchRecipes = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/recipes?${buildParams(1)}`);
    if (res.ok) {
      const data = await res.json();
      setRecipes(data.recipes);
      setTotal(data.total ?? data.recipes.length);
    }
    setLoading(false);
  }, [buildParams]);

  async function loadMore() {
    setLoadingMore(true);
    const nextPage = Math.floor(recipes.length / PAGE_SIZE) + 1;
    const res = await fetch(`/api/recipes?${buildParams(nextPage)}`);
    if (res.ok) {
      const data = await res.json();
      setRecipes((prev) => [...prev, ...data.recipes]);
      if (typeof data.total === "number") setTotal(data.total);
    }
    setLoadingMore(false);
  }

  useEffect(() => {
    fetch("/api/tags").then((r) => r.json()).then(setTags);
    fetch("/api/household/members")
      .then((r) => (r.ok ? r.json() : []))
      .then((m) => setMultiMember(Array.isArray(m) && m.length > 1))
      .catch(() => {});
  }, []);

  useEffect(() => {
    const timer = setTimeout(fetchRecipes, 300);
    return () => clearTimeout(timer);
  }, [fetchRecipes]);

  function toggleTag(tagId: number) {
    setSelectedTagIds((prev) =>
      prev.includes(tagId) ? prev.filter((id) => id !== tagId) : [...prev, tagId]
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-4xl leading-tight font-medium">Recipes</h1>
          <p className="text-muted-foreground">Your recipe collection</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/recipes/library" className={buttonVariants({ variant: "outline", size: "lg" })}>
            Browse library
          </Link>
          <label>
            <input
              type="file"
              accept=".txt,.md,.docx,.pdf,text/*"
              className="hidden"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                setImportingDoc(true);
                setImportResult(null);
                const formData = new FormData();
                formData.append("document", file);
                const res = await fetch("/api/recipes/import-doc", { method: "POST", body: formData });
                if (res.ok) {
                  const data = await res.json();
                  setImportResult(`Imported ${data.imported} recipe${data.imported !== 1 ? "s" : ""}`);
                  fetchRecipes();
                } else {
                  setImportResult("Import failed");
                }
                setImportingDoc(false);
                e.target.value = "";
              }}
            />
            <Button variant="outline" size="lg" disabled={importingDoc} onClick={(e) => { (e.currentTarget.parentElement?.querySelector("input") as HTMLInputElement)?.click(); }}>
              {importingDoc ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              Import doc
            </Button>
          </label>
          <Link href="/recipes/new" className={buttonVariants({ size: "lg" })}>
            <Plus className="h-4 w-4" strokeWidth={2.5} />
            Add recipe
          </Link>
        </div>
      </div>

      {importResult && (
        <div role="status" className="flex items-center justify-between gap-3 rounded-2xl border bg-card px-4 py-3 text-sm font-semibold">
          {importResult}
          <button
            type="button"
            className="rounded-full px-2 py-1 text-xs font-bold text-muted-foreground transition-colors duration-200 ease-out hover:bg-muted hover:text-foreground focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring"
            onClick={() => setImportResult(null)}
          >
            Dismiss
          </button>
        </div>
      )}

      <div className="space-y-4">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search recipes..."
        />
        <RecipeFilters
          sourceType={sourceType}
          onSourceTypeChange={setSourceType}
          selectedTagIds={selectedTagIds}
          onTagToggle={toggleTag}
          tags={tags}
          favoritesOnly={favoritesOnly}
          onFavoritesChange={setFavoritesOnly}
        />
      </div>

      {loading ? (
        <PageLoader />
      ) : recipes.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-3xl border bg-card px-6 py-14 text-center">
          <div className="flex size-12 items-center justify-center rounded-2xl bg-brand-soft text-primary">
            <UtensilsCrossed className="h-6 w-6" />
          </div>
          <p className="font-heading text-xl">No recipes found</p>
          <p className="text-sm text-muted-foreground">Try adjusting your filters or add a new recipe.</p>
          <Link href="/recipes/new" className={cn(buttonVariants(), "mt-1")}>
            <Plus className="h-4 w-4" strokeWidth={2.5} />
            Add recipe
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Showing <span className="font-bold text-foreground tabular-nums">{recipes.length}</span> of{" "}
            <span className="font-bold text-foreground tabular-nums">{total}</span> recipe{total === 1 ? "" : "s"}
          </p>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {recipes.map((recipe) => (
              <RecipeCard key={recipe.id} recipe={recipe} showAuthor={multiMember} />
            ))}
          </div>
          {recipes.length < total && (
            <div className="flex justify-center pt-4">
              <Button variant="outline" size="lg" onClick={loadMore} disabled={loadingMore}>
                {loadingMore ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Load more
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
