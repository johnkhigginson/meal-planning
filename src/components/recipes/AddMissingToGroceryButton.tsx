"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Loader2, ShoppingCart } from "lucide-react";

type Status =
  | { kind: "idle" }
  | { kind: "success"; message: string; listId: number }
  | { kind: "error"; message: string };

function plural(n: number, word: string) {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

export function AddMissingToGroceryButton({ recipeId, servings }: { recipeId: number; servings: number }) {
  const [adding, setAdding] = useState(false);
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  async function add() {
    setAdding(true);
    setStatus({ kind: "idle" });
    const res = await fetch(`/api/recipes/${recipeId}/grocery-list`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ servings }),
    }).catch(() => null);
    const data = res ? await res.json().catch(() => null) : null;
    if (res?.ok && data) {
      const added: number = data.added.length;
      const skipped: number = data.alreadyListed.length;
      const parts = [
        added > 0 ? `Added ${plural(added, "item")}` : "Nothing new to add",
        skipped > 0 ? `${plural(skipped, "item")} already on the list` : null,
      ].filter(Boolean);
      setStatus({ kind: "success", message: `${parts.join(", ")}.`, listId: data.groceryListId });
    } else {
      setStatus({ kind: "error", message: data?.error ?? "Couldn't update the grocery list. Try again." });
    }
    setAdding(false);
  }

  return (
    <div className="space-y-1.5 print:hidden">
      <Button type="button" variant="outline" size="sm" onClick={add} disabled={adding}>
        {adding ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <ShoppingCart className="mr-1 h-4 w-4" />}
        Add missing to grocery list
      </Button>
      <p role="status" className="text-sm">
        {status.kind === "success" && (
          <>
            {status.message}{" "}
            <Link href={`/grocery-list?id=${status.listId}`} className="font-bold text-primary hover:underline">
              View list
            </Link>
          </>
        )}
        {status.kind === "error" && <span className="text-destructive">{status.message}</span>}
      </p>
    </div>
  );
}
