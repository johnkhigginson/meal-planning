"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CalendarPlus, Loader2 } from "lucide-react";
import { MEAL_SLOTS } from "@/lib/constants";
import { SLOT_LABELS, addMealToPlan, formatDate, parseDate } from "@/lib/meal-plan";

interface AddToMealPlanButtonProps {
  recipeId: number;
  recipeName: string;
  servings: number;
  // The user's meal slots ("BREAKFAST,LUNCH,..."), same setting the meal plan page uses.
  enabledMealSlots: string;
}

export function AddToMealPlanButton({ recipeId, recipeName, servings: baseServings, enabledMealSlots }: AddToMealPlanButtonProps) {
  const router = useRouter();
  const enabled = MEAL_SLOTS.filter((s) => enabledMealSlots.split(",").includes(s));
  const slots = enabled.length > 0 ? enabled : [...MEAL_SLOTS];
  const defaultSlot = slots.includes("DINNER") ? "DINNER" : slots[0];

  const [open, setOpen] = useState(false);
  const [date, setDate] = useState("");
  const [mealSlot, setMealSlot] = useState<string>(defaultSlot);
  const [servings, setServings] = useState(baseServings);
  const [saving, setSaving] = useState(false);

  // Start from tonight's dinner (or the first slot) each time it opens.
  function handleOpenChange(next: boolean) {
    if (next) {
      setDate(formatDate(new Date()));
      setMealSlot(defaultSlot);
      setServings(baseServings);
    }
    setOpen(next);
  }

  const day = parseDate(date);

  async function handleAdd() {
    if (!day) return;
    setSaving(true);
    const ok = await addMealToPlan(date, mealSlot, { recipeId, servings });
    setSaving(false);
    if (!ok) {
      toast.error("Couldn't add this recipe to your meal plan. Please try again.");
      return;
    }
    setOpen(false);
    toast.success(
      `Added to ${SLOT_LABELS[mealSlot].toLowerCase()} on ${day.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })}`,
      { action: { label: "View meal plan", onClick: () => router.push(`/meal-plan?week=${date}`) } }
    );
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger render={<Button variant="outline" size="sm" />}>
        <CalendarPlus className="mr-1 h-4 w-4" />
        Add to meal plan
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add to meal plan</DialogTitle>
          <DialogDescription>Pick a day and meal for {recipeName}.</DialogDescription>
        </DialogHeader>
        <form
          id="add-to-meal-plan"
          className="space-y-4"
          onSubmit={(e) => { e.preventDefault(); handleAdd(); }}
        >
          <div className="space-y-2">
            <Label htmlFor="meal-plan-date">Day</Label>
            <Input
              id="meal-plan-date"
              type="date"
              required
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-auto"
            />
          </div>
          <div className="space-y-2">
            <Label id="meal-plan-slot-label">Meal</Label>
            <div className="flex flex-wrap gap-1.5" role="group" aria-labelledby="meal-plan-slot-label">
              {slots.map((slot) => (
                <Button
                  key={slot}
                  type="button"
                  size="sm"
                  aria-pressed={mealSlot === slot}
                  variant={mealSlot === slot ? "default" : "outline"}
                  onClick={() => setMealSlot(slot)}
                >
                  {SLOT_LABELS[slot]}
                </Button>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="meal-plan-servings">Servings</Label>
            <Input
              id="meal-plan-servings"
              type="number"
              min={1}
              value={servings}
              onChange={(e) => setServings(parseInt(e.target.value, 10) || 1)}
              className="w-24"
            />
          </div>
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button type="submit" form="add-to-meal-plan" disabled={!day || saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Add to plan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
