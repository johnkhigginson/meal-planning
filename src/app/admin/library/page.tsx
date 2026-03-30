"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Plus, Trash2, Loader2, UtensilsCrossed, Store } from "lucide-react";
import { PageLoader } from "@/components/shared/PageLoader";

interface LibraryRecipe {
  id: number;
  name: string;
  description: string | null;
  servings: number;
  prepTimeMinutes: number | null;
  cookTimeMinutes: number | null;
  category: string | null;
  sourceUrl: string | null;
  createdAt: string;
}

interface LibraryStore {
  id: number;
  name: string;
}

export default function LibraryPage() {
  const [recipes, setRecipes] = useState<LibraryRecipe[]>([]);
  const [stores, setStores] = useState<LibraryStore[]>([]);
  const [loading, setLoading] = useState(true);

  // Add recipe dialog
  const [recipeDialogOpen, setRecipeDialogOpen] = useState(false);
  const [recipeSaving, setRecipeSaving] = useState(false);
  const [recipeName, setRecipeName] = useState("");
  const [recipeDesc, setRecipeDesc] = useState("");
  const [recipeInstructions, setRecipeInstructions] = useState("");
  const [recipeServings, setRecipeServings] = useState(4);
  const [recipeCategory, setRecipeCategory] = useState("");
  const [recipeUrl, setRecipeUrl] = useState("");
  const [scraping, setScraping] = useState(false);

  // Add store
  const [storeName, setStoreName] = useState("");

  useEffect(() => {
    Promise.all([
      fetch("/api/admin/library/recipes").then((r) => r.json()),
      fetch("/api/admin/library/stores").then((r) => r.json()),
    ]).then(([r, s]) => {
      setRecipes(r);
      setStores(s);
      setLoading(false);
    });
  }, []);

  async function scrapeUrl() {
    if (!recipeUrl) return;
    setScraping(true);
    const res = await fetch("/api/recipes/scrape", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: recipeUrl }),
    });
    if (res.ok) {
      const data = await res.json();
      setRecipeName(data.name || "");
      setRecipeDesc(data.description || "");
      setRecipeInstructions(data.instructions || "");
      setRecipeServings(data.servings || 4);
    }
    setScraping(false);
  }

  async function addRecipe() {
    if (!recipeName || !recipeInstructions) return;
    setRecipeSaving(true);
    const res = await fetch("/api/admin/library/recipes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: recipeName,
        description: recipeDesc || undefined,
        instructions: recipeInstructions,
        servings: recipeServings,
        category: recipeCategory || undefined,
        sourceUrl: recipeUrl || undefined,
        sourceType: recipeUrl ? "WEBSITE" : "PERSONAL",
      }),
    });
    if (res.ok) {
      const recipe = await res.json();
      setRecipes((prev) => [recipe, ...prev]);
      setRecipeDialogOpen(false);
      resetRecipeForm();
    }
    setRecipeSaving(false);
  }

  function resetRecipeForm() {
    setRecipeName("");
    setRecipeDesc("");
    setRecipeInstructions("");
    setRecipeServings(4);
    setRecipeCategory("");
    setRecipeUrl("");
  }

  async function deleteRecipe(id: number) {
    await fetch(`/api/admin/library/recipes?id=${id}`, { method: "DELETE" });
    setRecipes((prev) => prev.filter((r) => r.id !== id));
  }

  async function addStore() {
    if (!storeName.trim()) return;
    const res = await fetch("/api/admin/library/stores", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: storeName.trim() }),
    });
    if (res.ok) {
      const store = await res.json();
      setStores((prev) => [...prev, store].sort((a, b) => a.name.localeCompare(b.name)));
      setStoreName("");
    }
  }

  async function deleteStore(id: number) {
    await fetch(`/api/admin/library/stores?id=${id}`, { method: "DELETE" });
    setStores((prev) => prev.filter((s) => s.id !== id));
  }

  if (loading) return <PageLoader />;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Content Library</h1>
        <p className="text-sm text-muted-foreground">
          Recipes and stores here are available for all users to add to their accounts
        </p>
      </div>

      {/* Recipes */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div className="flex items-center gap-2">
            <UtensilsCrossed className="h-5 w-5" />
            <CardTitle>Recipes ({recipes.length})</CardTitle>
          </div>
          <Button size="sm" onClick={() => setRecipeDialogOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Add Recipe
          </Button>
        </CardHeader>
        <CardContent>
          {recipes.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">No library recipes yet</p>
          ) : (
            <div className="space-y-2">
              {recipes.map((recipe) => (
                <div key={recipe.id} className="flex items-center justify-between rounded-lg border p-3">
                  <div>
                    <div className="text-sm font-semibold">{recipe.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {recipe.servings} servings
                      {recipe.category && ` · ${recipe.category}`}
                      {recipe.sourceUrl && " · From web"}
                    </div>
                  </div>
                  <Button size="sm" variant="ghost" className="text-destructive" onClick={() => deleteRecipe(recipe.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Stores */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Store className="h-5 w-5" />
            <CardTitle>Stores ({stores.length})</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <Input
              placeholder="Store name"
              value={storeName}
              onChange={(e) => setStoreName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addStore()}
            />
            <Button onClick={addStore} disabled={!storeName.trim()}>
              <Plus className="mr-2 h-4 w-4" />
              Add
            </Button>
          </div>
          {stores.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">No library stores yet</p>
          ) : (
            <div className="space-y-2">
              {stores.map((store) => (
                <div key={store.id} className="flex items-center justify-between rounded-lg border p-3">
                  <span className="text-sm font-medium">{store.name}</span>
                  <Button size="sm" variant="ghost" className="text-destructive" onClick={() => deleteStore(store.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add Recipe Dialog */}
      <Dialog open={recipeDialogOpen} onOpenChange={setRecipeDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Add Library Recipe</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Import from URL (optional)</Label>
              <div className="flex gap-2">
                <Input placeholder="https://..." value={recipeUrl} onChange={(e) => setRecipeUrl(e.target.value)} />
                <Button variant="outline" onClick={scrapeUrl} disabled={scraping || !recipeUrl}>
                  {scraping ? <Loader2 className="h-4 w-4 animate-spin" /> : "Import"}
                </Button>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Name *</Label>
              <Input value={recipeName} onChange={(e) => setRecipeName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Input value={recipeDesc} onChange={(e) => setRecipeDesc(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Servings</Label>
                <Input type="number" min={1} value={recipeServings} onChange={(e) => setRecipeServings(parseInt(e.target.value) || 4)} />
              </div>
              <div className="space-y-2">
                <Label>Category</Label>
                <Input placeholder="e.g. Dinner, Dessert" value={recipeCategory} onChange={(e) => setRecipeCategory(e.target.value)} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Instructions *</Label>
              <Textarea rows={5} value={recipeInstructions} onChange={(e) => setRecipeInstructions(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setRecipeDialogOpen(false); resetRecipeForm(); }}>Cancel</Button>
            <Button onClick={addRecipe} disabled={recipeSaving || !recipeName || !recipeInstructions}>
              {recipeSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Add to Library
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
