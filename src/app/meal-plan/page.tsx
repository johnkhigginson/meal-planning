"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { SearchInput } from "@/components/shared/SearchInput";
import { ChevronLeft, ChevronRight, Plus, X, ShoppingCart, Loader2 } from "lucide-react";

const ALL_MEAL_SLOTS = ["BREAKFAST", "LUNCH", "DINNER", "SNACK"] as const;
const SLOT_LABELS: Record<string, string> = {
  BREAKFAST: "Breakfast",
  LUNCH: "Lunch",
  DINNER: "Dinner",
  SNACK: "Snack",
};
const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

interface MealPlanEntry {
  id: number;
  recipeId: number;
  date: string;
  mealSlot: string;
  servings: number;
  recipe: { id: number; name: string; servings: number };
}

interface MealPlan {
  id: number;
  weekStartDate: string;
  entries: MealPlanEntry[];
}

interface RecipeOption {
  id: number;
  name: string;
  servings: number;
}

function getMonday(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function formatDate(date: Date): string {
  return date.toISOString().split("T")[0];
}

export default function MealPlanPage() {
  const router = useRouter();
  const [currentMonday, setCurrentMonday] = useState(() => getMonday(new Date()));
  const [plan, setPlan] = useState<MealPlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [enabledSlots, setEnabledSlots] = useState<string[]>([...ALL_MEAL_SLOTS]);

  // Recipe picker dialog
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerSlot, setPickerSlot] = useState<{ date: string; mealSlot: string } | null>(null);
  const [recipeSearch, setRecipeSearch] = useState("");
  const [recipeOptions, setRecipeOptions] = useState<RecipeOption[]>([]);
  const [selectedRecipe, setSelectedRecipe] = useState<RecipeOption | null>(null);
  const [servings, setServings] = useState(4);

  const weekDates = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(currentMonday);
    d.setDate(d.getDate() + i);
    return d;
  });

  // Load user meal slot preferences
  useEffect(() => {
    fetch("/api/user/settings")
      .then((r) => r.json())
      .then((data) => {
        if (data?.enabledMealSlots) {
          setEnabledSlots(data.enabledMealSlots.split(",").filter(Boolean));
        }
      });
  }, []);

  const loadPlan = useCallback(async () => {
    setLoading(true);
    const weekOf = formatDate(currentMonday);

    const res = await fetch("/api/meal-plans", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ weekStartDate: weekOf }),
    });
    if (res.ok) {
      setPlan(await res.json());
    }
    setLoading(false);
  }, [currentMonday]);

  useEffect(() => {
    loadPlan();
  }, [loadPlan]);

  useEffect(() => {
    if (!pickerOpen) return;
    const timer = setTimeout(async () => {
      const params = recipeSearch ? `?q=${encodeURIComponent(recipeSearch)}` : "";
      const res = await fetch(`/api/recipes${params}`);
      if (res.ok) {
        const data = await res.json();
        setRecipeOptions(
          data.recipes.map((r: RecipeOption) => ({
            id: r.id,
            name: r.name,
            servings: r.servings,
          }))
        );
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [recipeSearch, pickerOpen]);

  function openPicker(date: string, mealSlot: string) {
    setPickerSlot({ date, mealSlot });
    setRecipeSearch("");
    setSelectedRecipe(null);
    setServings(4);
    setPickerOpen(true);
  }

  async function addEntry() {
    if (!plan || !pickerSlot || !selectedRecipe) return;
    const res = await fetch(`/api/meal-plans/${plan.id}/entries`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        recipeId: selectedRecipe.id,
        date: pickerSlot.date,
        mealSlot: pickerSlot.mealSlot,
        servings,
      }),
    });
    if (res.ok) {
      setPickerOpen(false);
      loadPlan();
    }
  }

  async function removeEntry(entryId: number) {
    if (!plan) return;
    await fetch(`/api/meal-plans/${plan.id}/entries/${entryId}`, {
      method: "DELETE",
    });
    loadPlan();
  }

  async function generateGroceryList() {
    if (!plan) return;
    setGenerating(true);
    const res = await fetch(`/api/meal-plans/${plan.id}/grocery-list`, {
      method: "POST",
    });
    if (res.ok) {
      const data = await res.json();
      router.push(`/grocery-list?id=${data.groceryListId}`);
    }
    setGenerating(false);
  }

  function getEntries(date: Date, slot: string): MealPlanEntry[] {
    if (!plan) return [];
    const dateStr = formatDate(date);
    return plan.entries.filter(
      (e) => e.date.split("T")[0] === dateStr && e.mealSlot === slot
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Meal Plan</h1>
        <Button onClick={generateGroceryList} disabled={generating || !plan?.entries.length}>
          {generating ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <ShoppingCart className="mr-2 h-4 w-4" />
          )}
          Generate Grocery List
        </Button>
      </div>

      {/* Week navigation */}
      <div className="flex items-center gap-4">
        <Button
          variant="outline"
          size="icon"
          onClick={() => {
            const prev = new Date(currentMonday);
            prev.setDate(prev.getDate() - 7);
            setCurrentMonday(prev);
          }}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="text-lg font-medium">
          {currentMonday.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
          {" - "}
          {weekDates[6].toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
          })}
        </span>
        <Button
          variant="outline"
          size="icon"
          onClick={() => {
            const next = new Date(currentMonday);
            next.setDate(next.getDate() + 7);
            setCurrentMonday(next);
          }}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setCurrentMonday(getMonday(new Date()))}
        >
          Today
        </Button>
      </div>

      {/* Meal slot toggles */}
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">Show:</span>
        {ALL_MEAL_SLOTS.map((slot) => (
          <Badge
            key={slot}
            variant={enabledSlots.includes(slot) ? "default" : "outline"}
            className="cursor-pointer"
            onClick={() => {
              const updated = enabledSlots.includes(slot)
                ? enabledSlots.filter((s) => s !== slot)
                : [...enabledSlots, slot];
              if (updated.length === 0) return;
              setEnabledSlots(updated);
              // Save to user settings
              fetch("/api/user/settings", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ enabledMealSlots: updated.join(",") }),
              });
            }}
          >
            {SLOT_LABELS[slot]}
          </Badge>
        ))}
      </div>

      {loading ? (
        <p className="text-muted-foreground">Loading meal plan...</p>
      ) : (
        <div className="overflow-x-auto">
          <div className="grid min-w-[900px] grid-cols-[100px_repeat(7,1fr)] gap-1">
            {/* Header row */}
            <div />
            {weekDates.map((date, i) => (
              <div
                key={i}
                className="p-2 text-center text-sm font-medium"
              >
                <div>{DAY_LABELS[i]}</div>
                <div className="text-muted-foreground">
                  {date.getMonth() + 1}/{date.getDate()}
                </div>
              </div>
            ))}

            {/* Meal slot rows */}
            {ALL_MEAL_SLOTS.filter((s) => enabledSlots.includes(s)).map((slot) => (
              <>
                <div
                  key={`label-${slot}`}
                  className="flex items-center p-2 text-sm font-medium"
                >
                  {SLOT_LABELS[slot]}
                </div>
                {weekDates.map((date, i) => {
                  const entries = getEntries(date, slot);
                  return (
                    <Card
                      key={`${slot}-${i}`}
                      className="min-h-[80px] p-2"
                    >
                      <CardContent className="space-y-1 p-0">
                        {entries.map((entry) => (
                          <div
                            key={entry.id}
                            className="flex items-start justify-between gap-1 rounded bg-accent p-1.5 text-xs"
                          >
                            <span className="leading-tight">
                              {entry.recipe.name}
                              <span className="ml-1 text-muted-foreground">
                                ({entry.servings})
                              </span>
                            </span>
                            <button
                              onClick={() => removeEntry(entry.id)}
                              className="shrink-0 text-muted-foreground hover:text-destructive"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </div>
                        ))}
                        <button
                          onClick={() => openPicker(formatDate(date), slot)}
                          className="flex w-full items-center justify-center rounded border border-dashed p-1 text-xs text-muted-foreground hover:bg-accent"
                        >
                          <Plus className="h-3 w-3" />
                        </button>
                      </CardContent>
                    </Card>
                  );
                })}
              </>
            ))}
          </div>
        </div>
      )}

      {/* Recipe Picker Dialog */}
      <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Recipe</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <SearchInput
              value={recipeSearch}
              onChange={setRecipeSearch}
              placeholder="Search recipes..."
            />
            <div className="max-h-48 space-y-1 overflow-y-auto">
              {recipeOptions.map((recipe) => (
                <button
                  key={recipe.id}
                  type="button"
                  className={`w-full rounded px-3 py-2 text-left text-sm ${
                    selectedRecipe?.id === recipe.id
                      ? "bg-primary text-primary-foreground"
                      : "hover:bg-accent"
                  }`}
                  onClick={() => {
                    setSelectedRecipe(recipe);
                    setServings(recipe.servings);
                  }}
                >
                  {recipe.name}
                </button>
              ))}
            </div>
            {selectedRecipe && (
              <div className="space-y-2">
                <Label htmlFor="servings">Servings</Label>
                <Input
                  id="servings"
                  type="number"
                  min={1}
                  value={servings}
                  onChange={(e) => setServings(parseInt(e.target.value, 10) || 1)}
                  className="w-24"
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPickerOpen(false)}>
              Cancel
            </Button>
            <Button onClick={addEntry} disabled={!selectedRecipe}>
              Add to Plan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
