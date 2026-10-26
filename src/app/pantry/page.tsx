"use client";

import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { SearchInput } from "@/components/shared/SearchInput";
import Link from "next/link";
import { toast } from "sonner";
import { Plus, Trash2, Save, Upload, Loader2, Receipt, Package, ChevronDown } from "lucide-react";
import { PageLoader } from "@/components/shared/PageLoader";
import { EmptyState } from "@/components/shared/EmptyState";
import { formatAmount } from "@/lib/ingredient-format";

interface Unit {
  id: number;
  name: string;
  abbreviation: string;
  unitType: string;
}

interface PantryItem {
  id: number;
  ingredientId: number;
  quantity: number;
  unitId: number;
  expirationDate: string | null;
  ingredient: { id: number; name: string; category: string | null };
  unit: Unit;
}

interface Ingredient {
  id: number;
  name: string;
  defaultUnitId?: number | null;
}

interface ParsedReceiptItem {
  rawName: string;
  genericName: string;
  brand: string | null;
  size: string | null;
  quantity: number;
  unit: string;
  price: number | null;
  category: string | null;
  isIngredient: boolean;
  selected: boolean;
  ingredientId: number | null;
  unitId: number | null;
}

export default function PantryPage() {
  const [items, setItems] = useState<PantryItem[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  // Add form state
  const [showAdd, setShowAdd] = useState(false);
  const [addQuery, setAddQuery] = useState("");
  const [suggestions, setSuggestions] = useState<Ingredient[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedIngredient, setSelectedIngredient] = useState<Ingredient | null>(null);
  // Kept as typed so the box can be cleared; blank saves as 1.
  const [addQty, setAddQty] = useState("1");
  const [addUnitId, setAddUnitId] = useState<number>(0);
  const [defaultUnitId, setDefaultUnitId] = useState<number>(0);
  const [addError, setAddError] = useState<string | null>(null);
  const [addStatus, setAddStatus] = useState<string | null>(null);
  const [savingAdd, setSavingAdd] = useState(false);
  const suggestRef = useRef<HTMLDivElement>(null);
  const addNameRef = useRef<HTMLInputElement>(null);

  // Inline edit state
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editQty, setEditQty] = useState<number>(0);

  // Receipt upload state
  const receiptInputRef = useRef<HTMLInputElement>(null);
  const [parsingReceipt, setParsingReceipt] = useState(false);
  const [receiptError, setReceiptError] = useState<string | null>(null);
  const [receiptItems, setReceiptItems] = useState<ParsedReceiptItem[]>([]);
  const [receiptDialogOpen, setReceiptDialogOpen] = useState(false);
  const [receiptStoreName, setReceiptStoreName] = useState<string | null>(null);
  const [importingReceipt, setImportingReceipt] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch("/api/inventory").then((r) => r.json()),
      fetch("/api/units").then((r) => r.json()),
    ]).then(([inv, u]) => {
      setItems(inv);
      setUnits(u);
      if (u.length > 0) {
        const each = u.find((x: Unit) => x.name === "each")?.id || u[0].id;
        setAddUnitId(each);
        setDefaultUnitId(each);
      }
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    if (addQuery.length < 2) { setSuggestions([]); return; }
    const timer = setTimeout(async () => {
      const res = await fetch(`/api/ingredients?q=${encodeURIComponent(addQuery)}`);
      if (res.ok) setSuggestions(await res.json());
    }, 300);
    return () => clearTimeout(timer);
  }, [addQuery]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (suggestRef.current && !suggestRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function findUnitId(unitName: string): number | null {
    const lower = unitName.toLowerCase();
    const match = units.find(
      (u) =>
        u.name.toLowerCase() === lower ||
        u.abbreviation.toLowerCase() === lower
    );
    return match?.id ?? null;
  }

  // Pick a suggestion: use it, and its usual unit when it has one.
  function chooseIngredient(ingredient: Ingredient) {
    setSelectedIngredient(ingredient);
    setAddQuery(ingredient.name);
    setShowSuggestions(false);
    setAddError(null);
    if (ingredient.defaultUnitId) setAddUnitId(ingredient.defaultUnitId);
  }

  // One submit handles every path: a picked suggestion, an exact match, or a
  // new name (the ingredients endpoint returns an existing row for a name it
  // already knows, so this never makes duplicates). The form stays open and
  // the name box keeps focus, so several items can go in one after another.
  async function addItem(e?: React.FormEvent) {
    e?.preventDefault();
    if (savingAdd) return;
    const name = addQuery.trim();
    if (!name) {
      setAddError("Type an ingredient name.");
      addNameRef.current?.focus();
      return;
    }
    const qty = addQty.trim() === "" ? 1 : Number(addQty);
    if (!Number.isFinite(qty) || qty <= 0) {
      setAddError("Enter an amount above 0, or leave it blank for 1.");
      return;
    }
    if (!addUnitId) {
      setAddError("Pick a unit.");
      return;
    }

    setSavingAdd(true);
    setAddError(null);
    setAddStatus(null);
    try {
      let ingredient =
        selectedIngredient ?? suggestions.find((s) => s.name.toLowerCase() === name.toLowerCase()) ?? null;
      if (!ingredient) {
        const created = await fetch("/api/ingredients", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name }),
        });
        if (!created.ok) {
          setAddError("Couldn't add that ingredient. Please try again.");
          return;
        }
        ingredient = await created.json();
      }
      if (!ingredient) return;

      const res = await fetch("/api/inventory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ingredientId: ingredient.id, quantity: qty, unitId: addUnitId }),
      });
      if (!res.ok) {
        setAddError("Couldn't save that item. Please try again.");
        return;
      }
      const item: PantryItem = await res.json();
      const replaced = items.some((i) => i.ingredientId === item.ingredientId);
      setItems((prev) => {
        const idx = prev.findIndex((i) => i.ingredientId === item.ingredientId);
        if (idx >= 0) {
          const updated = [...prev];
          updated[idx] = item;
          return updated;
        }
        return [...prev, item].sort((a, b) =>
          a.ingredient.name.localeCompare(b.ingredient.name)
        );
      });
      setAddStatus(
        `${replaced ? "Updated" : "Added"} ${item.ingredient.name}: ${formatAmount(item.quantity, item.unit.abbreviation)}.`
      );
      clearAddFields();
      addNameRef.current?.focus();
    } finally {
      setSavingAdd(false);
    }
  }

  function clearAddFields() {
    setAddQuery("");
    setSelectedIngredient(null);
    setSuggestions([]);
    setShowSuggestions(false);
    setAddQty("1");
    setAddUnitId(defaultUnitId);
    setAddError(null);
  }

  function resetAdd() {
    clearAddFields();
    setAddStatus(null);
    setShowAdd(false);
  }

  async function saveEdit(item: PantryItem) {
    const res = await fetch(`/api/inventory/${item.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ quantity: editQty }),
    });
    if (res.ok) {
      const updated = await res.json();
      setItems((prev) => prev.map((i) => (i.id === updated.id ? updated : i)));
    }
    setEditingId(null);
  }

  // Puts a removed item back. The add endpoint is an upsert keyed on the
  // ingredient, so a second Undo tap or a re-added item can't make a duplicate.
  async function restoreItem(item: PantryItem) {
    const res = await fetch("/api/inventory", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ingredientId: item.ingredientId,
        quantity: item.quantity,
        unitId: item.unitId,
        ...(item.expirationDate ? { expirationDate: item.expirationDate } : {}),
      }),
    });
    if (!res.ok) {
      toast.error(`Couldn't restore ${item.ingredient.name}. Please add it again.`);
      return;
    }
    const restored: PantryItem = await res.json();
    setItems((prev) =>
      [...prev.filter((i) => i.ingredientId !== restored.ingredientId), restored].sort((a, b) =>
        a.ingredient.name.localeCompare(b.ingredient.name)
      )
    );
  }

  // Removes at once, then offers a few seconds to take it back. The server
  // delete happens right away and Undo recreates the row with the same fields,
  // so leaving the page during the toast can never lose or resurrect an item.
  async function deleteItem(item: PantryItem) {
    setItems((prev) => prev.filter((i) => i.id !== item.id));
    const res = await fetch(`/api/inventory/${item.id}`, { method: "DELETE" });
    if (!res.ok && res.status !== 404) {
      setItems((prev) =>
        [...prev, item].sort((a, b) => a.ingredient.name.localeCompare(b.ingredient.name))
      );
      toast.error(`Couldn't remove ${item.ingredient.name}. Please try again.`);
      return;
    }
    toast(`Removed ${item.ingredient.name}.`, {
      duration: 6000,
      action: { label: "Undo", onClick: () => void restoreItem(item) },
    });
  }

  // ─── Receipt handling ──────────────────────────────────────

  async function handleReceiptUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setParsingReceipt(true);
    setReceiptError(null);

    try {
      const formData = new FormData();
      formData.append("receipt", file);

      const res = await fetch("/api/receipts/parse", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const err = await res.json();
        setReceiptError(err.error || "Failed to parse receipt");
        return;
      }

      const data = await res.json();
      setReceiptStoreName(data.storeName || null);

      const parsed: ParsedReceiptItem[] = (data.items || []).map(
        (item: { rawName?: string; genericName?: string; name?: string; brand?: string; size?: string; quantity?: number; unit?: string; price?: number; category?: string; isIngredient?: boolean }) => ({
          rawName: item.rawName || item.name || "",
          genericName: item.genericName || item.name || "",
          brand: item.brand || null,
          size: item.size || null,
          quantity: item.quantity || 1,
          unit: item.unit || "each",
          price: item.price || null,
          category: item.category || null,
          isIngredient: item.isIngredient !== false,
          selected: item.isIngredient !== false,
          ingredientId: null,
          unitId: findUnitId(item.unit || "each"),
        })
      );

      setReceiptItems(parsed);
      setReceiptDialogOpen(true);
    } catch {
      setReceiptError("Failed to parse receipt");
    } finally {
      setParsingReceipt(false);
      if (receiptInputRef.current) receiptInputRef.current.value = "";
    }
  }

  function toggleReceiptItem(index: number) {
    setReceiptItems((prev) =>
      prev.map((item, i) =>
        i === index ? { ...item, selected: !item.selected } : item
      )
    );
  }

  async function importReceiptItems() {
    setImportingReceipt(true);
    const selected = receiptItems.filter((item) => item.selected);
    const eachUnitId = units.find((u) => u.name === "each")?.id || units[0]?.id;

    for (const item of selected) {
      const searchName = item.genericName || item.rawName;
      let ingredientId = item.ingredientId;

      if (!ingredientId) {
        // Search for existing by generic name
        const searchRes = await fetch(
          `/api/ingredients?q=${encodeURIComponent(searchName)}`
        );
        if (searchRes.ok) {
          const matches = await searchRes.json();
          const exact = matches.find(
            (m: { name: string }) =>
              m.name.toLowerCase() === searchName.toLowerCase()
          );
          if (exact) {
            ingredientId = exact.id;
          }
        }

        // Create with generic name and category
        if (!ingredientId) {
          const createRes = await fetch("/api/ingredients", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: searchName, category: item.category || undefined }),
          });
          if (createRes.ok) {
            const created = await createRes.json();
            ingredientId = created.id;
          }
        }
      }

      if (!ingredientId) continue;

      // Parse size for unit matching
      const sizeUnitId = item.size ? findUnitId(item.size.replace(/^[\d.]+\s*/, "")) : null;

      // Add to inventory
      const unitId = sizeUnitId || item.unitId || eachUnitId;
      const res = await fetch("/api/inventory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ingredientId,
          quantity: item.quantity,
          unitId,
        }),
      });

      if (res.ok) {
        const newItem = await res.json();
        setItems((prev) => {
          const idx = prev.findIndex(
            (i) => i.ingredientId === newItem.ingredientId
          );
          if (idx >= 0) {
            const updated = [...prev];
            updated[idx] = newItem;
            return updated;
          }
          return [...prev, newItem];
        });
      }

      // Save price to matching store if we have a store name and price
      if (item.price && receiptStoreName) {
        try {
          const storesRes = await fetch("/api/stores");
          if (storesRes.ok) {
            const allStores = await storesRes.json();
            const matchingStore = allStores.find(
              (s: { name: string }) =>
                s.name.toLowerCase().includes(receiptStoreName!.toLowerCase()) ||
                receiptStoreName!.toLowerCase().includes(s.name.toLowerCase())
            );
            if (matchingStore) {
              // Parse size quantity (e.g. "16 oz" -> 16)
              const sizeMatch = item.size?.match(/^([\d.]+)/);
              const sizeQty = sizeMatch ? parseFloat(sizeMatch[1]) : 1;
              const priceUnitId = sizeUnitId || eachUnitId;

              await fetch(`/api/stores/${matchingStore.id}/prices`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  ingredientId,
                  price: item.price,
                  quantity: sizeQty,
                  unitId: priceUnitId,
                }),
              });
            }
          }
        } catch {}
      }
    }

    // Sort items after all imports
    setItems((prev) =>
      [...prev].sort((a, b) =>
        a.ingredient.name.localeCompare(b.ingredient.name)
      )
    );

    setImportingReceipt(false);
    setReceiptDialogOpen(false);
    setReceiptItems([]);
  }

  const filtered = items.filter((i) =>
    i.ingredient.name.toLowerCase().includes(search.toLowerCase())
  );

  // Saving a name already in the pantry replaces its amount, so say so first.
  const existingMatch = addQuery.trim()
    ? items.find((i) => i.ingredient.name.toLowerCase() === addQuery.trim().toLowerCase())
    : undefined;

  if (loading) return <PageLoader />;

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-4xl leading-tight font-medium">Pantry</h1>
        <div className="flex flex-wrap gap-2">
          <input
            ref={receiptInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handleReceiptUpload}
            className="hidden"
          />
          <Button
            variant="outline"
            size="lg"
            onClick={() => receiptInputRef.current?.click()}
            disabled={parsingReceipt}
          >
            {parsingReceipt ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Receipt className="h-4 w-4 text-primary" />
            )}
            {parsingReceipt ? "Scanning..." : "Scan receipt"}
          </Button>
          <Button size="lg" onClick={() => setShowAdd(true)}>
            <Plus className="h-4 w-4" strokeWidth={2.5} />
            Add item
          </Button>
        </div>
      </div>

      {receiptError && (
        <Card className="border-destructive/50 bg-destructive/5" role="alert">
          <CardContent className="text-sm font-semibold text-destructive">
            {receiptError}
          </CardContent>
        </Card>
      )}

      {/* What scanning does, before someone hands over a photo. Checked
          against /api/receipts/parse: the image is read in memory, sent to
          Gemini, and never written to disk or the database. */}
      <details className="group rounded-2xl border bg-card px-4 py-3 text-sm">
        <summary className="flex cursor-pointer list-none items-center gap-2 font-bold [&::-webkit-details-marker]:hidden">
          <Receipt className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
          How receipt scanning works
          <ChevronDown className="ml-auto h-4 w-4 text-muted-foreground transition-transform duration-200 group-open:rotate-180" aria-hidden="true" />
        </summary>
        <div className="mt-3 space-y-3 text-muted-foreground">
          <p>
            Take or pick a photo of a grocery receipt. We read the items on it and add the food
            ones to your pantry.
          </p>
          <div>
            <p className="font-semibold text-foreground">For a good read</p>
            <ul className="mt-1 list-disc space-y-0.5 pl-5">
              <li>Lay the receipt flat in good light, with no shadow across it.</li>
              <li>Fit the whole receipt in the frame. Long ones can go in two photos.</li>
              <li>Hold steady so the text is sharp.</li>
            </ul>
          </div>
          <p>
            You check the list before anything is saved. Food is ticked for you and other items are
            skipped, and you can change either. Items already in your pantry take the amount from the
            receipt. If the store matches one of your stores, prices are saved there too.
          </p>
          <p>
            The photo is sent to Google&apos;s Gemini AI to read it. We don&apos;t keep the image: it is
            not saved on our servers or in your account. See our{" "}
            <Link href="/privacy" className="font-bold text-primary underline-offset-4 hover:underline">
              privacy policy
            </Link>
            .
          </p>
        </div>
      </details>

      {items.length > 0 && (
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search pantry..."
        />
      )}

      {/* Add Item Form. Enter saves from any field; the form stays open for
          the next item until Done. */}
      {showAdd && (
        <form
          onSubmit={addItem}
          noValidate
          className="rounded-2xl border bg-card p-4 sm:p-5"
        >
          <div className="space-y-3">
            <div ref={suggestRef} className="relative">
              <Input
                ref={addNameRef}
                aria-label="Ingredient name"
                placeholder="What do you have? e.g. eggs"
                value={addQuery}
                onChange={(e) => {
                  setAddQuery(e.target.value);
                  setShowSuggestions(true);
                  setSelectedIngredient(null);
                  setAddError(null);
                }}
                onFocus={() => addQuery.length >= 2 && setShowSuggestions(true)}
                onKeyDown={(e) => {
                  // Escape closes the suggestions first, then the form.
                  if (e.key !== "Escape") return;
                  if (showSuggestions && suggestions.length > 0) setShowSuggestions(false);
                  else resetAdd();
                }}
                aria-invalid={addError !== null && !addQuery.trim()}
                aria-describedby="pantry-add-help"
                autoComplete="off"
                autoFocus
              />
              {showSuggestions && addQuery.length >= 2 && suggestions.length > 0 && (
                <div className="absolute z-50 mt-1 w-full overflow-hidden rounded-xl border bg-popover shadow-md">
                  {suggestions.slice(0, 8).map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      className="w-full px-3 py-2.5 text-left text-sm transition-colors duration-200 ease-out hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
                      onClick={() => {
                        chooseIngredient(s);
                        addNameRef.current?.focus();
                      }}
                    >
                      {s.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="flex gap-2">
              <Input
                type="number"
                inputMode="decimal"
                min={0}
                step="any"
                value={addQty}
                onChange={(e) => {
                  setAddQty(e.target.value);
                  setAddError(null);
                }}
                className="w-24"
                placeholder="1"
                aria-label="Quantity (blank means 1)"
              />
              <Select
                value={addUnitId ? addUnitId.toString() : undefined}
                onValueChange={(v) => v && setAddUnitId(parseInt(v, 10))}
              >
                <SelectTrigger className="flex-1" aria-label="Unit">
                  <SelectValue placeholder="Unit">
                    {addUnitId ? units.find((u) => u.id === addUnitId)?.name ?? "" : null}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(
                    units.reduce((acc, u) => {
                      if (!acc[u.unitType]) acc[u.unitType] = [];
                      acc[u.unitType].push(u);
                      return acc;
                    }, {} as Record<string, Unit[]>)
                  ).map(([type, groupUnits]) => (
                    <SelectGroup key={type}>
                      <SelectLabel>{type}</SelectLabel>
                      {groupUnits.map((u) => (
                        <SelectItem key={u.id} value={u.id.toString()}>
                          {u.name} ({u.abbreviation})
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div id="pantry-add-help" aria-live="polite" className="min-h-5 text-sm">
              {addError ? (
                <p className="font-semibold text-destructive">{addError}</p>
              ) : existingMatch ? (
                <p className="text-muted-foreground">
                  Already in your pantry ({formatAmount(existingMatch.quantity, existingMatch.unit.abbreviation) || `0 ${existingMatch.unit.abbreviation}`}). Saving replaces that amount.
                </p>
              ) : addStatus ? (
                <p className="font-semibold text-leaf-ink">{addStatus} Add another, or tap Done.</p>
              ) : (
                <p className="text-muted-foreground">Press Enter to save. New names are added for you.</p>
              )}
            </div>
            <div className="flex gap-2">
              <Button type="submit" size="lg" className="flex-1" disabled={savingAdd}>
                {savingAdd ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Save
              </Button>
              <Button type="button" size="lg" variant="outline" onClick={resetAdd}>
                Done
              </Button>
            </div>
          </div>
        </form>
      )}

      {/* Pantry items */}
      {items.length === 0 && !showAdd ? (
        <EmptyState
          icon={Package}
          title="Your pantry is empty"
          description="Keep track of what you have at home, so you can see what you can cook and skip it on your grocery list."
        >
          <Button size="lg" onClick={() => setShowAdd(true)}>
            <Plus className="h-4 w-4" strokeWidth={2.5} />
            Add your first item
          </Button>
          <Button size="lg" variant="outline" onClick={() => receiptInputRef.current?.click()} disabled={parsingReceipt}>
            <Receipt className="h-4 w-4 text-primary" />
            Scan a receipt
          </Button>
        </EmptyState>
      ) : filtered.length === 0 && items.length > 0 ? (
        <p className="text-sm text-muted-foreground">Nothing in your pantry matches &quot;{search}&quot;.</p>
      ) : (
        <ul className="space-y-2">
          {filtered.map((item) => (
            <li
              key={item.id}
              className="flex items-center justify-between gap-3 rounded-2xl border bg-card px-4 py-3"
            >
              <div className="min-w-0 flex-1">
                <div className="font-bold">{item.ingredient.name}</div>
                <div className="mt-0.5 text-sm text-muted-foreground">
                  {editingId === item.id ? (
                    <span className="inline-flex items-center gap-1">
                      <Input
                        type="number"
                        min={0}
                        step="any"
                        value={editQty}
                        onChange={(e) => setEditQty(parseFloat(e.target.value) || 0)}
                        className="h-8 w-20 text-sm"
                        aria-label={`Quantity of ${item.ingredient.name}`}
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === "Enter") saveEdit(item);
                          if (e.key === "Escape") setEditingId(null);
                        }}
                      />
                      {item.unit.abbreviation}
                      <Button
                        size="icon"
                        variant="ghost"
                        className="size-8 text-primary"
                        onClick={() => saveEdit(item)}
                        aria-label="Save quantity"
                      >
                        <Save className="h-4 w-4" />
                      </Button>
                    </span>
                  ) : (
                    <button
                      onClick={() => {
                        setEditingId(item.id);
                        setEditQty(item.quantity);
                      }}
                      className="rounded-md font-bold text-foreground tabular-nums underline-offset-4 hover:underline focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
                    >
                      {formatAmount(item.quantity, item.unit.abbreviation) || `0 ${item.unit.abbreviation}`}
                    </button>
                  )}
                  {item.ingredient.category && (
                    <span className="ml-2">{item.ingredient.category}</span>
                  )}
                </div>
              </div>
              <Button
                size="icon"
                variant="ghost"
                className="size-10 shrink-0 text-destructive hover:bg-destructive/10 hover:text-destructive"
                onClick={() => deleteItem(item)}
                aria-label={`Remove ${item.ingredient.name}`}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </li>
          ))}
        </ul>
      )}

      {/* Receipt Review Dialog */}
      <Dialog open={receiptDialogOpen} onOpenChange={setReceiptDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              Receipt items
              {receiptStoreName && (
                <span className="ml-2 text-sm font-normal text-muted-foreground">
                  from {receiptStoreName}
                </span>
              )}
            </DialogTitle>
          </DialogHeader>
          <div className="max-h-96 space-y-2 overflow-y-auto">
            <p className="text-sm text-muted-foreground">
              Check the list before importing. Food is ticked for you and other items are skipped; tap any item to change that.
            </p>

            {/* Ingredients */}
            {receiptItems.filter((i) => i.isIngredient).length > 0 && (
              <div className="space-y-1.5">
                {receiptItems.map((item, index) => {
                  if (!item.isIngredient) return null;
                  return (
                    <label
                      key={index}
                      className="flex cursor-pointer items-start gap-3 rounded-xl border bg-card p-3 transition-colors duration-200 ease-out hover:bg-muted has-data-checked:border-input has-data-checked:bg-brand-soft"
                    >
                      <Checkbox
                        checked={item.selected}
                        onCheckedChange={() => toggleReceiptItem(index)}
                        className="mt-0.5 size-5"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-bold">{item.genericName}</div>
                        <div className="text-xs text-muted-foreground">
                          {item.rawName !== item.genericName && (
                            <span className="block truncate">{item.rawName}</span>
                          )}
                          <span className="flex flex-wrap gap-x-2 mt-0.5">
                            {item.brand && <span>{item.brand}</span>}
                            {item.size && <span>{item.size}</span>}
                            {item.quantity > 1 && <span>Qty: {item.quantity}</span>}
                          </span>
                        </div>
                      </div>
                      {item.price != null && (
                        <span className="shrink-0 text-sm font-bold text-leaf-ink tabular-nums">
                          ${item.price.toFixed(2)}
                        </span>
                      )}
                    </label>
                  );
                })}
              </div>
            )}

            {/* Non-ingredients */}
            {receiptItems.filter((i) => !i.isIngredient).length > 0 && (
              <div className="space-y-1.5">
                <div className="mt-3 text-xs font-extrabold tracking-[0.08em] uppercase text-muted-foreground">
                  Skipped (not ingredients)
                </div>
                {receiptItems.map((item, index) => {
                  if (item.isIngredient) return null;
                  return (
                    <label
                      key={index}
                      className="flex cursor-pointer items-start gap-3 rounded-xl border border-dashed border-input p-3 text-muted-foreground transition-colors duration-200 ease-out hover:bg-muted has-data-checked:border-solid has-data-checked:bg-brand-soft has-data-checked:text-foreground"
                    >
                      <Checkbox
                        checked={item.selected}
                        onCheckedChange={() => toggleReceiptItem(index)}
                        className="mt-0.5 size-5"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm">{item.genericName}</div>
                        <div className="text-xs text-muted-foreground truncate">{item.rawName}</div>
                      </div>
                      {item.price != null && (
                        <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                          ${item.price.toFixed(2)}
                        </span>
                      )}
                    </label>
                  );
                })}
              </div>
            )}

            {receiptItems.length === 0 && (
              <p className="py-4 text-center text-sm text-muted-foreground">
                No items found on receipt
              </p>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setReceiptDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={importReceiptItems}
              disabled={
                importingReceipt ||
                receiptItems.filter((i) => i.selected).length === 0
              }
            >
              {importingReceipt ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Upload className="h-4 w-4" />
              )}
              Import {receiptItems.filter((i) => i.selected).length} items
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
