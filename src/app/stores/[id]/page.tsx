"use client";

import { useState, useEffect, useRef } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ArrowLeft, Plus, Trash2, Save, Loader2 } from "lucide-react";
import { PageLoader } from "@/components/shared/PageLoader";

interface Unit {
  id: number;
  name: string;
  abbreviation: string;
  unitType: string;
}

interface StorePrice {
  id: number;
  ingredientId: number;
  price: number;
  quantity: number;
  unitId: number;
  ingredient: { id: number; name: string };
  unit: { id: number; name: string; abbreviation: string };
}

interface Ingredient {
  id: number;
  name: string;
}

export default function StoreDetailPage() {
  const params = useParams();
  const storeId = params.id as string;

  const [storeName, setStoreName] = useState("");
  const [prices, setPrices] = useState<StorePrice[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [loading, setLoading] = useState(true);

  // Add price form
  const [showAdd, setShowAdd] = useState(false);
  const [addQuery, setAddQuery] = useState("");
  const [suggestions, setSuggestions] = useState<Ingredient[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedIngredient, setSelectedIngredient] = useState<Ingredient | null>(null);
  const [addPrice, setAddPrice] = useState<number>(0);
  const [addQty, setAddQty] = useState<number>(1);
  const [addUnitId, setAddUnitId] = useState<number>(0);
  const [saving, setSaving] = useState(false);
  const suggestRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    Promise.all([
      fetch(`/api/stores/${storeId}/prices`).then((r) => r.json()),
      fetch("/api/units").then((r) => r.json()),
      fetch(`/api/stores`).then((r) => r.json()),
    ]).then(([p, u, stores]) => {
      setPrices(p);
      setUnits(u);
      const store = stores.find((s: { id: number }) => s.id === parseInt(storeId));
      if (store) setStoreName(store.name);
      if (u.length > 0) setAddUnitId(u.find((x: Unit) => x.name === "each")?.id || u[0].id);
      setLoading(false);
    });
  }, [storeId]);

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

  async function savePrice() {
    if (!selectedIngredient || addPrice <= 0 || !addUnitId) return;
    setSaving(true);
    const res = await fetch(`/api/stores/${storeId}/prices`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ingredientId: selectedIngredient.id,
        price: addPrice,
        quantity: addQty,
        unitId: addUnitId,
      }),
    });
    if (res.ok) {
      const price = await res.json();
      setPrices((prev) => {
        const idx = prev.findIndex((p) => p.ingredientId === price.ingredientId);
        if (idx >= 0) {
          const updated = [...prev];
          updated[idx] = price;
          return updated;
        }
        return [...prev, price].sort((a, b) => a.ingredient.name.localeCompare(b.ingredient.name));
      });
      resetAdd();
    }
    setSaving(false);
  }

  function resetAdd() {
    setShowAdd(false);
    setAddQuery("");
    setSelectedIngredient(null);
    setAddPrice(0);
    setAddQty(1);
  }

  async function deletePrice(id: number) {
    await fetch(`/api/stores/${storeId}/prices?priceId=${id}`, { method: "DELETE" });
    setPrices((prev) => prev.filter((p) => p.id !== id));
  }

  if (loading) return <PageLoader />;

  const grouped = units.reduce((acc, u) => {
    if (!acc[u.unitType]) acc[u.unitType] = [];
    acc[u.unitType].push(u);
    return acc;
  }, {} as Record<string, Unit[]>);

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        <Link href="/stores">
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold">{storeName}</h1>
          <p className="text-sm text-muted-foreground">{prices.length} prices tracked</p>
        </div>
      </div>

      <Button variant="outline" size="sm" onClick={() => setShowAdd(true)}>
        <Plus className="mr-2 h-4 w-4" />
        Add Price
      </Button>

      {/* Add price form */}
      {showAdd && (
        <div className="rounded-2xl border border-border/60 bg-card p-4 shadow-sm">
          <div className="space-y-3">
            <div ref={suggestRef} className="relative">
              <Label>Ingredient</Label>
              <Input
                placeholder="Search ingredient..."
                value={addQuery}
                onChange={(e) => { setAddQuery(e.target.value); setShowSuggestions(true); setSelectedIngredient(null); }}
                onFocus={() => addQuery.length >= 2 && setShowSuggestions(true)}
                autoFocus
              />
              {showSuggestions && addQuery.length >= 2 && (
                <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-md">
                  {suggestions.map((s) => (
                    <button key={s.id} type="button" className="w-full px-3 py-2 text-left text-sm hover:bg-accent" onClick={() => { setSelectedIngredient(s); setAddQuery(s.name); setShowSuggestions(false); }}>
                      {s.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label>Price ($)</Label>
                <Input type="number" min={0} step="0.01" value={addPrice || ""} onChange={(e) => setAddPrice(parseFloat(e.target.value) || 0)} placeholder="0.00" />
              </div>
              <div>
                <Label>Per Qty</Label>
                <Input type="number" min={0} step="any" value={addQty} onChange={(e) => setAddQty(parseFloat(e.target.value) || 1)} />
              </div>
              <div>
                <Label>Unit</Label>
                <Select value={addUnitId ? addUnitId.toString() : undefined} onValueChange={(v) => v && setAddUnitId(parseInt(v, 10))}>
                  <SelectTrigger>
                    <SelectValue placeholder="Unit">
                      {addUnitId ? units.find((u) => u.id === addUnitId)?.abbreviation ?? "" : null}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(grouped).map(([type, groupUnits]) => (
                      <SelectGroup key={type}>
                        <SelectLabel>{type}</SelectLabel>
                        {groupUnits.map((u) => (
                          <SelectItem key={u.id} value={u.id.toString()}>{u.name} ({u.abbreviation})</SelectItem>
                        ))}
                      </SelectGroup>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex gap-2">
              <Button onClick={savePrice} disabled={saving || !selectedIngredient || addPrice <= 0}>
                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                Save
              </Button>
              <Button variant="outline" onClick={resetAdd}>Cancel</Button>
            </div>
          </div>
        </div>
      )}

      {/* Price list */}
      {prices.length === 0 && !showAdd ? (
        <div className="py-12 text-center text-muted-foreground">
          No prices tracked yet. Add prices to enable smart shopping lists.
        </div>
      ) : (
        <div className="space-y-2">
          {prices.map((price) => (
            <div key={price.id} className="flex items-center justify-between rounded-2xl border border-border/60 bg-card px-4 py-3 shadow-sm">
              <div>
                <div className="text-sm font-semibold">{price.ingredient.name}</div>
                <div className="text-xs text-muted-foreground">
                  ${Number(price.price).toFixed(2)} per {price.quantity} {price.unit.abbreviation}
                </div>
              </div>
              <Button size="sm" variant="ghost" className="text-destructive" onClick={() => deletePrice(price.id)}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
