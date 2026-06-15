"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { SearchInput } from "@/components/shared/SearchInput";
import { PageLoader } from "@/components/shared/PageLoader";
import { trackEvent } from "@/lib/analytics";
import { ArrowLeft, Plus, Trash2, Share2, Clock, Users, Check, Copy, Loader2, Globe, ExternalLink, UserPlus, UserRound, X } from "lucide-react";

interface BookRecipe {
  id: number;
  name: string;
  description: string | null;
  servings: number;
  prepTimeMinutes: number | null;
  cookTimeMinutes: number | null;
  imageUrl: string | null;
  author: { id: number; name: string } | null;
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
  if (!book) return <div className="text-muted-foreground">Book not found</div>;

  const existingIds = new Set(book.entries.map((e) => e.recipe.id));

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <Link href="/books">
            <Button variant="ghost" size="icon" className="h-8 w-8"><ArrowLeft className="h-4 w-4" /></Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold">{book.name}</h1>
            {book.description && <p className="text-sm text-muted-foreground">{book.description}</p>}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant={book.isPublished ? "secondary" : "outline"}
            size="sm"
            onClick={togglePublish}
            disabled={publishing}
          >
            {publishing ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <Globe className="mr-2 h-3.5 w-3.5" />}
            {book.isPublished ? "Published" : "Publish"}
          </Button>
          <Button variant="outline" size="sm" onClick={shareBook} disabled={sharing}>
            {sharing ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <Share2 className="mr-2 h-3.5 w-3.5" />}
            Share
          </Button>
          <Link href={`/recipes/new?bookId=${book.id}`}>
            <Button variant="outline" size="sm">
              <Plus className="mr-2 h-3.5 w-3.5" />
              New Recipe
            </Button>
          </Link>
          <Button size="sm" onClick={() => { setAddOpen(true); setSearch(""); setAddedIds(new Set()); }}>
            <Plus className="mr-2 h-3.5 w-3.5" />
            Add Recipes
          </Button>
        </div>
      </div>

      {/* Public blog link */}
      {book.isPublished && book.slug && (
        <div className="flex flex-col gap-2 rounded-2xl border border-border/60 bg-card px-4 py-3 shadow-sm sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2 text-sm">
            <Globe className="h-4 w-4 text-primary" />
            <span className="text-muted-foreground">Live publicly at</span>
            <code className="rounded bg-muted px-1.5 py-0.5 text-xs">/blog/{book.slug}</code>
          </div>
          <a href={`/blog/${book.slug}`} target="_blank" rel="noopener noreferrer">
            <Button size="sm" variant="outline">
              <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
              View blog
            </Button>
          </a>
        </div>
      )}

      {/* Share URL */}
      {shareUrl && (
        <div className="flex items-center gap-2 rounded-2xl border border-border/60 bg-card px-4 py-3 shadow-sm">
          <span className="flex-1 truncate text-sm text-muted-foreground">{shareUrl}</span>
          <Button size="sm" variant="outline" onClick={copyShareUrl}>
            {copied ? <Check className="mr-1.5 h-3.5 w-3.5" /> : <Copy className="mr-1.5 h-3.5 w-3.5" />}
            {copied ? "Copied" : "Copy"}
          </Button>
        </div>
      )}

