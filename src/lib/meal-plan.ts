// Client helpers shared by the meal plan page and "Add to meal plan" on a recipe.

export const SLOT_LABELS: Record<string, string> = {
  BREAKFAST: "Breakfast",
  LUNCH: "Lunch",
  DINNER: "Dinner",
  SNACK: "Snack",
};

// Plans are stored per week, keyed by the week's Monday.
export function getMonday(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

// "YYYY-MM-DD" in local time. toISOString() would shift local midnight into
// the previous day for anyone east of UTC.
export function formatDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

// "YYYY-MM-DD" -> local midnight, or null when it isn't a real date.
export function parseDate(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const d = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return formatDate(d) === value ? d : null;
}

export type NewMeal =
  | { recipeId: number; servings: number }
  | { customName: string; servings: number };

// Adds a meal on a date, creating that week's plan first if there isn't one.
// POST /api/meal-plans returns the existing plan when the week already has one.
export async function addMealToPlan(date: string, mealSlot: string, meal: NewMeal): Promise<boolean> {
  const day = parseDate(date);
  if (!day) return false;
  const planRes = await fetch("/api/meal-plans", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ weekStartDate: formatDate(getMonday(day)) }),
  });
  if (!planRes.ok) return false;
  const plan: { id: number } = await planRes.json();
  const res = await fetch(`/api/meal-plans/${plan.id}/entries`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...meal, date, mealSlot }),
  });
  return res.ok;
}
