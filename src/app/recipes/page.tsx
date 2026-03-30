"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { SearchInput } from "@/components/shared/SearchInput";
import { RecipeCard } from "@/components/recipes/RecipeCard";
import { RecipeFilters } from "@/components/recipes/RecipeFilters";
import { Plus } from "lucide-react";
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
  isFavorite: boolean;
  tags: { tag: Tag }[];
}

export default function RecipesPage() {
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [search, setSearch] = useState("");
  const [sourceType, setSourceType] = useState("ALL");
  const [selectedTagIds, setSelectedTagIds] = useState<number[]>([]);
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchRecipes = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (search) params.set("q", search);
    if (sourceType !== "ALL") params.set("sourceType", sourceType);
    if (selectedTagIds.length > 0) params.set("tagIds", selectedTagIds.join(","));
    if (favoritesOnly) params.set("favorites", "true");

    const res = await fetch(`/api/recipes?${params}`);
    if (res.ok) {
      const data = await res.json();
      setRecipes(data.recipes);
    }
    setLoading(false);
  }, [search, sourceType, selectedTagIds, favoritesOnly]);

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
        <Link href="/recipes/new">
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            Add Recipe
          </Button>
        </Link>
      </div>

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
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {recipes.map((recipe) => (
            <RecipeCard key={recipe.id} recipe={recipe} />
          ))}
        </div>
      )}
    </div>
  );
}
