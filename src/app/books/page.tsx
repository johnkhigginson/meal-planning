"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus, BookOpen, ArrowRight, Trash2 } from "lucide-react";
import { PageLoader } from "@/components/shared/PageLoader";

interface RecipeBook {
  id: number;
  name: string;
  description: string | null;
  _count: { entries: number };
}

export default function BooksPage() {
  const [books, setBooks] = useState<RecipeBook[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    fetch("/api/books").then((r) => r.json()).then((data) => { setBooks(data); setLoading(false); });
  }, []);

  async function createBook() {
    if (!newName.trim()) return;
    setCreating(true);
    const res = await fetch("/api/books", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newName.trim() }),
    });
    if (res.ok) {
      const book = await res.json();
      setBooks((prev) => [book, ...prev]);
      setNewName("");
    }
    setCreating(false);
  }

  async function deleteBook(id: number) {
    await fetch(`/api/books/${id}`, { method: "DELETE" });
    setBooks((prev) => prev.filter((b) => b.id !== id));
  }

  if (loading) return <PageLoader />;

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <div className="space-y-1">
        <h1 className="text-4xl leading-tight font-medium">Recipe books</h1>
        <p className="text-muted-foreground">Organize your recipes into collections</p>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          placeholder="New book name"
          aria-label="New book name"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && createBook()}
          className="sm:max-w-xs"
        />
        <Button onClick={createBook} disabled={creating || !newName.trim()} size="lg" className="self-start">
          <Plus className="h-4 w-4" />
          Create book
        </Button>
      </div>

      {books.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-3xl border-[1.5px] border-dashed border-input px-6 py-12 text-center">
          <div className="flex size-12 items-center justify-center rounded-2xl bg-brand-soft text-primary">
            <BookOpen className="h-6 w-6" />
          </div>
          <p className="font-heading text-xl">No recipe books yet</p>
          <p className="text-muted-foreground">Create one to start organizing your recipes.</p>
        </div>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {books.map((book) => (
            <Card
              key={book.id}
              className="group gap-0 py-0 hover:-translate-y-0.5 hover:border-input hover:shadow-[0_14px_30px_-18px_rgb(60_45_10/0.45)]"
            >
              <Link
                href={`/books/${book.id}`}
                className="block p-3 pb-0 focus-visible:outline-3 focus-visible:-outline-offset-3 focus-visible:outline-ring"
              >
                {/* Cover: a paper panel with a ruled title plate, like a cookbook jacket. */}
                <div className="flex aspect-[5/3] flex-col items-center justify-center gap-3 rounded-xl border bg-muted px-6 text-center">
                  <BookOpen className="h-5 w-5 text-primary" />
                  <h3 className="line-clamp-2 border-y-[3px] border-double border-input py-2 font-heading text-2xl leading-tight font-semibold text-balance transition-colors duration-200 ease-out group-hover:text-primary">
                    {book.name}
                  </h3>
                </div>
                {book.description && (
                  <p className="mt-3 line-clamp-2 px-2 text-sm text-muted-foreground">{book.description}</p>
                )}
              </Link>
              <div className="flex items-center justify-between gap-2 px-5 pt-2 pb-3">
                <Badge variant="secondary">
                  {book._count.entries} recipe{book._count.entries !== 1 ? "s" : ""}
                </Badge>
                <div className="flex items-center">
                  <Button variant="ghost" size="icon" className="size-10 text-destructive hover:text-destructive" aria-label={`Delete ${book.name}`} onClick={() => deleteBook(book.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                  <Link href={`/books/${book.id}`} aria-label={`Open ${book.name}`} className="flex size-10 items-center justify-center rounded-full">
                    <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform duration-200 ease-out group-hover:translate-x-0.5" />
                  </Link>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
