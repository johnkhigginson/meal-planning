"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { toast } from "sonner";
import { SLOT_LABELS, addMealToPlan, formatDate, getMonday, parseDate } from "@/lib/meal-plan";
import { ChevronLeft, ChevronRight, Plus, X, ShoppingCart, Loader2, Move, CalendarDays } from "lucide-react";
import { EmptyState } from "@/components/shared/EmptyState";

const ALL_MEAL_SLOTS = ["BREAKFAST", "LUNCH", "DINNER", "SNACK"] as const;
const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

interface MealPlanEntry {
  id: number;
  // Null for a free-text meal; `customName` holds its label instead.
  recipeId: number | null;
  customName: string | null;
  date: string;
  mealSlot: string;
  servings: number;
  recipe: { id: number; name: string; servings: number } | null;
}

function entryLabel(entry: MealPlanEntry): string {
  return entry.recipe?.name ?? entry.customName ?? "Meal";
}

// A recipe-backed meal links to its recipe. draggable={false} lets a drag that
// starts on the name move the meal instead of dragging the link's URL.
function EntryName({ entry }: { entry: MealPlanEntry }) {
  if (!entry.recipe) {
    return <span className="font-semibold text-muted-foreground">{entryLabel(entry)}</span>;
  }
  return (
    <Link
      href={`/recipes/${entry.recipe.id}`}
      draggable={false}
      className="font-semibold transition-colors duration-200 ease-out hover:text-primary hover:underline"
    >
      {entryLabel(entry)}
    </Link>
  );
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
  // ?week=YYYY-MM-DD opens the week containing that day ("View meal plan" on a recipe).
  const searchParams = useSearchParams();
  const [currentMonday, setCurrentMonday] = useState(() =>
    getMonday(parseDate(searchParams.get("week") ?? "") ?? new Date())
  );
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
  // "recipe" picks from the collection; "custom" is a free-text meal that
  // deliberately contributes nothing to grocery lists or the pantry.
  const [pickerMode, setPickerMode] = useState<"recipe" | "custom">("recipe");
  const [customName, setCustomName] = useState("");
  const [saving, setSaving] = useState(false);

  // Desktop drag and drop: the meal being dragged and the cell under it.
  const [draggingId, setDraggingId] = useState<number | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  // Phone "Move" dialog: the meal and where it's headed.
  const [moving, setMoving] = useState<{ entry: MealPlanEntry; date: string; mealSlot: string } | null>(null);

  const weekDates = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(currentMonday);
    d.setDate(d.getDate() + i);
    return d;
  });

  // The empty-week button starts with today's dinner, or the first day shown
  // when this isn't the current week, using a meal slot that's switched on.
  const firstPlanDay = weekDates.find(isToday) ?? weekDates[0];
  const firstPlanSlot: string = enabledSlots.includes("DINNER") ? "DINNER" : (enabledSlots[0] ?? "DINNER");

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

  const fetchPlan = useCallback(() => {
    return fetch("/api/meal-plans", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ weekStartDate: formatDate(currentMonday) }),
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: MealPlan | null) => {
        if (data) setPlan(data);
        setLoading(false);
      });
  }, [currentMonday]);

  useEffect(() => { fetchPlan(); }, [fetchPlan]);

  function loadPlan() {
    setLoading(true);
    fetchPlan();
  }

  function goToWeek(monday: Date) {
    setLoading(true);
    setCurrentMonday(monday);
  }

  function shiftWeek(days: number) {
    const d = new Date(currentMonday);
    d.setDate(d.getDate() + days);
    goToWeek(d);
  }

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
    setPickerMode("recipe");
    setCustomName("");
    setPickerOpen(true);
  }

  const canAdd = pickerMode === "recipe" ? !!selectedRecipe : !!customName.trim();

  async function addEntry() {
    if (!pickerSlot || !canAdd) return;
    setSaving(true);
    const ok = await addMealToPlan(
      pickerSlot.date,
      pickerSlot.mealSlot,
      pickerMode === "recipe"
        ? { recipeId: selectedRecipe!.id, servings }
        : { customName: customName.trim(), servings: 1 }
    );
    setSaving(false);
    if (!ok) {
      toast.error("Couldn't add that meal. Please try again.");
      return;
    }
    setPickerOpen(false);
    loadPlan();
  }

  async function removeEntry(entryId: number) {
    if (!plan) return;
    await fetch(`/api/meal-plans/${plan.id}/entries/${entryId}`, { method: "DELETE" });
    loadPlan();
  }

  async function moveEntry(entryId: number, date: string, mealSlot: string) {
    if (!plan) return;
    const entry = plan.entries.find((e) => e.id === entryId);
    if (!entry || (entry.date.split("T")[0] === date && entry.mealSlot === mealSlot)) return;
    // Move it on screen right away; reload from the server if the save fails.
    setPlan((prev) =>
      prev && {
        ...prev,
        entries: prev.entries.map((e) =>
          e.id === entryId ? { ...e, date: `${date}T00:00:00.000Z`, mealSlot } : e
        ),
      }
    );
    const res = await fetch(`/api/meal-plans/${plan.id}/entries/${entryId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date, mealSlot }),
    });
    if (!res.ok) loadPlan();
  }

  function confirmMove() {
    if (!moving) return;
    moveEntry(moving.entry.id, moving.date, moving.mealSlot);
    setMoving(null);
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
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1">
          <h1 className="text-4xl leading-tight font-medium">Meal plan</h1>
          <p className="text-muted-foreground">
            {currentMonday.toLocaleDateString("en-US", { month: "long", day: "numeric" })}
            {" - "}
            {weekDates[6].toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
          </p>
        </div>
        {/* Only recipe-backed meals produce groceries, so a plan of free-text
            meals alone has nothing to generate. */}
        <Button
          variant="outline"
          size="lg"
          className="self-start sm:self-auto"
          onClick={generateGroceryList}
          disabled={generating || !plan?.entries.some((e) => e.recipeId)}
        >
          {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShoppingCart className="h-4 w-4" />}
          Grocery list
        </Button>
      </div>

      {/* Controls */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-1.5">
          <Button variant="outline" size="icon" className="size-10" aria-label="Previous week" onClick={() => shiftWeek(-7)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="ghost" className="h-10 font-bold" onClick={() => goToWeek(getMonday(new Date()))}>Today</Button>
          <Button variant="outline" size="icon" className="size-10" aria-label="Next week" onClick={() => shiftWeek(7)}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Meals to show">
          {ALL_MEAL_SLOTS.map((slot) => {
            const on = enabledSlots.includes(slot);
            return (
              <button
                key={slot}
                type="button"
                aria-pressed={on}
                className={`inline-flex h-10 items-center rounded-full px-4 text-sm font-bold transition-colors duration-200 ease-out focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring ${
                  on
                    ? "bg-brand text-brand-foreground hover:bg-brand/85"
                    : "border-[1.5px] border-input text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
                onClick={() => {
                  const updated = enabledSlots.includes(slot) ? enabledSlots.filter((s) => s !== slot) : [...enabledSlots, slot];
                  if (updated.length === 0) return;
                  setEnabledSlots(updated);
                  fetch("/api/user/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ enabledMealSlots: updated.join(",") }) });
                }}
              >
                {SLOT_LABELS[slot]}
              </button>
            );
          })}
        </div>
      </div>

      {/* Calendar Grid */}
      {loading ? (
        <div className="flex items-center justify-center rounded-3xl border bg-card py-20 text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Loading...
        </div>
      ) : (
        <>
          {/* Empty week: say what the page is for and offer the first step.
              The grid stays below so any slot can still be picked. */}
          {plan && plan.entries.length === 0 && (
            <EmptyState
              icon={CalendarDays}
              title="Nothing planned this week"
              description="Pick what to cook each day. Meals with a recipe go straight into your grocery list."
              className="py-8"
            >
              <Button size="lg" onClick={() => openPicker(formatDate(firstPlanDay), firstPlanSlot)}>
                <Plus className="h-4 w-4" strokeWidth={2.5} />
                Plan {SLOT_LABELS[firstPlanSlot].toLowerCase()} for {firstPlanDay.toLocaleDateString("en-US", { weekday: "long" })}
              </Button>
            </EmptyState>
          )}

          {/* Desktop grid, from 1024px. Below that the side rail leaves too
              little width for seven columns, so tablets get the day cards. */}
          <div className="hidden overflow-x-auto rounded-3xl border bg-card p-5 lg:block">
            <div className="grid min-w-[52rem] gap-2" style={{ gridTemplateColumns: `80px repeat(7, minmax(0, 1fr))` }}>
              <div />
              {weekDates.map((date, i) => (
                <div
                  key={i}
                  aria-current={isToday(date) ? "date" : undefined}
                  className={`rounded-2xl px-3 py-2 text-center ${isToday(date) ? "bg-brand text-brand-foreground" : ""}`}
                >
                  <div className={`text-xs font-extrabold tracking-[0.08em] uppercase ${isToday(date) ? "" : "text-muted-foreground"}`}>{DAY_LABELS[i]}</div>
                  <div className="font-heading text-xl leading-tight font-semibold tabular-nums">{date.getDate()}</div>
                </div>
              ))}
              {activeSlots.map((slot) => (
                <>
                  <div key={`label-${slot}`} className="flex items-start pt-3 text-xs font-extrabold tracking-[0.08em] text-muted-foreground uppercase">
                    {SLOT_LABELS[slot]}
                  </div>
                  {weekDates.map((date, dayIdx) => {
                    const entries = getEntries(date, slot);
                    const dateStr = formatDate(date);
                    const cellKey = `${dateStr}|${slot}`;
                    const cellTint =
                      dropTarget === cellKey
                        ? "bg-brand-soft ring-2 ring-inset ring-primary/50"
                        : entries.length > 0
                          ? isToday(date)
                            ? "bg-muted ring-2 ring-inset ring-brand"
                            : "bg-muted"
                          : isToday(date)
                            ? "border-[1.5px] border-dashed border-brand"
                            : "border-[1.5px] border-dashed border-input";
                    return (
                      <div
                        key={`${slot}-${dayIdx}`}
                        className={`group/cell flex min-h-[90px] flex-col gap-1 rounded-2xl p-1.5 transition-colors duration-200 ease-out ${cellTint}`}
                        onDragOver={(e) => {
                          if (draggingId == null) return;
                          e.preventDefault();
                          e.dataTransfer.dropEffect = "move";
                          setDropTarget(cellKey);
                        }}
                        onDrop={(e) => {
                          e.preventDefault();
                          const id = draggingId;
                          setDraggingId(null);
                          setDropTarget(null);
                          if (id != null) moveEntry(id, dateStr, slot);
                        }}
                      >
                        {entries.map((entry) => (
                          <div
                            key={entry.id}
                            draggable
                            onDragStart={(e) => {
                              e.dataTransfer.setData("text/plain", String(entry.id));
                              e.dataTransfer.effectAllowed = "move";
                              setDraggingId(entry.id);
                            }}
                            onDragEnd={() => {
                              setDraggingId(null);
                              setDropTarget(null);
                            }}
                            className={`flex cursor-grab items-start justify-between gap-1 rounded-xl px-2 py-1.5 text-[13px] leading-snug font-semibold transition-colors duration-200 ease-out active:cursor-grabbing ${
                              entry.recipe
                                ? "border border-border bg-card hover:border-input"
                                : "border border-dashed border-input bg-transparent hover:bg-card"
                            } ${draggingId === entry.id ? "opacity-40" : ""}`}
                            title={entry.recipe ? "Drag to move" : "Added by name, not included in the grocery list. Drag to move."}
                          >
                            <EntryName entry={entry} />
                            {/* Shown on hover, and always on touch screens (a
                                tablet gets this grid but can't hover or
                                reliably drag). */}
                            <div className="mt-0.5 flex shrink-0 opacity-0 transition-opacity duration-200 ease-out group-hover/cell:opacity-100 focus-within:opacity-100 [@media(hover:none)]:opacity-100">
                              <button
                                onClick={() => setMoving({ entry, date: dateStr, mealSlot: slot })}
                                aria-label={`Move ${entryLabel(entry)}`}
                                className="rounded-full p-0.5 text-muted-foreground hover:text-foreground"
                              >
                                <Move className="h-3 w-3" />
                              </button>
                              <button
                                onClick={() => removeEntry(entry.id)}
                                aria-label={`Remove ${entryLabel(entry)}`}
                                className="rounded-full p-0.5 text-muted-foreground hover:text-destructive"
                              >
                                <X className="h-3 w-3" />
                              </button>
                            </div>
                          </div>
                        ))}
                        {/* An empty cell is one big button, so a click anywhere
                            in it (or Enter/Space when focused) adds a meal. */}
                        <button
                          type="button"
                          onClick={() => openPicker(dateStr, slot)}
                          aria-label={`Add ${SLOT_LABELS[slot].toLowerCase()} on ${DAY_LABELS[dayIdx]} ${date.getDate()}`}
                          className={`flex w-full items-center justify-center rounded-xl p-1.5 text-muted-foreground opacity-0 transition-[opacity,background-color,color] duration-200 ease-out group-hover/cell:opacity-100 hover:bg-card hover:text-foreground focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-ring [@media(hover:none)]:opacity-100 ${
                            entries.length === 0 ? "-m-1.5 flex-1 cursor-pointer rounded-2xl" : "mt-auto"
                          }`}
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

          {/* Mobile: stacked day cards */}
          <div className="space-y-3 lg:hidden">
            {weekDates.map((date, i) => (
              <div
                key={i}
                aria-current={isToday(date) ? "date" : undefined}
                className={`overflow-hidden rounded-2xl border bg-card ${isToday(date) ? "border-brand" : ""}`}
              >
                <div className={`flex items-center justify-between px-4 py-2.5 ${isToday(date) ? "bg-brand text-brand-foreground" : "border-b bg-muted"}`}>
                  <span className="text-sm font-extrabold tracking-[0.08em] uppercase">{DAY_LABELS[i]}</span>
                  <span className={`text-sm font-bold ${isToday(date) ? "" : "text-muted-foreground"}`}>
                    {date.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                  </span>
                </div>
                <div className="space-y-3 p-3">
                  {activeSlots.map((slot) => {
                    const entries = getEntries(date, slot);
                    return (
                      <div key={slot}>
                        <div className="mb-1.5 text-xs font-extrabold tracking-[0.08em] text-muted-foreground uppercase">
                          {SLOT_LABELS[slot]}
                        </div>
                        {entries.length > 0 ? (
                          <div className="space-y-1.5 rounded-2xl bg-muted p-1.5">
                            {entries.map((entry) => (
                              <div
                                key={entry.id}
                                className={`flex min-h-11 items-center justify-between gap-2 rounded-xl px-3 py-1.5 text-sm font-semibold ${
                                  entry.recipe
                                    ? "border border-border bg-card"
                                    : "border border-dashed border-input"
                                }`}
                              >
                                <EntryName entry={entry} />
                                <div className="flex shrink-0 items-center">
                                  <button
                                    onClick={() =>
                                      setMoving({ entry, date: entry.date.split("T")[0], mealSlot: entry.mealSlot })
                                    }
                                    aria-label={`Move ${entryLabel(entry)}`}
                                    className="flex size-9 items-center justify-center rounded-full text-muted-foreground transition-colors duration-200 ease-out hover:bg-muted hover:text-foreground"
                                  >
                                    <Move className="h-4 w-4" />
                                  </button>
                                  <button
                                    onClick={() => removeEntry(entry.id)}
                                    aria-label={`Remove ${entryLabel(entry)}`}
                                    className="flex size-9 items-center justify-center rounded-full text-muted-foreground transition-colors duration-200 ease-out hover:bg-muted hover:text-destructive"
                                  >
                                    <X className="h-4 w-4" />
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => openPicker(formatDate(date), slot)}
                            aria-label={`Add ${SLOT_LABELS[slot].toLowerCase()} on ${DAY_LABELS[i]} ${date.getDate()}`}
                            className="flex min-h-11 w-full items-center justify-center gap-1.5 rounded-2xl border-[1.5px] border-dashed border-input text-sm font-bold text-muted-foreground transition-colors duration-200 ease-out hover:bg-muted hover:text-foreground"
                          >
                            <Plus className="h-3.5 w-3.5" />
                            Add
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Recipe Picker */}
      <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add to plan</DialogTitle>
            {pickerSlot && (
              <DialogDescription>
                {SLOT_LABELS[pickerSlot.mealSlot]} on{" "}
                {parseDate(pickerSlot.date)?.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
              </DialogDescription>
            )}
          </DialogHeader>
          <div className="space-y-4">
            {/* Choose a saved recipe, or just jot down a meal name. */}
            <div className="flex gap-1.5" role="group" aria-label="Meal type">
              <Button
                type="button"
                size="sm"
                aria-pressed={pickerMode === "recipe"}
                variant={pickerMode === "recipe" ? "default" : "outline"}
                onClick={() => setPickerMode("recipe")}
              >
                Recipe
              </Button>
              <Button
                type="button"
                size="sm"
                aria-pressed={pickerMode === "custom"}
                variant={pickerMode === "custom" ? "default" : "outline"}
                onClick={() => setPickerMode("custom")}
              >
                Just a name
              </Button>
            </div>

            {pickerMode === "recipe" ? (
              <>
                {/* The server does the searching, so cmdk's own filter is off.
                    Arrow keys move through results; Enter picks one. */}
                <Command shouldFilter={false} label="Recipes" className="rounded-2xl! border">
                  <CommandInput
                    value={recipeSearch}
                    onValueChange={setRecipeSearch}
                    placeholder="Search recipes..."
                    aria-label="Search recipes"
                    autoFocus
                  />
                  <CommandList className="max-h-48">
                    <CommandEmpty className="text-muted-foreground">No recipes found</CommandEmpty>
                    {recipeOptions.map((recipe) => (
                      <CommandItem
                        key={recipe.id}
                        value={String(recipe.id)}
                        data-checked={selectedRecipe?.id === recipe.id}
                        aria-checked={selectedRecipe?.id === recipe.id}
                        className="cursor-pointer py-2.5"
                        onSelect={() => { setSelectedRecipe(recipe); setServings(recipe.servings); }}
                      >
                        {recipe.name}
                      </CommandItem>
                    ))}
                  </CommandList>
                </Command>
                {selectedRecipe && (
                  <div className="space-y-2">
                    <Label htmlFor="servings">Servings</Label>
                    <Input id="servings" type="number" min={1} value={servings} onChange={(e) => setServings(parseInt(e.target.value, 10) || 1)} className="w-24" />
                  </div>
                )}
              </>
            ) : (
              <div className="space-y-2">
                <Label htmlFor="custom-meal">Meal</Label>
                <Input
                  id="custom-meal"
                  value={customName}
                  maxLength={200}
                  autoFocus
                  placeholder="Leftovers, Takeout, Dinner at Mom's…"
                  onChange={(e) => setCustomName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && canAdd) { e.preventDefault(); addEntry(); } }}
                />
                <p className="text-xs text-muted-foreground">
                  Note: meals added by name aren&apos;t tied to a recipe, so they won&apos;t add
                  anything to your grocery list or pantry.
                </p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPickerOpen(false)}>Cancel</Button>
            <Button onClick={addEntry} disabled={!canAdd || saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Add to plan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Move a meal without dragging (phones and touch tablets) */}
      <Dialog open={moving != null} onOpenChange={(open) => { if (!open) setMoving(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Move {moving ? entryLabel(moving.entry) : "meal"}</DialogTitle>
          </DialogHeader>
          {moving && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Day</Label>
                <div className="grid grid-cols-7 gap-1">
                  {weekDates.map((date, i) => {
                    const dateStr = formatDate(date);
                    return (
                      <Button
                        key={dateStr}
                        type="button"
                        size="sm"
                        variant={moving.date === dateStr ? "default" : "outline"}
                        className="h-auto min-h-11 flex-col gap-0 rounded-2xl px-0 py-1.5"
                        onClick={() => setMoving({ ...moving, date: dateStr })}
                      >
                        <span className="text-[10px] font-extrabold uppercase">{DAY_LABELS[i]}</span>
                        <span>{date.getDate()}</span>
                      </Button>
                    );
                  })}
                </div>
              </div>
              <div className="space-y-2">
                <Label>Meal</Label>
                <div className="flex flex-wrap gap-1.5">
                  {activeSlots.map((slot) => (
                    <Button
                      key={slot}
                      type="button"
                      size="sm"
                      variant={moving.mealSlot === slot ? "default" : "outline"}
                      onClick={() => setMoving({ ...moving, mealSlot: slot })}
                    >
                      {SLOT_LABELS[slot]}
                    </Button>
                  ))}
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setMoving(null)}>Cancel</Button>
            <Button onClick={confirmMove}>Move</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
