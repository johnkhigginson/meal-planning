"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { useSession } from "next-auth/react";
import Link from "next/link";
import Image from "next/image";
import { canOptimizeImage } from "@/lib/image";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { SearchInput } from "@/components/shared/SearchInput";
import { PageLoader } from "@/components/shared/PageLoader";
import { trackEvent } from "@/lib/analytics";
import { ArrowLeft, Plus, Trash2, Share2, Clock, Users, Check, Copy, Loader2, Globe, ExternalLink, UserPlus, UserRound, X, BookOpen, UtensilsCrossed } from "lucide-react";
import { recipeAuthorName } from "@/lib/recipe-author";
import { decodeEntities } from "@/lib/text-clean";

interface BookRecipe {
  id: number;
  name: string;
  description: string | null;
  servings: number;
  prepTimeMinutes: number | null;
  cookTimeMinutes: number | null;
  imageUrl: string | null;
  author: { id: number; name: string } | null;
  authorName: string | null;
  tags: { tag: { id: number; name: string } }[];
}

interface RecipeBook {
  id: number;
  householdId: number;
  name: string;
  description: string | null;
  isPublished: boolean;
  slug: string | null;
  entries: { id: number; recipe: BookRecipe }[];
}

interface Collaborator {
  id: number;
  name: string;
  email: string;
}

