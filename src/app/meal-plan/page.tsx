"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
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

function isToday(date: Date): boolean {
  const today = new Date();
  return (
    date.getDate() === today.getDate() &&
    date.getMonth() === today.getMonth() &&
    date.getFullYear() === today.getFullYear()
  );
}

export default function MealPlanPage() {
  const router = useRouter();
  const [currentMonday, setCurrentMonday] = useState(() => getMonday(new Date()));
  const [plan, setPlan] = useState<MealPlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [enabledSlots, setEnabledSlots] = useState<string[]>([...ALL_MEAL_SLOTS]);

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

  const activeSlots = ALL_MEAL_SLOTS.filter((s) => enabledSlots.includes(s));

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
    const res = await fetch("/api/meal-plans", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ weekStartDate: formatDate(currentMonday) }),
    });
    if (res.ok) setPlan(await res.json());
    setLoading(false);
  }, [currentMonday]);

  useEffect(() => { loadPlan(); }, [loadPlan]);

  useEffect(() => {
    if (!pickerOpen) return;
    const timer = setTimeout(async () => {
      const params = recipeSearch ? `?q=${encodeURIComponent(recipeSearch)}` : "";
      const res = await fetch(`/api/recipes${params}`);
      if (res.ok) {
        const data = await res.json();
        setRecipeOptions(data.recipes.map((r: RecipeOption) => ({ id: r.id, name: r.name, servings: r.servings })));
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
    await fetch(`/api/meal-plans/${plan.id}/entries`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ recipeId: selectedRecipe.id, date: pickerSlot.date, mealSlot: pickerSlot.mealSlot, servings }),
    });
    setPickerOpen(false);
    loadPlan();
  }

  async function removeEntry(entryId: number) {
    if (!plan) return;
    await fetch(`/api/meal-plans/${plan.id}/entries/${entryId}`, { method: "DELETE" });
    loadPlan();
  }

  async function generateGroceryList() {
    if (!plan) return;
    setGenerating(true);
    const res = await fetch(`/api/meal-plans/${plan.id}/grocery-list`, { method: "POST" });
    if (res.ok) {
      const data = await res.json();
      router.push(`/grocery-list?id=${data.groceryListId}`);
    }
    setGenerating(false);
  }

  function getEntries(date: Date, slot: string): MealPlanEntry[] {
    if (!plan) return [];
    const dateStr = formatDate(date);
    return plan.entries.filter((e) => e.date.split("T")[0] === dateStr && e.mealSlot === slot);
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Meal Plan</h1>
          <p className="text-sm text-muted-foreground">
            {currentMonday.toLocaleDateString("en-US", { month: "long", day: "numeric" })}
            {" - "}
            {weekDates[6].toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={generateGroceryList} disabled={generating || !plan?.entries.length}>
            {generating ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <ShoppingCart className="mr-2 h-3.5 w-3.5" />}
            Grocery List
          </Button>
        </div>
      </div>

      {/* Controls */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => { const p = new Date(currentMonday); p.setDate(p.getDate() - 7); setCurrentMonday(p); }}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => setCurrentMonday(getMonday(new Date()))}>Today</Button>
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => { const n = new Date(currentMonday); n.setDate(n.getDate() + 7); setCurrentMonday(n); }}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex items-center gap-1.5">
          {ALL_MEAL_SLOTS.map((slot) => (
            <Badge
              key={slot}
              variant={enabledSlots.includes(slot) ? "default" : "outline"}
              className="cursor-pointer text-xs"
              onClick={() => {
                const updated = enabledSlots.includes(slot) ? enabledSlots.filter((s) => s !== slot) : [...enabledSlots, slot];
                if (updated.length === 0) return;
                setEnabledSlots(updated);
                fetch("/api/user/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ enabledMealSlots: updated.join(",") }) });
              }}
            >
              {SLOT_LABELS[slot]}
            </Badge>
          ))}
        </div>
      </div>

      {/* Calendar Grid */}
      {loading ? (
        <div className="flex items-center justify-center py-20 text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Loading...
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-border/60 bg-card shadow-sm">
          <div className="grid min-w-[800px]" style={{ gridTemplateColumns: `80px repeat(7, 1fr)` }}>
            {/* Day headers */}
            <div className="border-b bg-muted/30 p-3" />
            {weekDates.map((date, i) => (
              <div
                key={i}
                className={`border-b border-l bg-muted/30 p-3 text-center ${isToday(date) ? "bg-primary/5" : ""}`}
              >
                <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{DAY_LABELS[i]}</div>
                <div className={`mt-0.5 text-lg font-semibold ${isToday(date) ? "text-primary" : ""}`}>
                  {date.getDate()}
                </div>
              </div>
            ))}

            {/* Slot rows */}
            {activeSlots.map((slot, slotIdx) => (
              <>
                {/* Slot label */}
                <div
                  key={`label-${slot}`}
                  className={`flex items-start p-3 text-xs font-medium uppercase tracking-wide text-muted-foreground ${slotIdx > 0 ? "border-t" : ""}`}
                >
                  {SLOT_LABELS[slot]}
                </div>

                {/* Day cells */}
                {weekDates.map((date, dayIdx) => {
                  const entries = getEntries(date, slot);
                  return (
                    <div
                      key={`${slot}-${dayIdx}`}
                      className={`group/cell min-h-[90px] border-l p-1.5 ${slotIdx > 0 ? "border-t" : ""} ${isToday(date) ? "bg-primary/[0.02]" : ""}`}
                    >
                      {entries.map((entry) => (
                        <div
                          key={entry.id}
                          className="mb-1 flex items-start justify-between gap-1 rounded-lg bg-primary/5 px-2 py-1.5 text-xs leading-snug transition-colors hover:bg-primary/10"
                        >
                          <span className="font-medium">{entry.recipe.name}</span>
                          <button
                            onClick={() => removeEntry(entry.id)}
                            className="mt-0.5 shrink-0 rounded-full p-0.5 text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover/cell:opacity-100"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      ))}
                      <button
                        onClick={() => openPicker(formatDate(date), slot)}
                        className="flex w-full items-center justify-center rounded-lg p-1.5 text-muted-foreground/40 opacity-0 transition-all hover:bg-muted hover:text-muted-foreground group-hover/cell:opacity-100"
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  );
                })}
              </>
            ))}
          </div>
        </div>
      )}

      {/* Recipe Picker */}
      <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Recipe</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <SearchInput value={recipeSearch} onChange={setRecipeSearch} placeholder="Search recipes..." />
            <div className="max-h-48 space-y-0.5 overflow-y-auto">
              {recipeOptions.map((recipe) => (
                <button
                  key={recipe.id}
                  type="button"
                  className={`w-full cursor-pointer rounded-lg px-3 py-2.5 text-left text-sm transition-colors ${
                    selectedRecipe?.id === recipe.id
                      ? "bg-primary text-primary-foreground"
                      : "hover:bg-muted"
                  }`}
                  onClick={() => { setSelectedRecipe(recipe); setServings(recipe.servings); }}
                >
                  {recipe.name}
                </button>
              ))}
              {recipeOptions.length === 0 && (
                <p className="py-6 text-center text-sm text-muted-foreground">No recipes found</p>
              )}
            </div>
            {selectedRecipe && (
              <div className="space-y-2">
                <Label htmlFor="servings">Servings</Label>
                <Input id="servings" type="number" min={1} value={servings} onChange={(e) => setServings(parseInt(e.target.value, 10) || 1)} className="w-24" />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPickerOpen(false)}>Cancel</Button>
            <Button onClick={addEntry} disabled={!selectedRecipe}>Add to Plan</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
