"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { PageLoader } from "@/components/shared/PageLoader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DollarSign, Loader2, MapPin, Store, Trash2 } from "lucide-react";
import Link from "next/link";

interface GroceryListItem {
  id: number;
  ingredientId: number;
  quantity: number;
  unitId: number;
  checked: boolean;
  inInventory: number;
  needed: number;
  ingredient: { id: number; name: string; category: string | null };
  unit: { id: number; abbreviation: string };
}

interface GroceryList {
  id: number;
  name: string;
  mealPlanId: number | null;
  items: GroceryListItem[];
}

interface GroceryListSummary {
  id: number;
  name: string;
  _count: { items: number };
}

export default function GroceryListPage() {
  return (
    <Suspense fallback={<PageLoader />}>
      <GroceryListContent />
    </Suspense>
  );
}

interface ShoppingStore {
  storeId: number;
  storeName: string;
  price: number;
  unitPrice: number;
}

interface ShoppingItem {
  ingredientId: number;
  ingredientName: string;
  needed: number;
  unitAbbr: string;
  bestStore: ShoppingStore | null;
  allStores: ShoppingStore[];
}

interface ShoppingResult {
  byStore: Record<string, ShoppingItem[]>;
  totalEstimate: number;
  storeCount: number;
}

function GroceryListContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const listId = searchParams.get("id");
  // undefined while loading; null when the list in the URL doesn't exist.
  const [loadedList, setLoadedList] = useState<GroceryList | null | undefined>(undefined);
  const [lists, setLists] = useState<GroceryListSummary[] | null>(null);
  const [shopping, setShopping] = useState<ShoppingResult | null>(null);
  const [loadingShopping, setLoadingShopping] = useState(false);

  useEffect(() => {
    fetch("/api/grocery-lists")
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => setLists(Array.isArray(data) ? data : []))
      .catch(() => setLists([]));
  }, []);

  // With no list in the URL (the nav link), reopen the most recent one.
  useEffect(() => {
    if (!listId && lists && lists.length > 0) {
      router.replace(`/grocery-list?id=${lists[0].id}`);
    }
  }, [listId, lists, router]);

  useEffect(() => {
    if (!listId) return;
    let cancelled = false;
    fetch(`/api/grocery-lists/${listId}`)
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null)
      .then((data) => {
        if (cancelled) return;
        setLoadedList(data);
        setShopping(null);
      });
    return () => {
      cancelled = true;
    };
  }, [listId]);

  const current = listId && loadedList && String(loadedList.id) === listId ? loadedList : null;
  const loading = listId
    ? loadedList === undefined || (loadedList !== null && String(loadedList.id) !== listId)
    : lists === null || lists.length > 0;

  async function deleteList() {
    if (!current || !confirm(`Delete “${current.name}”?`)) return;
    const res = await fetch(`/api/grocery-lists/${current.id}`, { method: "DELETE" });
    if (!res.ok) return;
    const remaining = (lists ?? []).filter((l) => l.id !== current.id);
    setLists(remaining);
    router.replace(remaining.length > 0 ? `/grocery-list?id=${remaining[0].id}` : "/grocery-list");
  }

  async function toggleItem(itemId: number, checked: boolean) {
    if (!current) return;
    const res = await fetch(`/api/grocery-lists/${current.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ itemId, checked }),
    });
    if (res.ok) {
      const updated = await res.json();
      setLoadedList(updated);
    }
  }

  async function findBestPrices() {
    if (!current) return;
    setLoadingShopping(true);
    const res = await fetch("/api/shopping-list", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ groceryListId: current.id }),
    });
    if (res.ok) {
      setShopping(await res.json());
    }
    setLoadingShopping(false);
  }

  if (loading) return <PageLoader />;

  const hasSavedLists = !!lists && lists.length > 0;
  const listPicker = lists && lists.length > 0 && (lists.length > 1 || !current) && (
    <Select
      value={current ? String(current.id) : undefined}
      onValueChange={(v) => v && router.push(`/grocery-list?id=${v}`)}
    >
      <SelectTrigger className="w-full sm:w-72" aria-label="Saved grocery lists">
        <SelectValue placeholder="Open a saved list">{current?.name ?? null}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        {lists.map((l) => (
          <SelectItem key={l.id} value={String(l.id)}>
            {l.name}
            <span className="text-muted-foreground">
              · {l._count.items} item{l._count.items !== 1 ? "s" : ""}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  if (!current) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">Grocery List</h1>
        {listPicker}
        <div className="py-12 text-center">
          <p className="text-lg text-muted-foreground">
            {hasSavedLists ? "That grocery list isn't available" : "No grocery lists yet"}
          </p>
          <p className="text-sm text-muted-foreground">
            Go to{" "}
            <Link href="/meal-plan" className="text-primary underline">
              Meal Plan
            </Link>{" "}
            and click &quot;Grocery List&quot; to make one for the week
          </p>
        </div>
      </div>
    );
  }

  const list = current;

  // Group items by category
  const grouped = list.items.reduce(
    (acc, item) => {
      const cat = item.ingredient.category || "Other";
      if (!acc[cat]) acc[cat] = [];
      acc[cat].push(item);
      return acc;
    },
    {} as Record<string, GroceryListItem[]>
  );

  const categories = Object.keys(grouped).sort();
  const needToBuy = list.items.filter((i) => i.needed > 0);
  const alreadyHave = list.items.filter((i) => i.needed <= 0);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-1">
          <h1 className="text-2xl font-bold">Grocery List</h1>
          {listPicker || <p className="text-sm text-muted-foreground">{list.name}</p>}
          <div className="mt-2 flex gap-2 text-sm">
            <Badge variant="outline">
              {needToBuy.filter((i) => i.checked).length}/{needToBuy.length} checked
            </Badge>
            {alreadyHave.length > 0 && (
              <Badge variant="secondary">
                {alreadyHave.length} already in pantry
              </Badge>
            )}
          </div>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button variant="outline" size="sm" onClick={findBestPrices} disabled={loadingShopping || needToBuy.length === 0}>
            {loadingShopping ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <DollarSign className="mr-2 h-3.5 w-3.5" />}
            Find Best Prices
          </Button>
          <Button variant="ghost" size="sm" onClick={deleteList} aria-label="Delete this grocery list">
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Smart shopping results */}
      {shopping && (
        <Card className="border-green-200 bg-green-50/30">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-base">
                <Store className="h-4 w-4" />
                Smart Shopping List
              </CardTitle>
              <Badge variant="default" className="text-sm">
                ~${shopping.totalEstimate.toFixed(2)}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              Comparing prices across {shopping.storeCount} favorite store{shopping.storeCount !== 1 ? "s" : ""}
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            {Object.entries(shopping.byStore).map(([storeName, storeItems]) => (
              <div key={storeName}>
                <div className="mb-2 flex items-center gap-2">
                  <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-sm font-semibold">{storeName}</span>
                  <Badge variant="outline" className="text-[10px]">
                    {storeItems.length} item{storeItems.length !== 1 ? "s" : ""}
                  </Badge>
                </div>
                <div className="space-y-1 pl-5">
                  {storeItems.map((item) => (
                    <div key={item.ingredientId} className="flex items-center justify-between text-sm">
                      <span>
                        {item.needed} {item.unitAbbr} {item.ingredientName}
                      </span>
                      {item.bestStore ? (
                        <span className="text-xs font-medium text-green-700">
                          ${item.bestStore.price.toFixed(2)}
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">no price</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Items to buy */}
      {categories.map((category) => {
        const categoryItems = grouped[category].filter((i) => i.needed > 0);
        if (categoryItems.length === 0) return null;

        return (
          <Card key={category}>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">{category}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {categoryItems.map((item) => (
                <label
                  key={item.id}
                  className="flex cursor-pointer items-center gap-3"
                >
                  <Checkbox
                    checked={item.checked}
                    onCheckedChange={(checked) =>
                      toggleItem(item.id, checked === true)
                    }
                  />
                  <span
                    className={
                      item.checked
                        ? "text-muted-foreground line-through"
                        : ""
                    }
                  >
                    <span className="font-medium">
                      {item.needed} {item.unit.abbreviation}
                    </span>{" "}
                    {item.ingredient.name}
                  </span>
                  {item.inInventory > 0 && (
                    <span className="text-xs text-muted-foreground">
                      (have {item.inInventory} {item.unit.abbreviation})
                    </span>
                  )}
                </label>
              ))}
            </CardContent>
          </Card>
        );
      })}

      {/* Already have section */}
      {alreadyHave.length > 0 && (
        <>
          <Separator />
          <Card className="opacity-60">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Already In Pantry</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1">
              {alreadyHave.map((item) => (
                <div
                  key={item.id}
                  className="text-sm text-muted-foreground line-through"
                >
                  {item.quantity} {item.unit.abbreviation}{" "}
                  {item.ingredient.name}
                </div>
              ))}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
