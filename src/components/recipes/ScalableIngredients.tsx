"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Check, Minus, Plus } from "lucide-react";
import { groupBySection } from "@/lib/recipe-sections";
import { cleanIngredientNote, formatIngredient } from "@/lib/ingredient-format";
import { cn } from "@/lib/utils";
import { AddMissingToGroceryButton } from "./AddMissingToGroceryButton";

export interface ScalableIngredient {
  quantity: number;
  unit: string;
  name: string;
  notes?: string | null;
  optional?: boolean;
  // Ingredient group heading, for recipes with more than one component.
  section?: string | null;
  // Pantry stock, already converted to this ingredient's unit.
  //   undefined  household doesn't track a pantry: show no indicator
  //   null       not in the pantry
  //   "present"  in the pantry, but the units can't be converted
  //   number     quantity on hand, in this ingredient's unit
  stock?: number | "present" | null;
}

// Same rule as lib/matching.ts, re-run here so it follows the servings scaler.
function hasEnough(stock: ScalableIngredient["stock"], needed: number): boolean {
  if (stock === undefined || stock === null) return false;
  if (stock === "present") return true;
  return stock >= needed - 1e-9;
}

// Ingredient list with a servings adjuster that rescales every quantity.
export function ScalableIngredients({
  ingredients,
  baseServings,
  recipeId,
}: {
  ingredients: ScalableIngredient[];
  baseServings: number;
  // Set on the household's own recipe page to offer adding what's missing.
  recipeId?: number;
}) {
  const [servings, setServings] = useState(baseServings > 0 ? baseServings : 1);
  const factor = baseServings > 0 ? servings / baseServings : 1;

  const tracksPantry = ingredients.some((ri) => ri.stock !== undefined);
  const required = ingredients.filter((ri) => !ri.optional);
  const metCount = required.filter((ri) => hasEnough(ri.stock, ri.quantity * factor)).length;

  return (
    <Card className="gap-5">
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
        <CardTitle className="text-2xl">Ingredients</CardTitle>
        <div
          role="group"
          aria-label="Servings"
          className="flex items-center rounded-full border print:hidden"
        >
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-10"
            onClick={() => setServings((s) => Math.max(1, s - 1))}
            aria-label="Fewer servings"
          >
            <Minus className="h-4 w-4" />
          </Button>
          <span className="min-w-[4.5rem] text-center text-sm font-bold" aria-live="polite">
            Serves {servings}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-10"
            onClick={() => setServings((s) => s + 1)}
            aria-label="More servings"
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        {tracksPantry && required.length > 0 && (
          <div className="space-y-2">
            <p className="flex items-center gap-2 rounded-xl bg-leaf-soft px-3.5 py-2.5 text-sm font-bold text-leaf-ink print:hidden">
              <Check className="h-4 w-4" strokeWidth={2.5} />
              {metCount} of {required.length} in your pantry
            </p>
            {recipeId !== undefined && metCount < required.length && (
              <AddMissingToGroceryButton recipeId={recipeId} servings={servings} />
            )}
          </div>
        )}
        {groupBySection(ingredients).map((group, g) => (
          <div key={g}>
            {group.name && (
              <h3 className="mb-1 text-sm font-bold tracking-tight">{group.name}</h3>
            )}
            <ul>
              {group.items.map((ri, i) => {
                const enough = hasEnough(ri.stock, ri.quantity * factor);
                const shown = formatIngredient(ri.quantity * factor, ri.unit, ri.name);
                const note = cleanIngredientNote(ri.notes, shown.name);
                return (
                  <li
                    key={i}
                    className="flex items-baseline gap-3 border-b border-border/70 py-2.5 last:border-b-0"
                  >
                    {tracksPantry && (
                      <span
                        className={cn(
                          "relative top-[3px] flex size-5 shrink-0 items-center justify-center rounded-full print:hidden",
                          enough ? "bg-leaf text-white" : "border-2 border-muted-foreground/60"
                        )}
                      >
                        {enough && <Check className="size-3" strokeWidth={3.5} aria-hidden="true" />}
                        <span className="sr-only">{enough ? "In pantry" : "Not in pantry"}</span>
                      </span>
                    )}
                    <span className="min-w-0">
                      <span className="font-extrabold">{shown.amount}</span>{" "}
                      <span>{shown.name}</span>
                      {note && <span className="text-sm text-muted-foreground"> ({note})</span>}
                      {ri.optional && (
                        <Badge variant="secondary" className="ml-2 text-xs print:hidden">
                          optional
                        </Badge>
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
