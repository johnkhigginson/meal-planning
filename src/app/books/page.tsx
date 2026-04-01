"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
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
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Recipe Books</h1>
        <p className="text-sm text-muted-foreground">Organize your recipes into collections</p>
      </div>

      <div className="flex gap-2">
        <Input
          placeholder="New book name"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && createBook()}
          className="max-w-xs"
        />
        <Button onClick={createBook} disabled={creating || !newName.trim()}>
          <Plus className="mr-2 h-4 w-4" />
          Create Book
        </Button>
      </div>

      {books.length === 0 ? (
        <div className="py-12 text-center text-muted-foreground">
          <BookOpen className="mx-auto mb-3 h-8 w-8" />
          <p>No recipe books yet. Create one to start organizing your recipes.</p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {books.map((book) => (
            <Card key={book.id} className="group transition-all hover:shadow-md">
              <CardContent className="p-5">
                <div className="flex items-start justify-between">
                  <Link href={`/books/${book.id}`} className="flex-1">
                    <div className="flex items-center gap-2">
                      <BookOpen className="h-4 w-4 text-primary" />
                      <h3 className="text-sm font-semibold group-hover:text-primary transition-colors">{book.name}</h3>
                    </div>
                    {book.description && (
                      <p className="mt-1 text-xs text-muted-foreground line-clamp-2">{book.description}</p>
                    )}
                    <Badge variant="secondary" className="mt-2 text-[10px]">
                      {book._count.entries} recipe{book._count.entries !== 1 ? "s" : ""}
                    </Badge>
                  </Link>
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => deleteBook(book.id)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                    <Link href={`/books/${book.id}`}>
                      <ArrowRight className="h-4 w-4 text-muted-foreground/30 group-hover:text-muted-foreground transition-colors" />
                    </Link>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
