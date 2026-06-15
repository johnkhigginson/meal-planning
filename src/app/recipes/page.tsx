"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { SearchInput } from "@/components/shared/SearchInput";
import { RecipeCard } from "@/components/recipes/RecipeCard";
import { RecipeFilters } from "@/components/recipes/RecipeFilters";
import { Plus, Upload, Loader2 } from "lucide-react";
import { PageLoader } from "@/components/shared/PageLoader";

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
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Recipes</h1>
          <p className="text-sm text-muted-foreground">Your recipe collection</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/recipes/library">
            <Button variant="outline" size="sm">Browse Library</Button>
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
            <Button variant="outline" size="sm" disabled={importingDoc} onClick={(e) => { (e.currentTarget.parentElement?.querySelector("input") as HTMLInputElement)?.click(); }}>
              {importingDoc ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <Upload className="mr-2 h-3.5 w-3.5" />}
              Import Doc
            </Button>
          </label>
          <Link href="/recipes/new">
            <Button size="sm">
              <Plus className="mr-2 h-4 w-4" />
              Add Recipe
            </Button>
          </Link>
        </div>
      </div>

      {importResult && (
        <div className="rounded-xl border border-border/60 bg-card px-4 py-2.5 text-sm shadow-sm">
          {importResult}
          <button className="ml-2 text-xs text-muted-foreground hover:text-foreground" onClick={() => setImportResult(null)}>dismiss</button>
        </div>
      )}

      <div className="space-y-3">
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
        <div className="py-12 text-center">
          <p className="text-lg text-muted-foreground">No recipes found</p>
          <p className="text-sm text-muted-foreground">
            Try adjusting your filters or{" "}
            <Link href="/recipes/new" className="text-primary underline">
              add a new recipe
            </Link>
          </p>
        </div>
      ) : (
        <>
          <p className="text-xs text-muted-foreground">
            Showing {recipes.length} of {total} recipe{total === 1 ? "" : "s"}
          </p>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {recipes.map((recipe) => (
              <RecipeCard key={recipe.id} recipe={recipe} />
            ))}
          </div>
          {recipes.length < total && (
            <div className="flex justify-center pt-2">
              <Button variant="outline" onClick={loadMore} disabled={loadingMore}>
                {loadingMore ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Load more
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
