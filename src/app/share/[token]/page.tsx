"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { Button, buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PageLoader } from "@/components/shared/PageLoader";
import { LemonLogo } from "@/components/shared/LemonLogo";
import { Download, Check, Clock, Users, Loader2, BookOpen, UtensilsCrossed } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { groupBySection } from "@/lib/recipe-sections";
import { RecipeInstructions } from "@/components/recipes/RecipeInstructions";

interface SharedRecipe {
  name: string;
  description: string | null;
  servings: number;
  prepTimeMinutes: number | null;
  cookTimeMinutes: number | null;
  instructions: string;
  ingredients: {
    ingredient: { name: string };
    quantity: number;
    unit: { abbreviation: string };
    notes: string | null;
    section: string | null;
  }[];
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
      <div className="flex min-h-screen flex-col items-center justify-center p-4 text-center">
        <LemonLogo className="mb-5 h-12 w-12" />
        <h1 className="text-3xl leading-tight font-medium">Share link not found</h1>
        <p className="mt-2 text-muted-foreground">This link may have expired or been removed.</p>
        <Link href="/" className={cn(buttonVariants({ size: "lg" }), "mt-6")}>
          Go home
        </Link>
      </div>
    );
  }

  const isRecipe = data.type === "RECIPE" && data.recipe;
  const isBook = data.type === "BOOK" && data.book;

  return (
    <div className="mx-auto max-w-3xl space-y-8 px-4 py-8 sm:py-12">
      {/* Header */}
      <div className="flex items-center gap-2">
        <LemonLogo className="h-8 w-8" />
        <span className="font-heading text-lg font-semibold">My Lemon Kitchen</span>
      </div>

      {/* Import bar */}
      <div className="overflow-hidden rounded-2xl border bg-card">
        <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
          <div>
            <p className="font-bold">
              {isRecipe ? "Someone shared a recipe with you" : "Someone shared a recipe book with you"}
            </p>
            <p className={cn("text-sm", imported ? "font-semibold text-leaf-ink" : "text-muted-foreground")}>
              {imported ? "Added to your collection!" : "Sign in and import it to your kitchen"}
            </p>
          </div>
          <Button
            size="lg"
            onClick={handleImport}
            disabled={importing || imported}
            className={cn(imported && "bg-leaf-soft text-leaf-ink disabled:opacity-100")}
          >
            {imported ? <><Check className="h-4 w-4" /> Imported</> :
             importing ? <><Loader2 className="h-4 w-4 animate-spin" /> Importing...</> :
             <><Download className="h-4 w-4" /> Add to my kitchen</>}
          </Button>
        </div>
        {error && <p role="alert" className="border-t px-4 py-2.5 text-sm text-destructive sm:px-5">{error}</p>}
      </div>

      {/* Recipe preview */}
      {isRecipe && data.recipe && (
        <article className="space-y-8 rounded-3xl border bg-card p-5 sm:p-8">
          <header className="space-y-3">
            <div className="flex items-start gap-3">
              <UtensilsCrossed className="mt-2.5 h-6 w-6 shrink-0 text-primary" />
              <h1 className="text-4xl leading-tight font-medium text-balance">{data.recipe.name}</h1>
            </div>
            {data.recipe.description && <p className="text-lg leading-relaxed text-muted-foreground">{data.recipe.description}</p>}
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
              {(data.recipe.prepTimeMinutes || 0) + (data.recipe.cookTimeMinutes || 0) > 0 && (
                <span className="flex items-center gap-1"><Clock className="h-4 w-4" />{(data.recipe.prepTimeMinutes || 0) + (data.recipe.cookTimeMinutes || 0)}m</span>
              )}
              <span className="flex items-center gap-1"><Users className="h-4 w-4" />{data.recipe.servings} servings</span>
            </div>
          </header>
          <div className="grid gap-8 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
            <section aria-labelledby="share-ingredients">
              <h2 id="share-ingredients" className="mb-3 font-heading text-2xl font-semibold">Ingredients</h2>
              {groupBySection(data.recipe.ingredients).map((group, g) => (
                <div key={g} className="mb-4 last:mb-0">
                  {group.name && (
                    <p className="mb-1.5 text-xs font-extrabold tracking-[0.08em] text-muted-foreground uppercase">{group.name}</p>
                  )}
                  <ul className="divide-y">
                    {group.items.map((i, idx) => (
                      <li key={idx} className="py-2 text-[15px]">
                        <span className="font-bold tabular-nums">{i.quantity} {i.unit.abbreviation}</span> {i.ingredient.name}
                        {i.notes ? <span className="text-muted-foreground"> ({i.notes})</span> : ""}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </section>
            <section aria-labelledby="share-method">
              <h2 id="share-method" className="mb-3 font-heading text-2xl font-semibold">Instructions</h2>
              <div className="text-[17px] leading-relaxed">
                <RecipeInstructions text={data.recipe.instructions} />
              </div>
            </section>
          </div>
        </article>
      )}

      {/* Book preview */}
      {isBook && data.book && (
        <section className="space-y-5">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-3">
              <BookOpen className="h-6 w-6 text-primary" />
              <h1 className="text-4xl leading-tight font-medium">{data.book.name}</h1>
              <Badge variant="secondary">{data.book.entries.length} recipes</Badge>
            </div>
            {data.book.description && <p className="text-muted-foreground">{data.book.description}</p>}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {data.book.entries.map((entry, i) => {
              const r = entry.recipe;
              const totalTime = (r.prepTimeMinutes || 0) + (r.cookTimeMinutes || 0);
              return (
                <div key={i} className="rounded-2xl border bg-card p-4">
                  <h2 className="text-base leading-snug font-bold">{r.name}</h2>
                  {r.description && <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{r.description}</p>}
                  <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    {totalTime > 0 && <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{totalTime}m</span>}
                    <span className="flex items-center gap-1"><Users className="h-3 w-3" />{r.servings}</span>
                    <span>{r.ingredients.length} ingredients</span>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
