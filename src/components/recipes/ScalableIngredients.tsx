"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Minus, Plus } from "lucide-react";

export interface ScalableIngredient {
  quantity: number;
  unit: string;
  name: string;
  notes?: string | null;
  optional?: boolean;
}

function formatQty(n: number): string {
  if (!isFinite(n) || n <= 0) return "";
  const rounded = Math.round(n * 100) / 100;
  return Number.isInteger(rounded) ? String(rounded) : String(rounded);
}

// Ingredient list with a servings adjuster that rescales every quantity.
export function ScalableIngredients({
  ingredients,
  baseServings,
}: {
  ingredients: ScalableIngredient[];
  baseServings: number;
}) {
  const [servings, setServings] = useState(baseServings > 0 ? baseServings : 1);
  const factor = baseServings > 0 ? servings / baseServings : 1;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle>Ingredients</CardTitle>
        <div className="flex items-center gap-2 print:hidden">
          <span className="text-xs text-muted-foreground">Servings</span>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-7 w-7"
            onClick={() => setServings((s) => Math.max(1, s - 1))}
            aria-label="Fewer servings"
          >
            <Minus className="h-3.5 w-3.5" />
          </Button>
          <span className="w-6 text-center text-sm font-semibold">{servings}</span>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-7 w-7"
            onClick={() => setServings((s) => s + 1)}
            aria-label="More servings"
          >
            <Plus className="h-3.5 w-3.5" />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <ul className="space-y-2">
          {ingredients.map((ri, i) => (
            <li key={i} className="flex items-baseline gap-2">
              <span className="font-medium">
                {formatQty(ri.quantity * factor)} {ri.unit}
              </span>
              <span>{ri.name}</span>
              {ri.notes && <span className="text-sm text-muted-foreground">({ri.notes})</span>}
              {ri.optional && (
                <Badge variant="secondary" className="text-xs print:hidden">
                  optional
                </Badge>
              )}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
