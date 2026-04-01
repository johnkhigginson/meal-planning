"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageLoader } from "@/components/shared/PageLoader";
import { LemonLogo } from "@/components/shared/LemonLogo";
import { Download, Check, Clock, Users, Loader2, BookOpen, UtensilsCrossed } from "lucide-react";
import Link from "next/link";

interface SharedRecipe {
  name: string;
  description: string | null;
  servings: number;
  prepTimeMinutes: number | null;
  cookTimeMinutes: number | null;
  instructions: string;
  ingredients: { ingredient: { name: string }; quantity: number; unit: { abbreviation: string }; notes: string | null }[];
  tags: { tag: { name: string } }[];
}

interface SharedBook {
  name: string;
  description: string | null;
  entries: { recipe: SharedRecipe }[];
}

export default function SharePage() {
  const params = useParams();
  const token = params.token as string;

  const [data, setData] = useState<{ type: string; recipe?: SharedRecipe; book?: SharedBook } | null>(null);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [imported, setImported] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch(`/api/share/${token}`)
      .then((r) => r.json())
      .then((d) => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [token]);

  async function handleImport() {
    setImporting(true);
    setError("");
    const res = await fetch(`/api/share/${token}`, { method: "POST" });
    if (res.ok) {
      setImported(true);
    } else {
      const err = await res.json();
      setError(err.error || "Failed to import. Are you signed in?");
    }
    setImporting(false);
  }

  if (loading) return <PageLoader />;

  if (!data || (!data.recipe && !data.book)) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center p-4">
        <LemonLogo className="mb-4 h-12 w-12" />
        <h1 className="text-xl font-bold">Share link not found</h1>
        <p className="mt-2 text-muted-foreground">This link may have expired or been removed.</p>
        <Link href="/"><Button className="mt-4">Go Home</Button></Link>
      </div>
    );
  }

  const isRecipe = data.type === "RECIPE" && data.recipe;
  const isBook = data.type === "BOOK" && data.book;

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-4 py-8">
      {/* Header */}
      <div className="flex items-center gap-2">
        <LemonLogo className="h-8 w-8" />
        <span className="text-base font-bold">My Lemon Kitchen</span>
      </div>

      {/* Import bar */}
      <Card>
        <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-medium">
              {isRecipe ? "Someone shared a recipe with you" : "Someone shared a recipe book with you"}
            </p>
            <p className="text-xs text-muted-foreground">
              {imported ? "Added to your collection!" : "Sign in and import it to your kitchen"}
            </p>
          </div>
          <Button onClick={handleImport} disabled={importing || imported}>
            {imported ? <><Check className="mr-2 h-4 w-4" /> Imported</> :
             importing ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Importing...</> :
             <><Download className="mr-2 h-4 w-4" /> Add to My Kitchen</>}
          </Button>
        </CardContent>
        {error && <CardContent className="border-t px-4 py-2 text-xs text-destructive">{error}</CardContent>}
      </Card>

      {/* Recipe preview */}
      {isRecipe && data.recipe && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <UtensilsCrossed className="h-5 w-5 text-primary" />
              <CardTitle>{data.recipe.name}</CardTitle>
            </div>
            {data.recipe.description && <p className="text-sm text-muted-foreground">{data.recipe.description}</p>}
            <div className="flex gap-3 text-sm text-muted-foreground">
              {(data.recipe.prepTimeMinutes || 0) + (data.recipe.cookTimeMinutes || 0) > 0 && (
                <span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5" />{(data.recipe.prepTimeMinutes || 0) + (data.recipe.cookTimeMinutes || 0)}m</span>
              )}
              <span className="flex items-center gap-1"><Users className="h-3.5 w-3.5" />{data.recipe.servings} servings</span>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <h3 className="mb-2 text-sm font-semibold">Ingredients</h3>
              <ul className="space-y-1">
                {data.recipe.ingredients.map((i, idx) => (
                  <li key={idx} className="text-sm">{i.quantity} {i.unit.abbreviation} {i.ingredient.name}{i.notes ? ` (${i.notes})` : ""}</li>
                ))}
              </ul>
            </div>
            <div>
              <h3 className="mb-2 text-sm font-semibold">Instructions</h3>
              <div className="whitespace-pre-wrap text-sm">{data.recipe.instructions}</div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Book preview */}
      {isBook && data.book && (
        <>
          <div className="flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-primary" />
            <h2 className="text-xl font-bold">{data.book.name}</h2>
            <Badge variant="secondary">{data.book.entries.length} recipes</Badge>
          </div>
          {data.book.description && <p className="text-sm text-muted-foreground">{data.book.description}</p>}
          <div className="space-y-3">
            {data.book.entries.map((entry, i) => {
              const r = entry.recipe;
              const totalTime = (r.prepTimeMinutes || 0) + (r.cookTimeMinutes || 0);
              return (
                <Card key={i}>
                  <CardContent className="p-4">
                    <h3 className="text-sm font-semibold">{r.name}</h3>
                    {r.description && <p className="mt-1 text-xs text-muted-foreground line-clamp-2">{r.description}</p>}
                    <div className="mt-2 flex gap-3 text-xs text-muted-foreground">
                      {totalTime > 0 && <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{totalTime}m</span>}
                      <span className="flex items-center gap-1"><Users className="h-3 w-3" />{r.servings}</span>
                      <span>{r.ingredients.length} ingredients</span>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
