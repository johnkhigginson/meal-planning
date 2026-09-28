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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { DollarSign, Loader2, MapPin, Store, Tag, Trash2 } from "lucide-react";
import Link from "next/link";
import { INGREDIENT_CATEGORIES } from "@/lib/constants";

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
  // The week's planned recipes and the ingredients each one needs.
  recipes: { id: number; name: string; ingredientIds: number[] }[];
}

type ListView = "aisle" | "recipe";
const VIEW_STORAGE_KEY = "groceryListView";

interface ListSection {
  key: string;
  title: string;
  rows: { item: GroceryListItem; note?: string }[];
}

// Aisles in store-walk order. A category outside the known list sorts just
// before "Other".
function groupByAisle(items: GroceryListItem[]): ListSection[] {
  const order = (c: string) => {
    const i = (INGREDIENT_CATEGORIES as readonly string[]).indexOf(c);
    return i === -1 ? INGREDIENT_CATEGORIES.length - 1.5 : i;
  };
  const byCategory = new Map<string, GroceryListItem[]>();
  for (const item of items) {
    const category = item.ingredient.category || "Other";
    byCategory.set(category, [...(byCategory.get(category) ?? []), item]);
  }
  return [...byCategory]
    .sort(([a], [b]) => order(a) - order(b) || a.localeCompare(b))
    .map(([category, rows]) => ({
      key: `aisle-${category}`,
      title: category,
      rows: rows.map((item) => ({ item })),
    }));
}

// One section per planned recipe. An item several recipes share shows under
// each, with the total to buy and a note naming the others; checking it off
// anywhere checks it off everywhere.
function groupByRecipe(list: GroceryList, items: GroceryListItem[]): ListSection[] {
  const recipesFor = new Map<number, string[]>();
  for (const recipe of list.recipes) {
    for (const id of recipe.ingredientIds) {
      recipesFor.set(id, [...(recipesFor.get(id) ?? []), recipe.name]);
    }
  }
  const sections: ListSection[] = list.recipes
    .map((recipe) => ({
      key: `recipe-${recipe.id}`,
      title: recipe.name,
      rows: items
        .filter((item) => recipe.ingredientIds.includes(item.ingredientId))
        .map((item) => {
          const others = (recipesFor.get(item.ingredientId) ?? []).filter((n) => n !== recipe.name);
          return { item, note: others.length > 0 ? `also for ${others.join(", ")}` : undefined };
        }),
    }))
    .filter((section) => section.rows.length > 0);

  const unmatched = items.filter((item) => !recipesFor.has(item.ingredientId));
  if (unmatched.length > 0) {
    sections.push({ key: "recipe-other", title: "Other items", rows: unmatched.map((item) => ({ item })) });
  }
  return sections;
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
  // Remembered per browser; storage can be missing (private windows).
  const [view, setView] = useState<ListView>(() => {
    try {
      return localStorage.getItem(VIEW_STORAGE_KEY) === "recipe" ? "recipe" : "aisle";
    } catch {
      return "aisle";
    }
  });

  function changeView(next: ListView) {
    setView(next);
    try {
      localStorage.setItem(VIEW_STORAGE_KEY, next);
    } catch {
      // Not remembered; the view still switches.
    }
  }

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

  // Reload the list after a failed save so the screen matches what's stored.
  async function reloadList(id: number) {
    const res = await fetch(`/api/grocery-lists/${id}`);
    if (res.ok) setLoadedList(await res.json());
  }

  // Check marks change on screen at once, which matters when tapping through a
  // list in the store. Server responses are ignored so quick taps can't
  // overwrite each other out of order.
  async function toggleItem(itemId: number, checked: boolean) {
    if (!current) return;
    const listId = current.id;
    setLoadedList((prev) =>
      prev && {
        ...prev,
        items: prev.items.map((i) => (i.id === itemId ? { ...i, checked } : i)),
      }
    );
    const res = await fetch(`/api/grocery-lists/${listId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ itemId, checked }),
    }).catch(() => null);
    if (!res?.ok) reloadList(listId);
  }

  // The aisle belongs to the ingredient, so the change also applies to future
  // lists.
  async function changeAisle(ingredientId: number, category: string) {
    if (!current) return;
    const listId = current.id;
    setLoadedList((prev) =>
      prev && {
        ...prev,
        items: prev.items.map((i) =>
          i.ingredientId === ingredientId ? { ...i, ingredient: { ...i.ingredient, category } } : i
        ),
      }
    );
    const res = await fetch(`/api/ingredients/${ingredientId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ category }),
    }).catch(() => null);
    if (!res?.ok) reloadList(listId);
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
  const needToBuy = list.items.filter((i) => i.needed > 0);
  const alreadyHave = list.items.filter((i) => i.needed <= 0);
  const sections = view === "recipe" ? groupByRecipe(list, needToBuy) : groupByAisle(needToBuy);

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

      {/* Sort by store aisle or by the recipe each item is for */}
      {needToBuy.length > 0 && (
        <div className="flex gap-1.5">
          <Button
            type="button"
            size="sm"
            variant={view === "aisle" ? "default" : "outline"}
            onClick={() => changeView("aisle")}
          >
            By aisle
          </Button>
          <Button
            type="button"
            size="sm"
            variant={view === "recipe" ? "default" : "outline"}
            onClick={() => changeView("recipe")}
          >
            By recipe
          </Button>
        </div>
      )}

      {/* Items to buy */}
      {sections.map((section) => (
        <Card key={section.key}>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{section.title}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {section.rows.map(({ item, note }) => (
              <div key={item.id} className="flex items-center gap-2">
                <label className="flex flex-1 cursor-pointer items-center gap-3">
                  <Checkbox
                    checked={item.checked}
                    onCheckedChange={(checked) => toggleItem(item.id, checked === true)}
                  />
                  <span className={item.checked ? "text-muted-foreground line-through" : ""}>
                    <span className="font-medium">
                      {item.needed} {item.unit.abbreviation}
                    </span>{" "}
                    {item.ingredient.name}
                    {item.inInventory > 0 && (
                      <span className="ml-1.5 text-xs text-muted-foreground">
                        (have {item.inInventory} {item.unit.abbreviation})
                      </span>
                    )}
                    {note && <span className="ml-1.5 text-xs text-muted-foreground">{note}</span>}
                  </span>
                </label>
                {view === "aisle" && (
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      aria-label={`Change aisle for ${item.ingredient.name}`}
                      title="Change aisle"
                      className="shrink-0 rounded-md p-1.5 text-muted-foreground/60 hover:bg-muted hover:text-foreground"
                    >
                      <Tag className="h-3.5 w-3.5" />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-40">
                      <DropdownMenuRadioGroup
                        value={item.ingredient.category ?? "Other"}
                        onValueChange={(v) => changeAisle(item.ingredientId, String(v))}
                      >
                        {INGREDIENT_CATEGORIES.map((category) => (
                          <DropdownMenuRadioItem key={category} value={category}>
                            {category}
                          </DropdownMenuRadioItem>
                        ))}
                      </DropdownMenuRadioGroup>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      ))}

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
