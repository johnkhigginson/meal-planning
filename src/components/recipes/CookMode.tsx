"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChefHat, ChevronLeft, ChevronRight, List, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { trackEvent } from "@/lib/analytics";
import { cn } from "@/lib/utils";
import type { CookStep } from "@/lib/parse-steps";

// Keeps the screen on while cooking. Fails quietly where the Screen Wake Lock
// API is missing or denied (older Safari, low battery mode, insecure origin).
// The browser drops the lock whenever the tab is hidden, so it is taken again
// when the page becomes visible.
function useWakeLock(active: boolean) {
  useEffect(() => {
    if (!active || typeof navigator === "undefined" || !("wakeLock" in navigator)) return;

    let sentinel: WakeLockSentinel | null = null;
    let pending = false;
    let cancelled = false;

    async function acquire() {
      if (pending || document.visibilityState !== "visible") return;
      if (sentinel && !sentinel.released) return;
      pending = true;
      try {
        const lock = await navigator.wakeLock.request("screen");
        if (cancelled) {
          lock.release().catch(() => {});
        } else {
          sentinel = lock;
        }
      } catch {
        // Not allowed right now; the screen just sleeps as usual.
      } finally {
        pending = false;
      }
    }

    function onVisibilityChange() {
      if (document.visibilityState === "visible") acquire();
    }

    acquire();
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisibilityChange);
      sentinel?.release().catch(() => {});
      sentinel = null;
    };
  }, [active]);
}

export function CookMode({ recipeName, steps }: { recipeName: string; steps: CookStep[] }) {
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);
  const [showOverview, setShowOverview] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const nextRef = useRef<HTMLButtonElement>(null);

  useWakeLock(open);

  const last = steps.length - 1;
  const goTo = useCallback((i: number) => setIndex(Math.max(0, Math.min(last, i))), [last]);

  const close = useCallback(() => {
    setOpen(false);
    setShowOverview(false);
    triggerRef.current?.focus();
  }, []);

  // Keyboard: arrows step through, Escape exits. Body scroll is locked so the
  // page underneath does not move while hands are busy.
  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      if (e.key === "ArrowRight" || e.key === "ArrowDown") {
        e.preventDefault();
        setIndex((i) => Math.min(last, i + 1));
      } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
        e.preventDefault();
        setIndex((i) => Math.max(0, i - 1));
      } else if (e.key === "Escape") {
        e.preventDefault();
        close();
      }
    }
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKeyDown);
    nextRef.current?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, last, close]);

  if (steps.length === 0) return null;

  const step = steps[index];
  const isLast = index === last;

  const overlay = (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Cook mode: ${recipeName}`}
      className="fixed inset-0 z-[100] flex flex-col bg-background pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] text-foreground"
    >
      {/* Header */}
      <div className="flex items-center gap-3 border-b px-4 py-2 sm:px-6">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm text-muted-foreground">{recipeName}</p>
          <p className="text-lg font-semibold" aria-live="polite">
            Step {index + 1} of {steps.length}
          </p>
        </div>
        <Button
          type="button"
          variant={showOverview ? "secondary" : "outline"}
          className="h-14 min-w-14 px-4 text-base"
          aria-pressed={showOverview}
          onClick={() => setShowOverview((v) => !v)}
        >
          <List className="size-6" />
          <span className="hidden sm:inline">All steps</span>
        </Button>
        <Button
          type="button"
          variant="outline"
          className="h-14 min-w-14 px-4 text-base"
          onClick={close}
          aria-label="Exit cook mode"
        >
          <X className="size-6" />
          <span className="hidden sm:inline">Exit</span>
        </Button>
      </div>

      {/* Body: one big step, or the overview list */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {showOverview ? (
          <ol className="mx-auto max-w-3xl space-y-2 p-4 sm:p-6">
            {steps.map((s, i) => (
              <li key={i}>
                {s.section && s.section !== steps[i - 1]?.section && (
                  <p className="mt-4 mb-2 font-heading text-xl font-semibold">{s.section}</p>
                )}
                <button
                  type="button"
                  onClick={() => {
                    goTo(i);
                    setShowOverview(false);
                  }}
                  aria-current={i === index ? "step" : undefined}
                  className={cn(
                    "flex min-h-14 w-full items-start gap-4 rounded-2xl border p-4 text-left text-lg leading-snug transition-colors hover:bg-muted",
                    i === index && "border-brand bg-muted"
                  )}
                >
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-secondary font-semibold">
                    {i + 1}
                  </span>
                  <span className="pt-1">{s.text}</span>
                </button>
              </li>
            ))}
          </ol>
        ) : (
          <div className="mx-auto flex min-h-full max-w-4xl flex-col justify-center gap-4 p-6 sm:p-10">
            {step.section && (
              <p className="text-sm font-extrabold tracking-[0.08em] text-muted-foreground uppercase">
                {step.section}
              </p>
            )}
            <p className="text-[clamp(1.75rem,4.5vw,3rem)] leading-snug font-medium text-pretty">{step.text}</p>
          </div>
        )}
      </div>

      {/* Footer navigation */}
      <div className="grid grid-cols-2 gap-3 border-t p-3 sm:p-4">
        <Button
          type="button"
          variant="outline"
          className="h-16 text-lg"
          disabled={index === 0}
          onClick={() => goTo(index - 1)}
        >
          <ChevronLeft className="size-6" />
          Previous
        </Button>
        <Button
          ref={nextRef}
          type="button"
          className="h-16 text-lg"
          onClick={() => (isLast ? close() : goTo(index + 1))}
        >
          {isLast ? "Done" : "Next"}
          {!isLast && <ChevronRight className="size-6" />}
        </Button>
      </div>
    </div>
  );

  return (
    <>
      <Button
        ref={triggerRef}
        type="button"
        variant="outline"
        size="sm"
        className="print:hidden"
        onClick={() => {
          trackEvent("recipe_cook_mode");
          setIndex(0);
          setOpen(true);
        }}
      >
        <ChefHat className="mr-1.5 h-4 w-4" />
        Cook mode
      </Button>
      {open && createPortal(overlay, document.body)}
    </>
  );
}