export default function BookDetailPage() {
  const params = useParams();
  const bookId = params.id as string;
  const { data: session } = useSession();
  const myHouseholdId = (session?.user as { householdId?: string } | undefined)?.householdId;

  const [book, setBook] = useState<RecipeBook | null>(null);
  const [loading, setLoading] = useState(true);

  // Add recipe dialog
  const [addOpen, setAddOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [searchResults, setSearchResults] = useState<{ id: number; name: string }[]>([]);
  const [addedIds, setAddedIds] = useState<Set<number>>(new Set());

  // Share
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);
  const [copied, setCopied] = useState(false);

  // Publish to public blog
  const [publishing, setPublishing] = useState(false);

  // Collaborators
  const [collaborators, setCollaborators] = useState<Collaborator[]>([]);
  const [invites, setInvites] = useState<{ email: string }[]>([]);
  const [collabEmail, setCollabEmail] = useState("");
  const [collabBusy, setCollabBusy] = useState(false);
  const [collabError, setCollabError] = useState("");
  const [collabNotice, setCollabNotice] = useState("");

  useEffect(() => {
    fetch(`/api/books/${bookId}`).then((r) => r.json()).then((data) => { setBook(data); setLoading(false); });
    fetch(`/api/books/${bookId}/collaborators`)
      .then((r) => r.json())
      .then((d) => {
        setCollaborators(Array.isArray(d?.collaborators) ? d.collaborators : []);
        setInvites(Array.isArray(d?.invites) ? d.invites : []);
      })
      .catch(() => {});
  }, [bookId]);

  const isOwner = !!book && !!myHouseholdId && String(book.householdId) === myHouseholdId;

  async function addCollaborator() {
    if (!collabEmail.trim()) return;
    setCollabBusy(true);
    setCollabError("");
    setCollabNotice("");
    const res = await fetch(`/api/books/${bookId}/collaborators`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: collabEmail.trim() }),
    });
    const data = await res.json();
    if (res.ok) {
      if (data.invited) {
        // No account yet — an invitation email was sent.
        setInvites((prev) => [...prev.filter((i) => i.email !== data.email), { email: data.email }]);
        setCollabNotice(`Invitation emailed to ${data.email}. They can create an account and accept.`);
      } else {
        setCollaborators((prev) => [...prev.filter((c) => c.id !== data.id), data]);
      }
      setCollabEmail("");
    } else {
      setCollabError(data.error || "Could not add collaborator");
    }
    setCollabBusy(false);
  }

  async function removeCollaborator(userId: number) {
    await fetch(`/api/books/${bookId}/collaborators?userId=${userId}`, { method: "DELETE" });
    setCollaborators((prev) => prev.filter((c) => c.id !== userId));
  }

  async function removeInvite(email: string) {
    await fetch(`/api/books/${bookId}/collaborators?email=${encodeURIComponent(email)}`, { method: "DELETE" });
    setInvites((prev) => prev.filter((i) => i.email !== email));
  }

  useEffect(() => {
    if (!addOpen) return;
    const timer = setTimeout(async () => {
      const params = search ? `?q=${encodeURIComponent(search)}` : "";
      const res = await fetch(`/api/recipes${params}`);
      if (res.ok) {
        const data = await res.json();
        setSearchResults(data.recipes.map((r: { id: number; name: string }) => ({ id: r.id, name: r.name })));
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [search, addOpen]);

  async function addRecipe(recipeId: number) {
    const res = await fetch(`/api/books/${bookId}/recipes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ recipeId }),
    });
    if (res.ok) {
      setAddedIds((prev) => new Set(prev).add(recipeId));
      // Reload book
      const bookRes = await fetch(`/api/books/${bookId}`);
      if (bookRes.ok) setBook(await bookRes.json());
    }
  }

  async function removeRecipe(recipeId: number) {
    await fetch(`/api/books/${bookId}/recipes?recipeId=${recipeId}`, { method: "DELETE" });
    setBook((prev) => prev ? { ...prev, entries: prev.entries.filter((e) => e.recipe.id !== recipeId) } : prev);
  }

  async function shareBook() {
    setSharing(true);
    const res = await fetch(`/api/books/${bookId}/share`, { method: "POST" });
    if (res.ok) {
      const data = await res.json();
      setShareUrl(data.url);
    }
    setSharing(false);
  }

  function copyShareUrl() {
    if (shareUrl) {
      navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  async function togglePublish() {
    if (!book) return;
    setPublishing(true);
    const res = await fetch(`/api/books/${bookId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isPublished: !book.isPublished }),
    });
    if (res.ok) {
      const updated = await res.json();
      setBook((prev) =>
        prev ? { ...prev, isPublished: updated.isPublished, slug: updated.slug } : prev
      );
      trackEvent(updated.isPublished ? "cookbook_published" : "cookbook_unpublished");
    }
    setPublishing(false);
  }

  if (loading) return <PageLoader />;
  if (!book) return <div className="mx-auto max-w-6xl text-muted-foreground">Book not found</div>;

  const existingIds = new Set(book.entries.map((e) => e.recipe.id));

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <div className="space-y-4">
        <Link
          href="/books"
          className="inline-flex min-h-10 items-center gap-1.5 rounded-full text-sm font-bold text-primary hover:underline focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          <ArrowLeft className="h-4 w-4" />
          Recipe books
        </Link>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-1">
            <h1 className="text-4xl leading-tight font-medium text-balance">{book.name}</h1>
            {book.description && <p className="max-w-2xl text-muted-foreground">{book.description}</p>}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant={book.isPublished ? "default" : "outline"}
              className="h-10"
              aria-pressed={book.isPublished}
              onClick={togglePublish}
              disabled={publishing}
            >
              {publishing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Globe className="h-4 w-4" />}
              {book.isPublished ? "Published" : "Publish"}
            </Button>
            <Button variant="outline" className="h-10" onClick={shareBook} disabled={sharing}>
              {sharing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Share2 className="h-4 w-4" />}
              Share
            </Button>
            <Link href={`/recipes/new?bookId=${book.id}`} className={cn(buttonVariants({ variant: "outline" }), "h-10")}>
              <Plus className="h-4 w-4" />
              New recipe
            </Link>
            <Button className="h-10" onClick={() => { setAddOpen(true); setSearch(""); setAddedIds(new Set()); }}>
              <Plus className="h-4 w-4" />
              Add recipes
            </Button>
          </div>
        </div>
      </div>

      {/* Public blog link */}
      {book.isPublished && book.slug && (
        <div className="flex flex-col gap-3 rounded-2xl border bg-card px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Globe className="h-4 w-4 text-primary" />
            <span className="text-muted-foreground">Live publicly at</span>
            <code className="rounded-lg bg-muted px-1.5 py-0.5 text-xs">/blog/{book.slug}</code>
          </div>
          <a
            href={`/blog/${book.slug}`}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(buttonVariants({ variant: "outline" }), "h-10 self-start sm:self-auto")}
          >
            <ExternalLink className="h-4 w-4" />
            View blog
          </a>
        </div>
      )}

      {/* Share URL */}
      {shareUrl && (
        <div className="flex items-center gap-2 rounded-2xl border bg-card px-5 py-3">
          <span className="flex-1 truncate text-sm text-muted-foreground">{shareUrl}</span>
          <Button variant="outline" className="h-10" onClick={copyShareUrl}>
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            {copied ? "Copied" : "Copy"}
          </Button>
        </div>
      )}

      {/* Collaborators (cookbook owner only) */}
      {isOwner && (
        <section aria-labelledby="collab-heading" className="rounded-2xl border bg-card p-5">
          <h2 id="collab-heading" className="flex items-center gap-2 font-heading text-xl font-semibold">
            <UserPlus className="h-5 w-5 text-primary" /> Collaborators
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Invite people from other households to help with this cookbook. They keep their own
            kitchen and can be credited as recipe authors. No account yet? They&apos;ll get an email
            inviting them to sign up and accept.
          </p>
          {collaborators.length > 0 && (
            <ul className="mt-4 space-y-1.5">
              {collaborators.map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-2 rounded-xl bg-muted py-1 pr-1 pl-3 text-sm">
                  <span className="min-w-0 truncate"><span className="font-bold">{c.name}</span> <span className="text-muted-foreground">· {c.email}</span></span>
                  <button
                    onClick={() => removeCollaborator(c.id)}
                    className="flex size-9 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors duration-200 ease-out hover:bg-card hover:text-destructive"
                    title="Remove"
                    aria-label={`Remove ${c.name}`}
                  >
                    <X className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          {invites.length > 0 && (
            <ul className="mt-3 space-y-1.5">
              {invites.map((i) => (
                <li key={i.email} className="flex items-center justify-between gap-2 rounded-xl border-[1.5px] border-dashed border-input py-1 pr-1 pl-3 text-sm">
                  <span className="min-w-0 truncate text-muted-foreground">{i.email} · invited (pending)</span>
                  <button
                    onClick={() => removeInvite(i.email)}
                    className="flex size-9 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors duration-200 ease-out hover:bg-muted hover:text-destructive"
                    title="Cancel invite"
                    aria-label={`Cancel invite for ${i.email}`}
                  >
                    <X className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <Input
              type="email"
              placeholder="collaborator@email.com"
              aria-label="Collaborator email"
              value={collabEmail}
              onChange={(e) => { setCollabEmail(e.target.value); setCollabError(""); }}
              onKeyDown={(e) => e.key === "Enter" && addCollaborator()}
              className="sm:max-w-xs"
            />
            <Button className="h-10 self-start" onClick={addCollaborator} disabled={collabBusy || !collabEmail.trim()}>
              {collabBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
              Add
            </Button>
          </div>
          {collabError && <p role="alert" className="mt-2 text-sm text-destructive">{collabError}</p>}
          {collabNotice && <p role="status" className="mt-2 rounded-xl bg-leaf-soft px-3 py-2 text-sm text-leaf-ink">{collabNotice}</p>}
        </section>
      )}

      {/* Recipe list */}
      {book.entries.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-3xl border-[1.5px] border-dashed border-input px-6 py-12 text-center">
          <div className="flex size-12 items-center justify-center rounded-2xl bg-brand-soft text-primary">
            <BookOpen className="h-6 w-6" />
          </div>
          <p className="font-heading text-xl">No recipes in this book yet</p>
          <p className="text-muted-foreground">Click &quot;Add recipes&quot; to get started.</p>
          <Button size="lg" onClick={() => { setAddOpen(true); setSearch(""); setAddedIds(new Set()); }}>
            <Plus className="h-4 w-4" />
            Add recipes
          </Button>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {book.entries.map((entry) => {
            const recipe = entry.recipe;
            const totalTime = (recipe.prepTimeMinutes || 0) + (recipe.cookTimeMinutes || 0);
            return (
              <Card
                key={entry.id}
                className="group gap-0 py-0 hover:-translate-y-0.5 hover:border-input hover:shadow-[0_14px_30px_-18px_rgb(60_45_10/0.45)]"
              >
                <Link href={`/recipes/${recipe.id}`} tabIndex={-1} aria-hidden="true" className="relative block aspect-[4/3] w-full overflow-hidden bg-accent">
                  {recipe.imageUrl ? (
                    <Image
                      src={recipe.imageUrl}
                      alt={recipe.name}
                      fill
                      sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
                      unoptimized={!canOptimizeImage(recipe.imageUrl)}
                      className="object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center">
                      <UtensilsCrossed className="h-6 w-6 text-primary/50" />
                    </div>
                  )}
                </Link>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <Link href={`/recipes/${recipe.id}`} className="min-w-0 flex-1 rounded-lg focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring">
                      <h3 className="font-heading text-lg leading-snug font-semibold transition-colors duration-200 ease-out group-hover:text-primary">{decodeEntities(recipe.name)}</h3>
                      {recipe.description && <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{decodeEntities(recipe.description)}</p>}
                      <div className="mt-2 flex flex-wrap items-center gap-3 text-xs font-semibold text-muted-foreground">
                        {totalTime > 0 && <span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5" />{totalTime}m</span>}
                        <span className="flex items-center gap-1"><Users className="h-3.5 w-3.5" />{recipe.servings}</span>
                        {recipeAuthorName(recipe) && (
                          <span className="flex items-center gap-1"><UserRound className="h-3.5 w-3.5" />{recipeAuthorName(recipe)}</span>
                        )}
                      </div>
                    </Link>
                    <Button variant="ghost" size="icon" className="size-10 shrink-0 text-destructive hover:text-destructive" aria-label={`Remove ${recipe.name} from book`} onClick={() => removeRecipe(recipe.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Add recipe dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add recipes to book</DialogTitle></DialogHeader>
          <SearchInput value={search} onChange={setSearch} placeholder="Search your recipes..." />
          <div className="max-h-64 space-y-1 overflow-y-auto">
            {searchResults.map((recipe) => {
              const alreadyIn = existingIds.has(recipe.id) || addedIds.has(recipe.id);
              return (
                <div key={recipe.id} className="flex items-center justify-between gap-2 rounded-xl px-3 py-2 transition-colors duration-200 ease-out hover:bg-muted">
                  <span className="text-sm font-semibold">{decodeEntities(recipe.name)}</span>
                  <Button size="sm" variant={alreadyIn ? "secondary" : "default"} disabled={alreadyIn} onClick={() => addRecipe(recipe.id)}>
                    {alreadyIn ? <><Check className="h-3.5 w-3.5" /> Added</> : <><Plus className="h-3.5 w-3.5" /> Add</>}
                  </Button>
                </div>
              );
            })}
            {searchResults.length === 0 && <p className="py-4 text-center text-sm text-muted-foreground">No recipes found</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