      {/* Collaborators (cookbook owner only) */}
      {isOwner && (
        <div className="rounded-2xl border border-border/60 bg-card px-4 py-3 shadow-sm">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <UserPlus className="h-4 w-4 text-primary" /> Collaborators
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Invite people from other households to help with this cookbook. They keep their own
            kitchen and can be credited as recipe authors. No account yet? They&apos;ll get an email
            inviting them to sign up and accept.
          </p>
          {collaborators.length > 0 && (
            <div className="mt-3 space-y-1.5">
              {collaborators.map((c) => (
                <div key={c.id} className="flex items-center justify-between rounded-lg border border-border/60 px-3 py-1.5 text-sm">
                  <span>{c.name} <span className="text-muted-foreground">· {c.email}</span></span>
                  <button onClick={() => removeCollaborator(c.id)} className="text-muted-foreground hover:text-destructive" title="Remove">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
          {invites.length > 0 && (
            <div className="mt-3 space-y-1.5">
              {invites.map((i) => (
                <div key={i.email} className="flex items-center justify-between rounded-lg border border-dashed border-border/60 px-3 py-1.5 text-sm">
                  <span className="text-muted-foreground">{i.email} · invited (pending)</span>
                  <button onClick={() => removeInvite(i.email)} className="text-muted-foreground hover:text-destructive" title="Cancel invite">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
          <div className="mt-3 flex gap-2">
            <Input
              type="email"
              placeholder="collaborator@email.com"
              value={collabEmail}
              onChange={(e) => { setCollabEmail(e.target.value); setCollabError(""); }}
              onKeyDown={(e) => e.key === "Enter" && addCollaborator()}
              className="max-w-xs"
            />
            <Button size="sm" onClick={addCollaborator} disabled={collabBusy || !collabEmail.trim()}>
              {collabBusy ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <UserPlus className="mr-1.5 h-3.5 w-3.5" />}
              Add
            </Button>
          </div>
          {collabError && <p className="mt-1.5 text-xs text-destructive">{collabError}</p>}
          {collabNotice && <p className="mt-1.5 text-xs text-emerald-600 dark:text-emerald-400">{collabNotice}</p>}
        </div>
      )}

      {/* Recipe list */}
      {book.entries.length === 0 ? (
        <div className="py-12 text-center text-muted-foreground">
          No recipes in this book yet. Click &quot;Add Recipes&quot; to get started.
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {book.entries.map((entry) => {
            const recipe = entry.recipe;
            const totalTime = (recipe.prepTimeMinutes || 0) + (recipe.cookTimeMinutes || 0);
            return (
              <Card key={entry.id} className="group overflow-hidden transition-all hover:shadow-md">
                {recipe.imageUrl && (
                  <Link href={`/recipes/${recipe.id}`}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={recipe.imageUrl} alt={recipe.name} className="h-32 w-full object-cover" />
                  </Link>
                )}
                <CardContent className="p-5">
                  <div className="flex items-start justify-between gap-2">
                    <Link href={`/recipes/${recipe.id}`} className="flex-1">
                      <h3 className="text-sm font-semibold group-hover:text-primary transition-colors">{recipe.name}</h3>
                      {recipe.description && <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{recipe.description}</p>}
                      <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                        {totalTime > 0 && <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{totalTime}m</span>}
                        <span className="flex items-center gap-1"><Users className="h-3 w-3" />{recipe.servings}</span>
                        {recipe.author?.name && (
                          <span className="flex items-center gap-1"><UserRound className="h-3 w-3" />{recipe.author.name}</span>
                        )}
                      </div>
                    </Link>
                    <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0 text-destructive" onClick={() => removeRecipe(recipe.id)}>
                      <Trash2 className="h-3.5 w-3.5" />
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
          <DialogHeader><DialogTitle>Add Recipes to Book</DialogTitle></DialogHeader>
          <SearchInput value={search} onChange={setSearch} placeholder="Search your recipes..." />
          <div className="max-h-64 space-y-1 overflow-y-auto">
            {searchResults.map((recipe) => {
              const alreadyIn = existingIds.has(recipe.id) || addedIds.has(recipe.id);
              return (
                <div key={recipe.id} className="flex items-center justify-between rounded-lg px-3 py-2.5 hover:bg-muted">
                  <span className="text-sm">{recipe.name}</span>
                  <Button size="sm" variant={alreadyIn ? "secondary" : "default"} disabled={alreadyIn} onClick={() => addRecipe(recipe.id)}>
                    {alreadyIn ? <><Check className="mr-1 h-3 w-3" /> Added</> : <><Plus className="mr-1 h-3 w-3" /> Add</>}
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
