"use client";

import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { SearchInput } from "@/components/shared/SearchInput";
import { Plus, Trash2, Save, Upload, Camera, Loader2, Receipt } from "lucide-react";

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
  name: string;
  quantity: number;
  unit: string;
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
        (item: { name: string; quantity?: number; unit?: string }) => ({
          name: item.name,
          quantity: item.quantity || 1,
          unit: item.unit || "each",
          selected: true,
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
      // Find or create ingredient
      let ingredientId = item.ingredientId;

      if (!ingredientId) {
        // Search for existing
        const searchRes = await fetch(
          `/api/ingredients?q=${encodeURIComponent(item.name)}`
        );
        if (searchRes.ok) {
          const matches = await searchRes.json();
          const exact = matches.find(
            (m: { name: string }) =>
              m.name.toLowerCase() === item.name.toLowerCase()
          );
          if (exact) {
            ingredientId = exact.id;
          }
        }

        // Create if not found
        if (!ingredientId) {
          const createRes = await fetch("/api/ingredients", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: item.name }),
          });
          if (createRes.ok) {
            const created = await createRes.json();
            ingredientId = created.id;
          }
        }
      }

      if (!ingredientId) continue;

      // Add to inventory
      const unitId = item.unitId || eachUnitId;
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

  if (loading) return <p className="text-muted-foreground">Loading pantry...</p>;

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold">Pantry</h1>
        <div className="flex gap-2">
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
            onClick={() => receiptInputRef.current?.click()}
            disabled={parsingReceipt}
          >
            {parsingReceipt ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Receipt className="mr-2 h-4 w-4" />
            )}
            {parsingReceipt ? "Scanning..." : "Scan Receipt"}
          </Button>
          <Button onClick={() => setShowAdd(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Add Item
          </Button>
        </div>
      </div>

      {receiptError && (
        <Card className="border-destructive">
          <CardContent className="py-3 text-sm text-destructive">
            {receiptError}
          </CardContent>
        </Card>
      )}

      <SearchInput
        value={search}
        onChange={setSearch}
        placeholder="Search pantry..."
      />

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Ingredient</TableHead>
            <TableHead className="hidden sm:table-cell">Category</TableHead>
            <TableHead>Qty</TableHead>
            <TableHead>Unit</TableHead>
            <TableHead className="w-24">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {/* Add row */}
          {showAdd && (
            <TableRow>
              <TableCell>
                <div ref={suggestRef} className="relative">
                  <Input
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
                    <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-md">
                      {suggestions.map((s) => (
                        <button
                          key={s.id}
                          type="button"
                          className="w-full px-3 py-2 text-left text-sm hover:bg-accent"
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
                          className="w-full border-t px-3 py-2 text-left text-sm text-muted-foreground hover:bg-accent"
                          onClick={createAndAddIngredient}
                        >
                          Create &quot;{addQuery}&quot;
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </TableCell>
              <TableCell>-</TableCell>
              <TableCell>
                <Input
                  type="number"
                  min={0}
                  step="any"
                  value={addQty}
                  onChange={(e) => setAddQty(parseFloat(e.target.value) || 0)}
                  className="w-20"
                />
              </TableCell>
              <TableCell>
                <Select
                  value={addUnitId ? addUnitId.toString() : undefined}
                  onValueChange={(v) => v && setAddUnitId(parseInt(v, 10))}
                >
                  <SelectTrigger className="w-32">
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
              </TableCell>
              <TableCell>
                <div className="flex gap-1">
                  <Button size="sm" onClick={addItem} disabled={!selectedIngredient}>
                    <Save className="h-4 w-4" />
                  </Button>
                  <Button size="sm" variant="ghost" onClick={resetAdd}>
                    Cancel
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          )}

          {filtered.map((item) => (
            <TableRow key={item.id}>
              <TableCell className="font-medium">
                {item.ingredient.name}
              </TableCell>
              <TableCell className="hidden text-muted-foreground sm:table-cell">
                {item.ingredient.category || "-"}
              </TableCell>
              <TableCell>
                {editingId === item.id ? (
                  <Input
                    type="number"
                    min={0}
                    step="any"
                    value={editQty}
                    onChange={(e) => setEditQty(parseFloat(e.target.value) || 0)}
                    className="w-20"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === "Enter") saveEdit(item);
                      if (e.key === "Escape") setEditingId(null);
                    }}
                  />
                ) : (
                  <button
                    className="cursor-pointer hover:underline"
                    onClick={() => {
                      setEditingId(item.id);
                      setEditQty(item.quantity);
                    }}
                  >
                    {item.quantity}
                  </button>
                )}
              </TableCell>
              <TableCell>{item.unit.abbreviation}</TableCell>
              <TableCell>
                <div className="flex gap-1">
                  {editingId === item.id && (
                    <Button size="sm" variant="ghost" onClick={() => saveEdit(item)}>
                      <Save className="h-4 w-4" />
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-destructive"
                    onClick={() => deleteItem(item.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}

          {filtered.length === 0 && !showAdd && (
            <TableRow>
              <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                No items in pantry. Click &quot;Add Item&quot; or &quot;Scan Receipt&quot; to get started.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>

      {/* Receipt Review Dialog */}
      <Dialog open={receiptDialogOpen} onOpenChange={setReceiptDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              Receipt Items
              {receiptStoreName && (
                <span className="ml-2 text-sm font-normal text-muted-foreground">
                  from {receiptStoreName}
                </span>
              )}
            </DialogTitle>
          </DialogHeader>
          <div className="max-h-96 space-y-2 overflow-y-auto">
            <p className="text-sm text-muted-foreground">
              Select items to add to your pantry. Uncheck any you don&apos;t want to import.
            </p>
            {receiptItems.map((item, index) => (
              <label
                key={index}
                className="flex cursor-pointer items-center gap-3 rounded-md border p-2 hover:bg-accent"
              >
                <Checkbox
                  checked={item.selected}
                  onCheckedChange={() => toggleReceiptItem(index)}
                />
                <div className="flex-1">
                  <span className="font-medium">{item.name}</span>
                  <span className="ml-2 text-sm text-muted-foreground">
                    {item.quantity} {item.unit}
                  </span>
                </div>
              </label>
            ))}
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
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Upload className="mr-2 h-4 w-4" />
              )}
              Import {receiptItems.filter((i) => i.selected).length} Items
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
