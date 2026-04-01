"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { SearchInput } from "@/components/shared/SearchInput";
import { PageLoader } from "@/components/shared/PageLoader";
import { ArrowLeft, Plus, Trash2, Share2, Clock, Users, Check, Copy, Loader2 } from "lucide-react";

interface BookRecipe {
  id: number;
  name: string;
  description: string | null;
  servings: number;
  prepTimeMinutes: number | null;
  cookTimeMinutes: number | null;
  tags: { tag: { id: number; name: string } }[];
}

interface RecipeBook {
  id: number;
  name: string;
  description: string | null;
  entries: { id: number; recipe: BookRecipe }[];
}

export default function BookDetailPage() {
  const params = useParams();
  const bookId = params.id as string;

  const [book, setBook] = useState<RecipeBook | null>(null);
  const [loading, setLoading] = useState(true);

  // Add recipe dialog
  const [addOpen, setAddOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [searchResults, setSearchResults] = useState<{ id: number; name: string }[]>([]);
  const [addedIds, setAddedIds] = useState<Set<number>>(new Set());

  // Share
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetch(`/api/books/${bookId}`).then((r) => r.json()).then((data) => { setBook(data); setLoading(false); });
  }, [bookId]);

  useEffect(() => {
    if (!addOpen) return;
    const timer = setTimeout(async () => {
      const params = search ? `?q=${encodeURIComponent(search)}` : "";
      const res = await fetch(`/api/recipes${params}`);
      if (res.ok) {
        const data = await res.json();
        setSearchResults(data.recipes.map((r: { id: number; name: string }) => ({ id: r.id, name: r.name })));
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [search, addOpen]);

  async function addRecipe(recipeId: number) {
    const res = await fetch(`/api/books/${bookId}/recipes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ recipeId }),
    });
    if (res.ok) {
      setAddedIds((prev) => new Set(prev).add(recipeId));
      // Reload book
      const bookRes = await fetch(`/api/books/${bookId}`);
      if (bookRes.ok) setBook(await bookRes.json());
    }
  }

  async function removeRecipe(recipeId: number) {
    await fetch(`/api/books/${bookId}/recipes?recipeId=${recipeId}`, { method: "DELETE" });
    setBook((prev) => prev ? { ...prev, entries: prev.entries.filter((e) => e.recipe.id !== recipeId) } : prev);
  }

  async function shareBook() {
    setSharing(true);
    const res = await fetch(`/api/books/${bookId}/share`, { method: "POST" });
    if (res.ok) {
      const data = await res.json();
      setShareUrl(data.url);
    }
    setSharing(false);
  }

  function copyShareUrl() {
    if (shareUrl) {
      navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  if (loading) return <PageLoader />;
  if (!book) return <div className="text-muted-foreground">Book not found</div>;

  const existingIds = new Set(book.entries.map((e) => e.recipe.id));

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <Link href="/books">
            <Button variant="ghost" size="icon" className="h-8 w-8"><ArrowLeft className="h-4 w-4" /></Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold">{book.name}</h1>
            {book.description && <p className="text-sm text-muted-foreground">{book.description}</p>}
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={shareBook} disabled={sharing}>
            {sharing ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <Share2 className="mr-2 h-3.5 w-3.5" />}
            Share
          </Button>
          <Button size="sm" onClick={() => { setAddOpen(true); setSearch(""); setAddedIds(new Set()); }}>
            <Plus className="mr-2 h-3.5 w-3.5" />
            Add Recipes
          </Button>
        </div>
      </div>

      {/* Share URL */}
      {shareUrl && (
        <div className="flex items-center gap-2 rounded-2xl border border-border/60 bg-card px-4 py-3 shadow-sm">
          <span className="flex-1 truncate text-sm text-muted-foreground">{shareUrl}</span>
          <Button size="sm" variant="outline" onClick={copyShareUrl}>
            {copied ? <Check className="mr-1.5 h-3.5 w-3.5" /> : <Copy className="mr-1.5 h-3.5 w-3.5" />}
            {copied ? "Copied" : "Copy"}
          </Button>
        </div>
      )}

      {/* Recipe list */}
      {book.entries.length === 0 ? (
        <div className="py-12 text-center text-muted-foreground">
          No recipes in this book yet. Click &quot;Add Recipes&quot; to get started.
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {book.entries.map((entry) => {
            const recipe = entry.recipe;
            const totalTime = (recipe.prepTimeMinutes || 0) + (recipe.cookTimeMinutes || 0);
            return (
              <Card key={entry.id} className="group transition-all hover:shadow-md">
                <CardContent className="p-5">
                  <div className="flex items-start justify-between gap-2">
                    <Link href={`/recipes/${recipe.id}`} className="flex-1">
                      <h3 className="text-sm font-semibold group-hover:text-primary transition-colors">{recipe.name}</h3>
                      {recipe.description && <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{recipe.description}</p>}
                      <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
                        {totalTime > 0 && <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{totalTime}m</span>}
                        <span className="flex items-center gap-1"><Users className="h-3 w-3" />{recipe.servings}</span>
                      </div>
                    </Link>
                    <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0 text-destructive" onClick={() => removeRecipe(recipe.id)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Add recipe dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Recipes to Book</DialogTitle></DialogHeader>
          <SearchInput value={search} onChange={setSearch} placeholder="Search your recipes..." />
          <div className="max-h-64 space-y-1 overflow-y-auto">
            {searchResults.map((recipe) => {
              const alreadyIn = existingIds.has(recipe.id) || addedIds.has(recipe.id);
              return (
                <div key={recipe.id} className="flex items-center justify-between rounded-lg px-3 py-2.5 hover:bg-muted">
                  <span className="text-sm">{recipe.name}</span>
                  <Button size="sm" variant={alreadyIn ? "secondary" : "default"} disabled={alreadyIn} onClick={() => addRecipe(recipe.id)}>
                    {alreadyIn ? <><Check className="mr-1 h-3 w-3" /> Added</> : <><Plus className="mr-1 h-3 w-3" /> Add</>}
                  </Button>
                </div>
              );
            })}
            {searchResults.length === 0 && <p className="py-4 text-center text-sm text-muted-foreground">No recipes found</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
