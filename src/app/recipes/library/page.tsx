"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SearchInput } from "@/components/shared/SearchInput";
import { PageLoader } from "@/components/shared/PageLoader";
import { Plus, Check, Clock, Users, ArrowLeft } from "lucide-react";
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
  const router = useRouter();
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
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Link href="/recipes">
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </Link>
            <h1 className="text-2xl font-bold">Recipe Library</h1>
          </div>
          <p className="ml-10 text-sm text-muted-foreground">Browse and add recipes to your collection</p>
        </div>
      </div>

      <SearchInput value={search} onChange={setSearch} placeholder="Search library..." />

      {recipes.length === 0 ? (
        <div className="py-12 text-center text-muted-foreground">
          {search ? "No recipes match your search" : "No recipes in the library yet"}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {recipes.map((recipe) => {
            const totalTime = (recipe.prepTimeMinutes || 0) + (recipe.cookTimeMinutes || 0);
            const added = addedIds.has(recipe.id);
            return (
              <Card key={recipe.id} className="group">
                <CardContent className="space-y-3 p-5">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="text-sm font-semibold leading-snug">{recipe.name}</h3>
                    <Button
                      size="sm"
                      variant={added ? "secondary" : "default"}
                      className="shrink-0"
                      onClick={() => !added && addRecipe(recipe.id)}
                      disabled={addingId === recipe.id || added}
                    >
                      {added ? (
                        <><Check className="mr-1 h-3 w-3" /> Added</>
                      ) : (
                        <><Plus className="mr-1 h-3 w-3" /> Add</>
                      )}
                    </Button>
                  </div>
                  {recipe.description && (
                    <p className="line-clamp-2 text-xs text-muted-foreground">{recipe.description}</p>
                  )}
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    {totalTime > 0 && (
                      <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{totalTime}m</span>
                    )}
                    <span className="flex items-center gap-1"><Users className="h-3 w-3" />{recipe.servings}</span>
                    {recipe.category && <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{recipe.category}</Badge>}
                  </div>
                  {recipe.ingredients.length > 0 && (
                    <p className="text-[11px] text-muted-foreground/60">
                      {recipe.ingredients.slice(0, 5).map((i) => i.ingredient.name).join(", ")}
                      {recipe.ingredients.length > 5 && ` +${recipe.ingredients.length - 5} more`}
                    </p>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
