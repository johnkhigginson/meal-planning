"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { buttonVariants } from "@/components/ui/button";
import { Clock, Users, Check, Heart, ChevronDown, Lightbulb } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatIngredient } from "@/lib/ingredient-format";
import { OptionalBadge } from "@/components/recipes/OptionalBadge";

interface MatchedIngredient {
  ingredientId: number;
  ingredientName: string;
  requiredQty: number;
  requiredUnitAbbr: string;
  availableQty: number | null;
  availableUnitAbbr: string | null;
  isMet: boolean;
  optional: boolean;
}

interface RecipeMatch {
  recipeId: number;
  recipeName: string;
  description: string | null;
  servings: number;
  prepTimeMinutes: number | null;
  cookTimeMinutes: number | null;
  sourceType: string;
  isFavorite: boolean;
  matchScore: number;
  totalRequired: number;
  matchedCount: number;
  ingredients: MatchedIngredient[];
  tags: { id: number; name: string }[];
}

export default function WhatCanIMakePage() {
  const [results, setResults] = useState<RecipeMatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [minMatch, setMinMatch] = useState(0);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  // A recipe with no structured ingredients can't be matched, so it would rank
  // as "0/0 ingredients". List those apart with a nudge to add ingredients.
  const ranked = results.filter((r) => r.ingredients.length > 0);
  const unlisted = results.filter((r) => r.ingredients.length === 0);

  useEffect(() => {
    fetch(`/api/what-can-i-make?minMatch=${minMatch}`)
      .then((r) => r.json())
      .then((data) => {
        setResults(data);
        setLoading(false);
      });
  }, [minMatch]);

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <div className="space-y-1">
        <h1 className="text-4xl leading-tight font-medium">What can I make?</h1>
        <p className="text-muted-foreground">
          Recipes ranked by what you have in your pantry
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl border bg-card px-4 py-3 sm:w-fit">
        <Label htmlFor="minMatch" className="shrink-0 text-sm font-bold">
          Minimum match:
        </Label>
        <Input
          id="minMatch"
          type="range"
          min={0}
          max={1}
          step={0.1}
          value={minMatch}
          onChange={(e) => {
            const next = parseFloat(e.target.value);
            if (next === minMatch) return;
            setLoading(true);
            setMinMatch(next);
          }}
          className="w-48"
        />
        <span className="min-w-[3ch] font-heading text-lg font-semibold tabular-nums">
          {Math.round(minMatch * 100)}%
        </span>
      </div>

      {loading ? (
        <p className="text-muted-foreground" role="status">Analyzing your pantry...</p>
      ) : ranked.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-3xl border border-dashed border-input px-6 py-12 text-center">
          <div className="flex size-12 items-center justify-center rounded-2xl bg-brand-soft text-primary">
            <Lightbulb className="h-6 w-6" />
          </div>
          <p className="font-heading text-xl">No matching recipes found</p>
          <p className="max-w-sm text-sm text-muted-foreground">
            Try lowering the minimum match or{" "}
            <Link href="/pantry" className="font-bold text-primary underline-offset-4 hover:underline">
              add items to your pantry
            </Link>
          </p>
          <Link href="/pantry" className={cn(buttonVariants({ size: "lg" }), "mt-1")}>
            Open pantry
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {ranked.map((match) => {
            const pct = Math.round(match.matchScore * 100);
            const full = pct === 100;
            const isExpanded = expandedId === match.recipeId;
            const totalTime =
              (match.prepTimeMinutes || 0) + (match.cookTimeMinutes || 0);

            return (
              <Card
                key={match.recipeId}
                className={cn(
                  "gap-0 py-0 has-[[data-slot=card-toggle]:focus-visible]:border-ring has-[[data-slot=card-toggle]:focus-visible]:ring-3 has-[[data-slot=card-toggle]:focus-visible]:ring-ring/50",
                  isExpanded ? "border-input" : "hover:border-input"
                )}
              >
                <CardHeader className="relative py-4 sm:py-5">
                  <button
                    type="button"
                    data-slot="card-toggle"
                    aria-expanded={isExpanded}
                    aria-controls={`ingredients-${match.recipeId}`}
                    aria-label={`${isExpanded ? "Hide" : "Show"} ingredients for ${match.recipeName}`}
                    className="absolute inset-0 cursor-pointer outline-none"
                    onClick={() =>
                      setExpandedId(isExpanded ? null : match.recipeId)
                    }
                  />
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0 space-y-1">
                      <div className="flex items-center gap-2">
                        <CardTitle className="text-xl">
                          <Link
                            href={`/recipes/${match.recipeId}`}
                            className="relative z-10 rounded-sm underline-offset-4 hover:underline focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
                          >
                            {match.recipeName}
                          </Link>
                        </CardTitle>
                        {match.isFavorite && (
                          <Heart
                            className="h-4 w-4 shrink-0 fill-red-600 text-red-600"
                            role="img"
                            aria-label="Favorite"
                          />
                        )}
                      </div>
                      <div className="flex items-center gap-3 text-sm text-muted-foreground">
                        {totalTime > 0 && (
                          <span className="flex items-center gap-1">
                            <Clock className="h-3.5 w-3.5" />
                            {totalTime} min
                          </span>
                        )}
                        <span className="flex items-center gap-1">
                          <Users className="h-3.5 w-3.5" />
                          {match.servings}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 sm:text-right">
                      <div className="space-y-1.5">
                        <div className="text-sm font-bold tabular-nums">
                          {match.totalRequired > 0
                            ? `${match.matchedCount}/${match.totalRequired} ingredients`
                            : "All ingredients optional"}
                        </div>
                        <Progress
                          value={pct}
                          aria-label={`${pct}% of ingredients in your pantry`}
                          className={cn(
                            "w-32 [&_[data-slot=progress-track]]:h-2",
                            full
                              ? "[&_[data-slot=progress-indicator]]:bg-leaf"
                              : "[&_[data-slot=progress-indicator]]:bg-primary"
                          )}
                        />
                      </div>
                      <Badge
                        variant={full ? "pantry" : "tag"}
                        className="h-7 px-2.5 text-sm font-extrabold tabular-nums"
                      >
                        {full && <Check strokeWidth={3} aria-hidden="true" />}
                        {pct}%
                      </Badge>
                      <ChevronDown
                        aria-hidden="true"
                        className={cn(
                          "ml-auto h-5 w-5 shrink-0 text-muted-foreground transition-transform duration-200 ease-out sm:ml-0",
                          isExpanded && "rotate-180"
                        )}
                      />
                    </div>
                  </div>
                </CardHeader>

                {isExpanded && (
                  <CardContent
                    id={`ingredients-${match.recipeId}`}
                    className="border-t pt-3 pb-5"
                  >
                    <ul className="grid gap-x-6 sm:grid-cols-2">
                      {match.ingredients.map((ing) => {
                        const shown = formatIngredient(ing.requiredQty, ing.requiredUnitAbbr, ing.ingredientName);
                        return (
                        <li
                          key={ing.ingredientId}
                          className="flex items-baseline gap-3 border-b border-border/70 py-2.5"
                        >
                          <span
                            className={cn(
                              "relative top-[3px] flex size-5 shrink-0 items-center justify-center rounded-full",
                              ing.isMet ? "bg-leaf text-white" : "border-2 border-muted-foreground/60"
                            )}
                          >
                            {ing.isMet && <Check className="size-3" strokeWidth={3.5} aria-hidden="true" />}
                            <span className="sr-only">{ing.isMet ? "In pantry" : "Not in pantry"}</span>
                          </span>
                          <span className="min-w-0">
                            <span className="font-extrabold">
                              {shown.amount}
                            </span>{" "}
                            <span>{shown.name}</span>
                            {ing.optional && <OptionalBadge />}
                          </span>
                        </li>
                        );
                      })}
                    </ul>
                    {match.tags.length > 0 && (
                      <div className="mt-4 flex flex-wrap gap-1.5">
                        {match.tags.map((tag) => (
                          <Badge key={tag.id} variant="tag" className="text-xs">
                            {tag.name}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </CardContent>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {!loading && unlisted.length > 0 && (
        <section aria-labelledby="unlisted-heading" className="space-y-3">
          <div className="space-y-1">
            <h2 id="unlisted-heading" className="font-heading text-2xl font-semibold">
              No ingredient list yet
            </h2>
            <p className="text-sm text-muted-foreground">
              These recipes can&apos;t be matched to your pantry until they have ingredients.
            </p>
          </div>
          <ul className="divide-y rounded-2xl border bg-card">
            {unlisted.map((recipe) => (
              <li
                key={recipe.recipeId}
                className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-3"
              >
                <Link
                  href={`/recipes/${recipe.recipeId}`}
                  className="min-w-0 font-bold underline-offset-4 hover:underline"
                >
                  {recipe.recipeName}
                </Link>
                <Link
                  href={`/recipes/${recipe.recipeId}/edit`}
                  className="text-sm font-bold text-primary underline-offset-4 hover:underline"
                >
                  Edit to add ingredients
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
