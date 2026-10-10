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
import { Plus, Trash2, Save, Upload, Loader2, Receipt, Package } from "lucide-react";
import { PageLoader } from "@/components/shared/PageLoader";

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
  const [addQty, setAddQty] = useState<number>(1);
  const [addUnitId, setAddUnitId] = useState<number>(0);
  const suggestRef = useRef<HTMLDivElement>(null);

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
      if (u.length > 0) setAddUnitId(u.find((x: Unit) => x.name === "each")?.id || u[0].id);
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

  async function addItem() {
    if (!selectedIngredient || addQty <= 0 || !addUnitId) return;
    const res = await fetch("/api/inventory", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ingredientId: selectedIngredient.id,
        quantity: addQty,
        unitId: addUnitId,
      }),
    });
    if (res.ok) {
      const item = await res.json();
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
      resetAdd();
    }
  }

  async function createAndAddIngredient() {
    if (!addQuery.trim()) return;
    const res = await fetch("/api/ingredients", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: addQuery.trim() }),
    });
    if (res.ok) {
      const ingredient = await res.json();
      setSelectedIngredient(ingredient);
      setAddQuery(ingredient.name);
      setShowSuggestions(false);
    }
  }

  function resetAdd() {
    setShowAdd(false);
    setAddQuery("");
    setSelectedIngredient(null);
    setAddQty(1);
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

  async function deleteItem(id: number) {
    const res = await fetch(`/api/inventory/${id}`, { method: "DELETE" });
    if (res.ok) {
      setItems((prev) => prev.filter((i) => i.id !== id));
    }
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

      <SearchInput
        value={search}
        onChange={setSearch}
        placeholder="Search pantry..."
      />

      {/* Add Item Form */}
      {showAdd && (
        <div className="rounded-2xl border bg-card p-4 sm:p-5">
          <div className="space-y-3">
            <div ref={suggestRef} className="relative">
              <Input
                aria-label="Ingredient name"
                placeholder="Ingredient name"
                value={addQuery}
                onChange={(e) => {
                  setAddQuery(e.target.value);
                  setShowSuggestions(true);
                  setSelectedIngredient(null);
                }}
                onFocus={() => addQuery.length >= 2 && setShowSuggestions(true)}
                autoFocus
              />
              {showSuggestions && addQuery.length >= 2 && (
                <div className="absolute z-50 mt-1 w-full overflow-hidden rounded-xl border bg-popover shadow-md">
                  {suggestions.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      className="w-full px-3 py-2.5 text-left text-sm transition-colors duration-200 ease-out hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
                      onClick={() => {
                        setSelectedIngredient(s);
                        setAddQuery(s.name);
                        setShowSuggestions(false);
                      }}
                    >
                      {s.name}
                    </button>
                  ))}
                  {!suggestions.some(
                    (s) => s.name.toLowerCase() === addQuery.toLowerCase()
                  ) && (
                    <button
                      type="button"
                      className="w-full border-t px-3 py-2.5 text-left text-sm font-bold text-primary transition-colors duration-200 ease-out hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
                      onClick={createAndAddIngredient}
                    >
                      Create &quot;{addQuery}&quot;
                    </button>
                  )}
                </div>
              )}
            </div>
            <div className="flex gap-2">
              <Input
                type="number"
                min={0}
                step="any"
                value={addQty}
                onChange={(e) => setAddQty(parseFloat(e.target.value) || 0)}
                className="w-20"
                placeholder="Qty"
                aria-label="Quantity"
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
            <div className="flex gap-2">
              <Button size="lg" className="flex-1" onClick={addItem} disabled={!selectedIngredient}>
                <Save className="h-4 w-4" />
                Save
              </Button>
              <Button size="lg" variant="outline" onClick={resetAdd}>
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Pantry items */}
      {filtered.length === 0 && !showAdd ? (
        <div className="flex flex-col items-center gap-3 rounded-3xl border border-dashed border-input px-6 py-12 text-center">
          <div className="flex size-12 items-center justify-center rounded-2xl bg-brand-soft text-primary">
            <Package className="h-6 w-6" />
          </div>
          <p className="font-heading text-xl">No items in pantry</p>
          <p className="max-w-sm text-sm text-muted-foreground">
            Tap &quot;Add item&quot; or &quot;Scan receipt&quot; to get started.
          </p>
          <Button size="lg" className="mt-1" onClick={() => setShowAdd(true)}>
            <Plus className="h-4 w-4" strokeWidth={2.5} />
            Add item
          </Button>
        </div>
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
                      {item.quantity} {item.unit.abbreviation}
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
                onClick={() => deleteItem(item.id)}
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
              Ingredients are auto-selected. Non-food items are skipped. Prices are saved for smart shopping.
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
