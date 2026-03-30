"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
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
    <Suspense fallback={<p className="text-muted-foreground">Loading...</p>}>
      <GroceryListContent />
    </Suspense>
  );
}

function GroceryListContent() {
  const searchParams = useSearchParams();
  const listId = searchParams.get("id");
  const [list, setList] = useState<GroceryList | null>(null);
  const [loading, setLoading] = useState(true);

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

  if (loading) return <p className="text-muted-foreground">Loading...</p>;

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
      <div>
        <h1 className="text-2xl font-bold">Grocery List</h1>
        <p className="text-muted-foreground">{list.name}</p>
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
