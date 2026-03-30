"use client";

import { useState, useEffect, useRef } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { QuantityUnitInput } from "@/components/shared/QuantityUnitInput";
import { X, GripVertical } from "lucide-react";

interface Unit {
  id: number;
  name: string;
  abbreviation: string;
  unitType: string;
}

interface Ingredient {
  id: number;
  name: string;
}

export interface RecipeIngredientRow {
  key: string;
  ingredientId: number;
  ingredientName: string;
  quantity: number;
  unitId: number;
  notes: string;
  optional: boolean;
}

interface IngredientInputProps {
  row: RecipeIngredientRow;
  units: Unit[];
  onChange: (row: RecipeIngredientRow) => void;
  onRemove: () => void;
}

export function IngredientInput({
  row,
  units,
  onChange,
  onRemove,
}: IngredientInputProps) {
  const [query, setQuery] = useState(row.ingredientName);
  const [suggestions, setSuggestions] = useState<Ingredient[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (query.length < 2) {
      setSuggestions([]);
      return;
    }

    const timer = setTimeout(async () => {
      const res = await fetch(`/api/ingredients?q=${encodeURIComponent(query)}`);
      if (res.ok) {
        const data = await res.json();
        setSuggestions(data);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  async function selectIngredient(ingredient: Ingredient) {
    onChange({ ...row, ingredientId: ingredient.id, ingredientName: ingredient.name });
    setQuery(ingredient.name);
    setShowSuggestions(false);
  }

  async function createIngredient() {
    if (!query.trim()) return;
    const res = await fetch("/api/ingredients", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: query.trim() }),
    });
    if (res.ok) {
      const ingredient = await res.json();
      selectIngredient(ingredient);
    }
  }

  return (
    <div className="flex items-start gap-2 rounded-md border p-3">
      <GripVertical className="mt-2.5 h-4 w-4 shrink-0 cursor-grab text-muted-foreground" />

      <div className="flex flex-1 flex-wrap items-start gap-2">
        {/* Ingredient name with autocomplete */}
        <div ref={wrapperRef} className="relative min-w-48 flex-1">
          <Input
            placeholder="Ingredient name"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setShowSuggestions(true);
              if (!e.target.value) {
                onChange({ ...row, ingredientId: 0, ingredientName: "" });
              }
            }}
            onFocus={() => query.length >= 2 && setShowSuggestions(true)}
          />
          {showSuggestions && (query.length >= 2) && (
            <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-md">
              {suggestions.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  className="w-full px-3 py-2 text-left text-sm hover:bg-accent"
                  onClick={() => selectIngredient(s)}
                >
                  {s.name}
                </button>
              ))}
              {suggestions.length === 0 && (
                <button
                  type="button"
                  className="w-full px-3 py-2 text-left text-sm text-muted-foreground hover:bg-accent"
                  onClick={createIngredient}
                >
                  Create &quot;{query}&quot;
                </button>
              )}
              {suggestions.length > 0 &&
                !suggestions.some(
                  (s) => s.name.toLowerCase() === query.toLowerCase()
                ) && (
                  <button
                    type="button"
                    className="w-full border-t px-3 py-2 text-left text-sm text-muted-foreground hover:bg-accent"
                    onClick={createIngredient}
                  >
                    Create &quot;{query}&quot;
                  </button>
                )}
            </div>
          )}
        </div>

        {/* Quantity and unit */}
        <QuantityUnitInput
          quantity={row.quantity}
          unitId={row.unitId}
          units={units}
          onQuantityChange={(q) => onChange({ ...row, quantity: q })}
          onUnitChange={(u) => onChange({ ...row, unitId: u })}
        />

        {/* Notes */}
        <Input
          placeholder="Notes (e.g., diced)"
          value={row.notes}
          onChange={(e) => onChange({ ...row, notes: e.target.value })}
          className="w-40"
        />

        {/* Optional checkbox */}
        <label className="flex items-center gap-1.5 pt-2 text-sm">
          <Checkbox
            checked={row.optional}
            onCheckedChange={(checked) =>
              onChange({ ...row, optional: checked === true })
            }
          />
          Optional
        </label>
      </div>

      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={onRemove}
        className="mt-1 shrink-0"
      >
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
}
