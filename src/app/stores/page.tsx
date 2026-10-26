"use client";

import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import { Plus, Trash2, Star, Loader2, ArrowRight, Store as StoreIcon } from "lucide-react";
import { PageLoader } from "@/components/shared/PageLoader";
import { EmptyState } from "@/components/shared/EmptyState";

interface Store {
  id: number;
  name: string;
  isFavorite: boolean;
  _count: { prices: number };
}

export default function StoresPage() {
  const [stores, setStores] = useState<Store[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState("");
  const [libraryStores, setLibraryStores] = useState<{ id: number; name: string }[]>([]);
  const [addingLibId, setAddingLibId] = useState<number | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    Promise.all([
      fetch("/api/stores").then((r) => r.json()),
      fetch("/api/library/stores").then((r) => r.json()),
    ]).then(([s, lib]) => {
      setStores(s);
      setLibraryStores(lib);
      setLoading(false);
    });
  }, []);

  async function addStore() {
    if (!newName.trim()) return;
    const res = await fetch("/api/stores", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newName.trim() }),
    });
    if (res.ok) {
      const store = await res.json();
      setStores((prev) => [...prev, { ...store, _count: { prices: 0 } }]);
      setNewName("");
    }
  }

  async function toggleFavorite(store: Store) {
    const res = await fetch(`/api/stores/${store.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: store.name, isFavorite: !store.isFavorite }),
    });
    if (res.ok) {
      setStores((prev) =>
        prev.map((s) =>
          s.id === store.id ? { ...s, isFavorite: !s.isFavorite } : s
        )
      );
    }
  }

  async function deleteStore(id: number) {
    const res = await fetch(`/api/stores/${id}`, { method: "DELETE" });
    if (res.ok) {
      setStores((prev) => prev.filter((s) => s.id !== id));
    }
  }

  async function addFromLibrary(libStore: { id: number; name: string }) {
    setAddingLibId(libStore.id);
    const res = await fetch("/api/library/stores", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ libraryStoreId: libStore.id }),
    });
    if (res.ok) {
      const store = await res.json();
      setStores((prev) => [...prev, { ...store, _count: { prices: 0 } }]);
    }
    setAddingLibId(null);
  }

  if (loading) return <PageLoader />;

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <div className="space-y-1">
        <h1 className="text-4xl leading-tight font-medium">Stores</h1>
        <p className="text-muted-foreground">
          Manage stores and pricing for smart shopping lists
        </p>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          ref={nameRef}
          placeholder="Store name"
          aria-label="Store name"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && addStore()}
          className="sm:w-64"
        />
        <Button onClick={addStore} size="lg" className="self-start">
          <Plus className="h-4 w-4" />
          Add store
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {stores.map((store) => (
          <Card
            key={store.id}
            className="group hover:-translate-y-0.5 hover:border-input hover:shadow-[0_14px_30px_-18px_rgb(60_45_10/0.45)]"
          >
            <CardContent className="p-0 px-5">
              <div className="flex items-center justify-between gap-2">
                <Link href={`/stores/${store.id}`} className="min-w-0 flex-1 rounded-xl focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="font-heading text-lg leading-snug font-semibold transition-colors duration-200 ease-out group-hover:text-primary">{store.name}</div>
                    <Badge variant="secondary">
                      {store._count.prices} prices
                    </Badge>
                  </div>
                </Link>
                <div className="flex items-center gap-0.5">
                  <button
                    onClick={() => toggleFavorite(store)}
                    aria-label={store.isFavorite ? `Unfavorite ${store.name}` : `Favorite ${store.name}`}
                    aria-pressed={store.isFavorite}
                    className="flex size-10 items-center justify-center rounded-full transition-colors duration-200 ease-out hover:bg-muted"
                  >
                    <Star className={`h-4 w-4 ${store.isFavorite ? "fill-primary text-primary" : "text-muted-foreground"}`} />
                  </button>
                  <Button variant="ghost" size="icon" className="size-10 text-destructive hover:text-destructive" aria-label={`Delete ${store.name}`} onClick={() => deleteStore(store.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                  <Link href={`/stores/${store.id}`} aria-label={`Open ${store.name}`} className="flex size-10 items-center justify-center rounded-full">
                    <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform duration-200 ease-out group-hover:translate-x-0.5" />
                  </Link>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}

        {stores.length === 0 && (
          <EmptyState
            icon={StoreIcon}
            title="No stores yet"
            description="Add the stores you shop at to track their prices, so your grocery list can show where each item costs least."
            className="col-span-full"
          >
            <Button size="lg" onClick={() => nameRef.current?.focus()}>
              <Plus className="h-4 w-4" />
              Add your first store
            </Button>
          </EmptyState>
        )}
      </div>

      {/* Library stores */}
      {(() => {
        const storeNames = new Set(stores.map((s) => s.name));
        const available = libraryStores.filter((ls) => !storeNames.has(ls.name));
        if (available.length === 0) return null;
        return (
          <section aria-labelledby="library-heading">
            <h2 id="library-heading" className="mb-4 font-heading text-2xl font-semibold">
              Add from library
            </h2>
            <div className="flex flex-wrap gap-2">
              {available.map((ls) => (
                <Button
                  key={ls.id}
                  variant="outline"
                  className="h-10"
                  onClick={() => addFromLibrary(ls)}
                  disabled={addingLibId === ls.id}
                >
                  {addingLibId === ls.id ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Plus className="h-3.5 w-3.5" />
                  )}
                  {ls.name}
                </Button>
              ))}
            </div>
          </section>
        );
      })()}
    </div>
  );
}
