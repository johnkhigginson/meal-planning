"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Clock, Users, Check, X, Heart } from "lucide-react";

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

  useEffect(() => {
    setLoading(true);
    fetch(`/api/what-can-i-make?minMatch=${minMatch}`)
      .then((r) => r.json())
      .then((data) => {
        setResults(data);
        setLoading(false);
      });
  }, [minMatch]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold">What Can I Make?</h1>
        <p className="text-sm text-muted-foreground">
          Recipes ranked by what you have in your pantry
        </p>
      </div>

      <div className="flex items-center gap-4">
        <Label htmlFor="minMatch" className="shrink-0 text-sm">
          Minimum match:
        </Label>
        <Input
          id="minMatch"
          type="range"
          min={0}
          max={1}
          step={0.1}
          value={minMatch}
          onChange={(e) => setMinMatch(parseFloat(e.target.value))}
          className="w-48"
        />
        <span className="text-sm text-muted-foreground">
          {Math.round(minMatch * 100)}%
        </span>
      </div>

      {loading ? (
        <p className="text-muted-foreground">Analyzing your pantry...</p>
      ) : results.length === 0 ? (
        <div className="py-12 text-center">
          <p className="text-lg text-muted-foreground">No matching recipes found</p>
          <p className="text-sm text-muted-foreground">
            Try lowering the minimum match or{" "}
            <Link href="/pantry" className="text-primary underline">
              add items to your pantry
            </Link>
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {results.map((match) => {
            const pct = Math.round(match.matchScore * 100);
            const isExpanded = expandedId === match.recipeId;
            const totalTime =
              (match.prepTimeMinutes || 0) + (match.cookTimeMinutes || 0);

            return (
              <Card key={match.recipeId}>
                <CardHeader
                  className="cursor-pointer"
                  onClick={() =>
                    setExpandedId(isExpanded ? null : match.recipeId)
                  }
                >
                  <div className="flex items-start justify-between">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <CardTitle className="text-base">
                          <Link
                            href={`/recipes/${match.recipeId}`}
                            className="hover:underline"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {match.recipeName}
                          </Link>
                        </CardTitle>
                        {match.isFavorite && (
                          <Heart className="h-4 w-4 fill-red-500 text-red-500" />
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
                    <div className="flex items-center gap-3 text-right">
                      <div className="space-y-1">
                        <div className="text-sm font-medium">
                          {match.matchedCount}/{match.totalRequired} ingredients
                        </div>
                        <Progress value={pct} className="h-2 w-32" />
                      </div>
                      <Badge
                        variant={pct === 100 ? "default" : "secondary"}
                        className="text-sm"
                      >
                        {pct}%
                      </Badge>
                    </div>
                  </div>
                </CardHeader>

                {isExpanded && (
                  <CardContent>
                    <div className="grid gap-1 sm:grid-cols-2">
                      {match.ingredients.map((ing) => (
                        <div
                          key={ing.ingredientId}
                          className="flex items-center gap-2 text-sm"
                        >
                          {ing.isMet ? (
                            <Check className="h-4 w-4 text-green-600" />
                          ) : (
                            <X className="h-4 w-4 text-red-500" />
                          )}
                          <span
                            className={
                              ing.isMet ? "" : "font-medium text-red-600"
                            }
                          >
                            {ing.requiredQty} {ing.requiredUnitAbbr}{" "}
                            {ing.ingredientName}
                          </span>
                          {ing.optional && (
                            <Badge variant="secondary" className="text-xs">
                              optional
                            </Badge>
                          )}
                        </div>
                      ))}
                    </div>
                    {match.tags.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-1">
                        {match.tags.map((tag) => (
                          <Badge key={tag.id} variant="outline" className="text-xs">
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
    </div>
  );
}
