"use client";

import { useState, useEffect } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SearchInput } from "@/components/shared/SearchInput";
import { PageLoader } from "@/components/shared/PageLoader";
import { Plus, Check, Clock, Users, ArrowLeft, BookOpen } from "lucide-react";
import { cn } from "@/lib/utils";
import Link from "next/link";

interface LibraryRecipe {
  id: number;
  name: string;
  description: string | null;
  servings: number;
  prepTimeMinutes: number | null;
  cookTimeMinutes: number | null;
  category: string | null;
  sourceUrl: string | null;
  ingredients: { ingredient: { name: string }; quantity: number; unit: { abbreviation: string } }[];
}

export default function BrowseLibraryPage() {
  const [recipes, setRecipes] = useState<LibraryRecipe[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [addedIds, setAddedIds] = useState<Set<number>>(new Set());
  const [addingId, setAddingId] = useState<number | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      const params = search ? `?q=${encodeURIComponent(search)}` : "";
      fetch(`/api/library/recipes${params}`)
        .then((r) => r.json())
        .then((data) => {
          setRecipes(data);
          setLoading(false);
        });
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  async function addRecipe(id: number) {
    setAddingId(id);
    const res = await fetch("/api/library/recipes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ libraryRecipeId: id }),
    });
    if (res.ok) {
      setAddedIds((prev) => new Set(prev).add(id));
    }
    setAddingId(null);
  }

  if (loading) return <PageLoader />;

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <div className="space-y-3">
        <Link
          href="/recipes"
          className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "-ml-3 text-muted-foreground")}
        >
          <ArrowLeft className="h-4 w-4" />
          Recipes
        </Link>
        <div className="space-y-1">
          <h1 className="text-4xl leading-tight font-medium">Recipe library</h1>
          <p className="text-muted-foreground">Browse and add recipes to your collection</p>
        </div>
      </div>

      <SearchInput value={search} onChange={setSearch} placeholder="Search library..." />

      {recipes.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-3xl border bg-card px-6 py-14 text-center">
          <div className="flex size-12 items-center justify-center rounded-2xl bg-brand-soft text-primary">
            <BookOpen className="h-6 w-6" />
          </div>
          <p className="font-heading text-xl">
            {search ? "No recipes match your search" : "No recipes in the library yet"}
          </p>
        </div>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {recipes.map((recipe) => {
            const totalTime = (recipe.prepTimeMinutes || 0) + (recipe.cookTimeMinutes || 0);
            const added = addedIds.has(recipe.id);
            return (
              <div key={recipe.id} className="flex flex-col gap-3 rounded-2xl border bg-card p-5">
                <div className="flex items-start justify-between gap-3">
                  <h3 className="text-base leading-snug font-bold">{recipe.name}</h3>
                  <Button
                    size="sm"
                    variant={added ? "secondary" : "default"}
                    className={cn("shrink-0", added && "bg-leaf-soft text-leaf-ink disabled:opacity-100")}
                    onClick={() => !added && addRecipe(recipe.id)}
                    disabled={addingId === recipe.id || added}
                  >
                    {added ? (
                      <><Check className="h-3.5 w-3.5" /> Added</>
                    ) : (
                      <><Plus className="h-3.5 w-3.5" /> Add</>
                    )}
                  </Button>
                </div>
                {recipe.description && (
                  <p className="line-clamp-2 text-sm leading-relaxed text-muted-foreground">{recipe.description}</p>
                )}
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-muted-foreground">
                  {totalTime > 0 && (
                    <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{totalTime}m</span>
                  )}
                  <span className="flex items-center gap-1"><Users className="h-3 w-3" />{recipe.servings}</span>
                  {recipe.category && <Badge variant="secondary" className="px-1.5 py-0 text-[10px]">{recipe.category}</Badge>}
                </div>
                {recipe.ingredients.length > 0 && (
                  <p className="mt-auto border-t pt-3 text-xs leading-relaxed text-muted-foreground">
                    {recipe.ingredients.slice(0, 5).map((i) => i.ingredient.name).join(", ")}
                    {recipe.ingredients.length > 5 && ` +${recipe.ingredients.length - 5} more`}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
