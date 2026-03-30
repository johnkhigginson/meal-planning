"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { PageLoader } from "@/components/shared/PageLoader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { DollarSign, Loader2, MapPin, Store } from "lucide-react";
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
  const searchParams = useSearchParams();
  const listId = searchParams.get("id");
  const [list, setList] = useState<GroceryList | null>(null);
  const [loading, setLoading] = useState(true);
  const [shopping, setShopping] = useState<ShoppingResult | null>(null);
  const [loadingShopping, setLoadingShopping] = useState(false);

  useEffect(() => {
    if (!listId) {
      setLoading(false);
      return;
    }
    fetch(`/api/grocery-lists/${listId}`)
      .then((r) => r.json())
      .then((data) => {
        setList(data);
        setLoading(false);
      });
  }, [listId]);

  async function toggleItem(itemId: number, checked: boolean) {
    if (!list) return;
    const res = await fetch(`/api/grocery-lists/${list.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ itemId, checked }),
    });
    if (res.ok) {
      const updated = await res.json();
      setList(updated);
    }
  }

  async function findBestPrices() {
    if (!list) return;
    setLoadingShopping(true);
    const res = await fetch("/api/shopping-list", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ groceryListId: list.id }),
    });
    if (res.ok) {
      setShopping(await res.json());
    }
    setLoadingShopping(false);
  }

  if (loading) return <PageLoader />;

  if (!listId || !list) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">Grocery List</h1>
        <div className="py-12 text-center">
          <p className="text-lg text-muted-foreground">No grocery list selected</p>
          <p className="text-sm text-muted-foreground">
            Go to{" "}
            <Link href="/meal-plan" className="text-primary underline">
              Meal Plan
            </Link>{" "}
            and click &quot;Generate Grocery List&quot;
          </p>
        </div>
      </div>
    );
  }

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
        <div>
          <h1 className="text-2xl font-bold">Grocery List</h1>
          <p className="text-sm text-muted-foreground">{list.name}</p>
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
        <Button variant="outline" size="sm" onClick={findBestPrices} disabled={loadingShopping || needToBuy.length === 0}>
          {loadingShopping ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <DollarSign className="mr-2 h-3.5 w-3.5" />}
          Find Best Prices
        </Button>
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
