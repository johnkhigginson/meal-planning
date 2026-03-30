"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import Link from "next/link";
import { Plus, Trash2, Star, Loader2, ArrowRight } from "lucide-react";
import { PageLoader } from "@/components/shared/PageLoader";

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
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Stores</h1>
        <p className="text-muted-foreground">
          Manage stores and pricing for smart shopping lists
        </p>
      </div>

      <div className="flex gap-2">
        <Input
          placeholder="Store name"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && addStore()}
          className="w-64"
        />
        <Button onClick={addStore}>
          <Plus className="mr-2 h-4 w-4" />
          Add Store
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {stores.map((store) => (
          <Card key={store.id} className="group transition-all hover:shadow-md">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <Link href={`/stores/${store.id}`} className="flex-1">
                  <div className="flex items-center gap-3">
                    <div className="text-sm font-semibold group-hover:text-primary transition-colors">{store.name}</div>
                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                      {store._count.prices} prices
                    </Badge>
                  </div>
                </Link>
                <div className="flex items-center gap-1.5">
                  <button onClick={() => toggleFavorite(store)} className="p-1">
                    <Star className={`h-4 w-4 ${store.isFavorite ? "fill-yellow-500 text-yellow-500" : "text-muted-foreground"}`} />
                  </button>
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => deleteStore(store.id)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                  <Link href={`/stores/${store.id}`}>
                    <ArrowRight className="h-4 w-4 text-muted-foreground/30 group-hover:text-muted-foreground transition-colors" />
                  </Link>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}

        {stores.length === 0 && (
          <p className="col-span-full py-8 text-center text-muted-foreground">
            No stores added yet. Add a store to start tracking prices.
          </p>
        )}
      </div>

      {/* Library stores */}
      {(() => {
        const storeNames = new Set(stores.map((s) => s.name));
        const available = libraryStores.filter((ls) => !storeNames.has(ls.name));
        if (available.length === 0) return null;
        return (
          <div>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Add from Library
            </h2>
            <div className="flex flex-wrap gap-2">
              {available.map((ls) => (
                <Button
                  key={ls.id}
                  variant="outline"
                  size="sm"
                  onClick={() => addFromLibrary(ls)}
                  disabled={addingLibId === ls.id}
                >
                  {addingLibId === ls.id ? (
                    <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />
                  ) : (
                    <Plus className="mr-1.5 h-3 w-3" />
                  )}
                  {ls.name}
                </Button>
              ))}
            </div>
          </div>
        );
      })()}
    </div>
  );
}
