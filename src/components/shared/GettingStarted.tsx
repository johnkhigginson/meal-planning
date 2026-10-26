"use client";

import { useSyncExternalStore } from "react";
import Link from "next/link";
import { ArrowRight, CircleCheck, Circle, X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface GettingStartedStep {
  href: string;
  label: string;
  description: string;
  done: boolean;
}

// Dismissal is remembered per user on this device. No schema change needed;
// clearing site data brings the checklist back until every step is done.
const storageKey = (userId: number) => `mlk:getting-started-dismissed:${userId}`;

// Same-tab writes don't fire "storage", so dismiss() notifies directly.
const listeners = new Set<() => void>();
function subscribe(cb: () => void) {
  listeners.add(cb);
  window.addEventListener("storage", cb);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", cb);
  };
}

function readDismissed(userId: number): boolean {
  try {
    return window.localStorage.getItem(storageKey(userId)) === "1";
  } catch {
    return false; // storage blocked (private mode): just show it
  }
}

// The new-user checklist on the dashboard. The server works out which steps
// are done from the household's data; this only handles hiding it.
export function GettingStarted({ userId, steps }: { userId: number; steps: GettingStartedStep[] }) {
  const dismissed = useSyncExternalStore(
    subscribe,
    () => readDismissed(userId),
    () => false
  );

  const doneCount = steps.filter((s) => s.done).length;
  if (dismissed || steps.length === 0 || doneCount === steps.length) return null;

  function dismiss() {
    try {
      window.localStorage.setItem(storageKey(userId), "1");
    } catch {
      // storage blocked: nothing to remember it in
    }
    listeners.forEach((cb) => cb());
  }

  return (
    <section aria-labelledby="getting-started-heading" className="rounded-3xl border bg-card p-5 sm:p-6">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="space-y-1">
          <h2 id="getting-started-heading" className="font-heading text-2xl font-semibold">
            Getting started
          </h2>
          <p className="text-sm text-muted-foreground">
            {doneCount} of {steps.length} done. Each step makes the next one more useful.
          </p>
        </div>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Hide the getting started checklist"
          className="rounded-full p-2 text-muted-foreground transition-colors duration-200 ease-out hover:bg-muted hover:text-foreground focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <ol className="grid gap-2 sm:grid-cols-2">
        {steps.map((step) => (
          <li key={step.href}>
            <Link
              href={step.href}
              className={cn(
                "group flex items-center gap-3 rounded-2xl p-3 transition-colors duration-200 ease-out hover:bg-muted",
                step.done ? "text-muted-foreground" : "border-[1.5px] border-dashed border-input"
              )}
            >
              {step.done ? (
                <CircleCheck className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
              ) : (
                <Circle className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
              )}
              <div className="min-w-0 flex-1">
                <div className={cn("font-semibold", step.done && "line-through")}>
                  {step.label}
                  <span className="sr-only">{step.done ? " (done)" : " (not done yet)"}</span>
                </div>
                <div className="text-sm text-muted-foreground">{step.description}</div>
              </div>
              {!step.done && (
                <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 group-hover:translate-x-0.5" />
              )}
            </Link>
          </li>
        ))}
      </ol>
    </section>
  );
}
