"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { PageLoader } from "@/components/shared/PageLoader";
import { Button, buttonVariants } from "@/components/ui/button";
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
import { Check, DollarSign, Loader2, MapPin, ShoppingCart, Store, Tag, Trash2 } from "lucide-react";
import Link from "next/link";
import { INGREDIENT_CATEGORIES } from "@/lib/constants";
import { cn } from "@/lib/utils";

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
  const recipesFor = new Map<number, { id: number; name: string }[]>();
  for (const recipe of list.recipes) {
    for (const id of recipe.ingredientIds) {
      recipesFor.set(id, [...(recipesFor.get(id) ?? []), recipe]);
    }
  }
  const sections: ListSection[] = list.recipes
    .map((recipe) => ({
      key: `recipe-${recipe.id}`,
      title: recipe.name,
      rows: items
        .filter((item) => recipe.ingredientIds.includes(item.ingredientId))
        .map((item) => {
          const others = (recipesFor.get(item.ingredientId) ?? [])
            .filter((r) => r.id !== recipe.id)
            .map((r) => r.name);
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
  // Price results carry their list id, so a slow response for one list never
  // shows up under another.
  const [shoppingFor, setShoppingFor] = useState<{ listId: number; result: ShoppingResult } | null>(null);
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
      });
    return () => {
      cancelled = true;
    };
  }, [listId]);

  // Parse the id the way the API does, so "?id=012" still matches list 12.
  const wantedId = listId ? parseInt(listId, 10) : NaN;
  const current = loadedList && loadedList.id === wantedId ? loadedList : null;
  const loading = listId
    ? loadedList === undefined || (loadedList !== null && loadedList.id !== wantedId)
    : lists === null || lists.length > 0;
  const shopping = shoppingFor && current && shoppingFor.listId === current.id ? shoppingFor.result : null;

  async function deleteList() {
    if (!current || !confirm(`Delete “${current.name}”?`)) return;
    const res = await fetch(`/api/grocery-lists/${current.id}`, { method: "DELETE" });
    if (!res.ok) return;
    const remaining = (lists ?? []).filter((l) => l.id !== current.id);
    setLists(remaining);
    router.replace(remaining.length > 0 ? `/grocery-list?id=${remaining[0].id}` : "/grocery-list");
  }

  // Reload the list after a failed save so the screen matches what's stored.
  // A reply that lands after the cook switched lists is dropped.
  async function reloadList(id: number) {
    const data = await fetch(`/api/grocery-lists/${id}`)
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null);
    if (data) setLoadedList((prev) => (prev && prev.id === id ? data : prev));
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
    const item = current.items.find((i) => i.ingredientId === ingredientId);
    if ((item?.ingredient.category ?? "Other") === category) return;
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
    const listId = current.id;
    setLoadingShopping(true);
    const res = await fetch("/api/shopping-list", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ groceryListId: listId }),
    }).catch(() => null);
    if (res?.ok) {
      setShoppingFor({ listId, result: await res.json() });
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
      <div className="mx-auto max-w-2xl space-y-8">
        <h1 className="text-4xl leading-tight font-medium">Grocery list</h1>
        {listPicker}
        <div className="flex flex-col items-center gap-3 rounded-3xl border border-dashed border-input px-6 py-12 text-center">
          <div className="flex size-12 items-center justify-center rounded-2xl bg-brand-soft text-primary">
            <ShoppingCart className="h-6 w-6" />
          </div>
          <p className="font-heading text-xl">
            {hasSavedLists ? "That grocery list isn't available" : "No grocery lists yet"}
          </p>
          <p className="max-w-sm text-sm text-muted-foreground">
            Go to{" "}
            <Link href="/meal-plan" className="font-bold text-primary underline-offset-4 hover:underline">
              Meal plan
            </Link>{" "}
            and click &quot;Grocery list&quot; to make one for the week
          </p>
          <Link href="/meal-plan" className={cn(buttonVariants({ size: "lg" }), "mt-1")}>
            Open meal plan
          </Link>
        </div>
      </div>
    );
  }

  const list = current;
  const needToBuy = list.items.filter((i) => i.needed > 0);
  const alreadyHave = list.items.filter((i) => i.needed <= 0);
  const sections = view === "recipe" ? groupByRecipe(list, needToBuy) : groupByAisle(needToBuy);

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-1">
          <h1 className="text-4xl leading-tight font-medium">Grocery list</h1>
          {listPicker || <p className="text-muted-foreground">{list.name}</p>}
          <div className="mt-3 flex flex-wrap gap-2 text-sm">
            <Badge variant="outline" className="h-6 px-2.5 font-bold tabular-nums">
              {needToBuy.filter((i) => i.checked).length}/{needToBuy.length} checked
            </Badge>
            {alreadyHave.length > 0 && (
              <Badge variant="pantry" className="h-6 px-2.5 tabular-nums">
                {alreadyHave.length} already in pantry
              </Badge>
            )}
          </div>
        </div>
        <div className="flex shrink-0 gap-2 print:hidden">
          <Button variant="outline" className="h-10" onClick={findBestPrices} disabled={loadingShopping || needToBuy.length === 0}>
            {loadingShopping ? <Loader2 className="h-4 w-4 animate-spin" /> : <DollarSign className="h-4 w-4 text-primary" />}
            Find best prices
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-10 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
            onClick={deleteList}
            aria-label="Delete this grocery list"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Smart shopping results */}
      {shopping && (
        <Card className="border-leaf/30 bg-leaf-soft/50">
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <CardTitle className="flex items-center gap-2 text-xl">
                <Store className="h-5 w-5 text-leaf-ink" />
                Smart shopping list
              </CardTitle>
              <Badge variant="pantry" className="h-7 px-3 font-heading text-base tabular-nums">
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
                  <MapPin className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-bold">{storeName}</span>
                  <Badge variant="outline" className="bg-card">
                    {storeItems.length} item{storeItems.length !== 1 ? "s" : ""}
                  </Badge>
                </div>
                <div className="space-y-1.5 pl-6">
                  {storeItems.map((item) => (
                    <div key={item.ingredientId} className="flex items-center justify-between gap-3 text-sm">
                      <span>
                        <span className="font-bold">{item.needed} {item.unitAbbr}</span> {item.ingredientName}
                      </span>
                      {item.bestStore ? (
                        <span className="shrink-0 text-sm font-bold text-leaf-ink tabular-nums">
                          ${item.bestStore.price.toFixed(2)}
                        </span>
                      ) : (
                        <span className="shrink-0 text-xs text-muted-foreground">no price</span>
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
        <div role="group" aria-label="Sort list" className="flex gap-1.5 print:hidden">
          <Button
            type="button"
            className="h-10"
            variant={view === "aisle" ? "default" : "outline"}
            aria-pressed={view === "aisle"}
            onClick={() => changeView("aisle")}
          >
            By aisle
          </Button>
          <Button
            type="button"
            className="h-10"
            variant={view === "recipe" ? "default" : "outline"}
            aria-pressed={view === "recipe"}
            onClick={() => changeView("recipe")}
          >
            By recipe
          </Button>
        </div>
      )}

      {/* Items to buy */}
      {sections.map((section) => (
        <Card key={section.key} className="gap-2">
          <CardHeader>
            <CardTitle className="text-xl">{section.title}</CardTitle>
          </CardHeader>
          <CardContent>
            <ul>
            {section.rows.map(({ item, note }) => (
              <li
                key={item.id}
                className="flex items-center gap-2 border-b border-border/70 last:border-b-0"
              >
                <label className="flex min-h-12 flex-1 cursor-pointer items-center gap-3 py-2">
                  <Checkbox
                    checked={item.checked}
                    onCheckedChange={(checked) => toggleItem(item.id, checked === true)}
                    className="size-6 rounded-md border-2 border-muted-foreground/60 data-checked:border-leaf data-checked:bg-leaf data-checked:text-white dark:data-checked:bg-leaf dark:data-checked:text-brand-foreground [&_svg]:size-4!"
                  />
                  <span
                    className={
                      item.checked
                        ? "text-muted-foreground line-through decoration-muted-foreground/70 transition-colors duration-200 ease-out"
                        : "transition-colors duration-200 ease-out"
                    }
                  >
                    <span className="font-extrabold">
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
                      className="flex size-10 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors duration-200 ease-out outline-none hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 aria-expanded:bg-muted aria-expanded:text-foreground print:hidden"
                    >
                      <Tag className="h-4 w-4" />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-40">
                      <DropdownMenuRadioGroup
                        value={item.ingredient.category ?? "Other"}
                        onValueChange={(v) => changeAisle(item.ingredientId, String(v))}
                      >
                        {INGREDIENT_CATEGORIES.map((category) => (
                          <DropdownMenuRadioItem key={category} value={category} closeOnClick>
                            {category}
                          </DropdownMenuRadioItem>
                        ))}
                      </DropdownMenuRadioGroup>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </li>
            ))}
            </ul>
          </CardContent>
        </Card>
      ))}

      {/* Already have section */}
      {alreadyHave.length > 0 && (
        <>
          <Separator />
          <Card className="gap-2 bg-muted/60">
            <CardHeader>
              <CardTitle className="text-xl">Already in pantry</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-1.5">
                {alreadyHave.map((item) => (
                  <li
                    key={item.id}
                    className="flex items-center gap-2.5 text-sm text-muted-foreground"
                  >
                    <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-leaf-soft text-leaf-ink">
                      <Check className="size-3" strokeWidth={3.5} aria-hidden="true" />
                    </span>
                    <span className="line-through decoration-muted-foreground/70">
                      {item.quantity} {item.unit.abbreviation}{" "}
                      {item.ingredient.name}
                    </span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
