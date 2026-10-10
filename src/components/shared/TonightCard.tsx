"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, CalendarDays, UtensilsCrossed } from "lucide-react";
import { cn } from "@/lib/utils";

interface TonightMeal {
  name: string;
  mealSlot: string;
  recipeId: number | null;
  pantry: { onHand: number; total: number } | null;
}

const liftCard =
  "hover:-translate-y-0.5 hover:border-input hover:shadow-[0_14px_30px_-18px_rgb(60_45_10/0.45)]";

// Today's planned meal. Fetched client-side so "today" follows the browser's
// time zone rather than the server's.
export function TonightCard() {
  // undefined while loading, null when nothing is planned or the request failed.
  const [meal, setMeal] = useState<TonightMeal | null | undefined>(undefined);

  useEffect(() => {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    fetch(`/api/dashboard/tonight?tz=${encodeURIComponent(tz)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { meal: TonightMeal | null } | null) => setMeal(data?.meal ?? null))
      .catch(() => setMeal(null));
  }, []);

  return (
    <section aria-labelledby="tonight-heading" className="rounded-3xl border bg-card p-5 sm:p-6">
      <div className="mb-4 flex items-baseline justify-between gap-3">
        <h2 id="tonight-heading" className="font-heading text-2xl font-semibold">
          Tonight
        </h2>
        {meal && meal.mealSlot !== "DINNER" && (
          <span className="text-xs font-extrabold text-muted-foreground uppercase">{meal.mealSlot.toLowerCase()}</span>
        )}
      </div>
      {meal === undefined ? (
        <div className="h-[4.75rem] animate-pulse rounded-2xl bg-muted" aria-busy="true" aria-label="Loading" />
      ) : meal === null ? (
        <Link
          href="/meal-plan"
          className="flex items-center gap-4 rounded-2xl border-[1.5px] border-dashed border-input p-5 transition-colors hover:bg-muted"
        >
          <CalendarDays className="h-6 w-6 text-primary" />
          <div className="flex-1">
            <div className="font-semibold">Nothing planned tonight</div>
            <div className="text-sm text-muted-foreground">Pick a meal in your meal plan</div>
          </div>
          <ArrowRight className="h-4 w-4 text-muted-foreground" />
        </Link>
      ) : meal.recipeId ? (
        <Link
          href={`/recipes/${meal.recipeId}`}
          className={cn(
            "group flex items-center gap-4 rounded-2xl bg-muted p-5 transition-[transform,box-shadow,border-color] duration-200 ease-out",
            liftCard
          )}
        >
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand text-brand-foreground">
            <UtensilsCrossed className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate font-bold">{meal.name}</div>
            {meal.pantry && (
              <div className="text-sm text-muted-foreground">
                {meal.pantry.onHand} of {meal.pantry.total} ingredients on hand
              </div>
            )}
          </div>
          <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform duration-200 group-hover:translate-x-0.5" />
        </Link>
      ) : (
        <div className="flex items-center gap-4 rounded-2xl bg-muted p-5">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand text-brand-foreground">
            <UtensilsCrossed className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1 truncate font-bold">{meal.name}</div>
        </div>
      )}
    </section>
  );
}
