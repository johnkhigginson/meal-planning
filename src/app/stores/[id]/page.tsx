"use client";

import { useState, useEffect, useRef } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { ArrowLeft, Plus, Trash2, Save, Loader2, MapPin, RefreshCw, Search } from "lucide-react";
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

interface KrogerLocation {
  locationId: string;
  name: string;
  chain: string;
  address: { addressLine1: string; city: string; state: string; zipCode: string };
}

interface StoreData {
  id: number;
  name: string;
  krogerLocationId: string | null;
}

export default function StoreDetailPage() {
  const params = useParams();
  const storeId = params.id as string;

  const [store, setStore] = useState<StoreData | null>(null);
  const [prices, setPrices] = useState<StorePrice[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [loading, setLoading] = useState(true);

  // Manual add price form
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

  // Kroger location picker
  const [locationDialogOpen, setLocationDialogOpen] = useState(false);
  const [zipCode, setZipCode] = useState("");
  const [krogerLocations, setKrogerLocations] = useState<KrogerLocation[]>([]);
  const [searchingLocations, setSearchingLocations] = useState(false);

  // Kroger auto-fetch
  const [fetchingPrices, setFetchingPrices] = useState(false);
  const [fetchResult, setFetchResult] = useState<{ saved: number; total: number } | null>(null);

  useEffect(() => {
    Promise.all([
      fetch(`/api/stores/${storeId}/prices`).then((r) => r.json()),
      fetch("/api/units").then((r) => r.json()),
      fetch("/api/stores").then((r) => r.json()),
    ]).then(([p, u, stores]) => {
      setPrices(p);
      setUnits(u);
      const s = stores.find((s: StoreData) => s.id === parseInt(storeId));
      if (s) setStore(s);
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
      if (suggestRef.current && !suggestRef.current.contains(e.target as Node)) setShowSuggestions(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  async function saveManualPrice() {
    if (!selectedIngredient || addPrice <= 0 || !addUnitId) return;
    setSaving(true);
    const res = await fetch(`/api/stores/${storeId}/prices`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ingredientId: selectedIngredient.id, price: addPrice, quantity: addQty, unitId: addUnitId }),
    });
    if (res.ok) {
      const price = await res.json();
      setPrices((prev) => {
        const idx = prev.findIndex((p) => p.ingredientId === price.ingredientId);
        if (idx >= 0) { const u = [...prev]; u[idx] = price; return u; }
        return [...prev, price].sort((a, b) => a.ingredient.name.localeCompare(b.ingredient.name));
      });
      setShowAdd(false);
      setAddQuery("");
      setSelectedIngredient(null);
      setAddPrice(0);
      setAddQty(1);
    }
    setSaving(false);
  }

  async function deletePrice(id: number) {
    await fetch(`/api/stores/${storeId}/prices?priceId=${id}`, { method: "DELETE" });
    setPrices((prev) => prev.filter((p) => p.id !== id));
  }

  // Kroger: search locations
  async function searchKrogerLocations() {
    if (!zipCode) return;
    setSearchingLocations(true);
    const res = await fetch(`/api/kroger/locations?zip=${zipCode}`);
    if (res.ok) setKrogerLocations(await res.json());
    setSearchingLocations(false);
  }

  // Kroger: link location to store
  async function linkLocation(locationId: string, locationName: string) {
    await fetch(`/api/stores/${storeId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: store?.name, isFavorite: true, krogerLocationId: locationId }),
    });
    setStore((prev) => prev ? { ...prev, krogerLocationId: locationId, name: locationName } : prev);
    setLocationDialogOpen(false);
  }

  // Kroger: auto-fetch prices for all pantry ingredients
  async function fetchKrogerPrices() {
    if (!store?.krogerLocationId) return;
    setFetchingPrices(true);
    setFetchResult(null);

    // Get all ingredients from pantry + recipes
    const res = await fetch("/api/ingredients");
    if (!res.ok) { setFetchingPrices(false); return; }
    const ingredients = await res.json();
    const ingredientIds = ingredients.map((i: { id: number }) => i.id);

    if (ingredientIds.length === 0) { setFetchingPrices(false); return; }

    const bulkRes = await fetch("/api/kroger/bulk-prices", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ storeId: parseInt(storeId), locationId: store.krogerLocationId, ingredientIds }),
    });

    if (bulkRes.ok) {
      const data = await bulkRes.json();
      setFetchResult({ saved: data.savedCount, total: ingredientIds.length });
      // Reload prices
      const pricesRes = await fetch(`/api/stores/${storeId}/prices`);
      if (pricesRes.ok) setPrices(await pricesRes.json());
    }
    setFetchingPrices(false);
  }

  if (loading) return <PageLoader />;

  const grouped = units.reduce((acc, u) => {
    if (!acc[u.unitType]) acc[u.unitType] = [];
    acc[u.unitType].push(u);
    return acc;
  }, {} as Record<string, Unit[]>);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <Link href="/stores">
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold">{store?.name}</h1>
            <p className="text-sm text-muted-foreground">{prices.length} prices tracked</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setLocationDialogOpen(true)}>
            <MapPin className="mr-2 h-3.5 w-3.5" />
            {store?.krogerLocationId ? "Change Location" : "Link Kroger Location"}
          </Button>
          <Button variant="outline" size="sm" onClick={() => setShowAdd(true)}>
            <Plus className="mr-2 h-3.5 w-3.5" />
            Add Price
          </Button>
        </div>
      </div>

      {/* Kroger auto-fetch card */}
      {store?.krogerLocationId && (
        <Card>
          <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="text-xs">Kroger Connected</Badge>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Auto-fetch prices from Kroger for all your ingredients
              </p>
            </div>
            <Button size="sm" onClick={fetchKrogerPrices} disabled={fetchingPrices}>
              {fetchingPrices ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="mr-2 h-3.5 w-3.5" />}
              {fetchingPrices ? "Fetching..." : "Fetch Prices"}
            </Button>
          </CardContent>
          {fetchResult && (
            <CardContent className="border-t px-4 py-2 text-xs text-muted-foreground">
              Found prices for {fetchResult.saved} of {fetchResult.total} ingredients
            </CardContent>
          )}
        </Card>
      )}

      {!store?.krogerLocationId && (
        <Card className="border-dashed">
          <CardContent className="p-4 text-center text-sm text-muted-foreground">
            <p>Link a Kroger location to auto-fetch prices for your ingredients.</p>
            <Button variant="outline" size="sm" className="mt-2" onClick={() => setLocationDialogOpen(true)}>
              <MapPin className="mr-2 h-3.5 w-3.5" />
              Find Kroger Location
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Manual add price form */}
      {showAdd && (
        <div className="rounded-2xl border border-border/60 bg-card p-4 shadow-sm">
          <div className="space-y-3">
            <div ref={suggestRef} className="relative">
              <Label>Ingredient</Label>
              <Input placeholder="Search ingredient..." value={addQuery} onChange={(e) => { setAddQuery(e.target.value); setShowSuggestions(true); setSelectedIngredient(null); }} onFocus={() => addQuery.length >= 2 && setShowSuggestions(true)} autoFocus />
              {showSuggestions && addQuery.length >= 2 && (
                <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-md">
                  {suggestions.map((s) => (
                    <button key={s.id} type="button" className="w-full px-3 py-2 text-left text-sm hover:bg-accent" onClick={() => { setSelectedIngredient(s); setAddQuery(s.name); setShowSuggestions(false); }}>{s.name}</button>
                  ))}
                </div>
              )}
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div><Label>Price ($)</Label><Input type="number" min={0} step="0.01" value={addPrice || ""} onChange={(e) => setAddPrice(parseFloat(e.target.value) || 0)} placeholder="0.00" /></div>
              <div><Label>Per Qty</Label><Input type="number" min={0} step="any" value={addQty} onChange={(e) => setAddQty(parseFloat(e.target.value) || 1)} /></div>
              <div>
                <Label>Unit</Label>
                <Select value={addUnitId ? addUnitId.toString() : undefined} onValueChange={(v) => v && setAddUnitId(parseInt(v, 10))}>
                  <SelectTrigger><SelectValue placeholder="Unit">{addUnitId ? units.find((u) => u.id === addUnitId)?.abbreviation ?? "" : null}</SelectValue></SelectTrigger>
                  <SelectContent>
                    {Object.entries(grouped).map(([type, groupUnits]) => (
                      <SelectGroup key={type}><SelectLabel>{type}</SelectLabel>{groupUnits.map((u) => (<SelectItem key={u.id} value={u.id.toString()}>{u.name} ({u.abbreviation})</SelectItem>))}</SelectGroup>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex gap-2">
              <Button onClick={saveManualPrice} disabled={saving || !selectedIngredient || addPrice <= 0}>
                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}Save
              </Button>
              <Button variant="outline" onClick={() => setShowAdd(false)}>Cancel</Button>
            </div>
          </div>
        </div>
      )}

      {/* Price list */}
      {prices.length === 0 && !showAdd ? (
        <div className="py-12 text-center text-muted-foreground">
          No prices tracked yet. Link a Kroger location to auto-fetch, or add prices manually.
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

      {/* Kroger Location Picker Dialog */}
      <Dialog open={locationDialogOpen} onOpenChange={setLocationDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Find Kroger Location</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex gap-2">
              <Input placeholder="Enter ZIP code" value={zipCode} onChange={(e) => setZipCode(e.target.value)} onKeyDown={(e) => e.key === "Enter" && searchKrogerLocations()} />
              <Button onClick={searchKrogerLocations} disabled={searchingLocations || !zipCode}>
                {searchingLocations ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              </Button>
            </div>
            <div className="max-h-64 space-y-1 overflow-y-auto">
              {krogerLocations.map((loc) => (
                <button
                  key={loc.locationId}
                  className="w-full rounded-lg p-3 text-left transition-colors hover:bg-muted"
                  onClick={() => linkLocation(loc.locationId, `${loc.chain} - ${loc.address.city}`)}
                >
                  <div className="text-sm font-medium">{loc.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {loc.chain} &middot; {loc.address.addressLine1}, {loc.address.city}, {loc.address.state} {loc.address.zipCode}
                  </div>
                </button>
              ))}
              {krogerLocations.length === 0 && zipCode && !searchingLocations && (
                <p className="py-4 text-center text-sm text-muted-foreground">Search by ZIP to find nearby stores</p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLocationDialogOpen(false)}>Cancel</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
