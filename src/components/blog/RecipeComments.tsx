"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, MessageCircle, Trash2 } from "lucide-react";
import { TurnstileWidget, turnstileEnabled, type TurnstileHandle } from "@/components/shared/TurnstileWidget";

interface Comment {
  id: number;
  authorName: string;
  body: string;
  createdAt: string;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

export function RecipeComments({ recipeId, canModerate }: { recipeId: number; canModerate: boolean }) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [name, setName] = useState("");
  const [body, setBody] = useState("");
  const [website, setWebsite] = useState(""); // honeypot
  const [token, setToken] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const turnstileRef = useRef<TurnstileHandle>(null);

  useEffect(() => {
    fetch(`/api/blog/comments?recipeId=${recipeId}`)
      .then((r) => r.json())
      .then((d) => setComments(d.comments ?? []))
      .catch(() => {});
  }, [recipeId]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!name.trim() || !body.trim()) {
      setError("Please add your name and a comment.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/blog/comments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipeId, authorName: name, body, website, turnstileToken: token }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Could not post your comment.");
        turnstileRef.current?.reset();
        return;
      }
      if (data.comment) setComments((prev) => [...prev, data.comment]);
      setBody("");
      turnstileRef.current?.reset();
      setToken("");
    } catch {
      setError("Could not post your comment.");
    } finally {
      setSubmitting(false);
    }
  }

  async function remove(id: number) {
    const res = await fetch(`/api/blog/comments/${id}`, { method: "DELETE" });
    if (res.ok) setComments((prev) => prev.filter((c) => c.id !== id));
  }

  return (
    <section className="mt-10 border-t border-border/60 pt-6">
      <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold">
        <MessageCircle className="h-5 w-5 text-primary" />
        Comments{comments.length > 0 ? ` (${comments.length})` : ""}
      </h2>

      <div className="space-y-4">
        {comments.length === 0 && (
          <p className="text-sm text-muted-foreground">Be the first to comment.</p>
        )}
        {comments.map((c) => (
          <div key={c.id} className="rounded-xl border border-border/60 bg-card/50 p-4">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-semibold">{c.authorName}</span>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">{formatDate(c.createdAt)}</span>
                {canModerate && (
                  <button
                    onClick={() => remove(c.id)}
                    className="text-muted-foreground hover:text-destructive"
                    title="Delete comment"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>
            <p className="mt-1 whitespace-pre-wrap text-sm">{c.body}</p>
          </div>
        ))}
      </div>

      <form onSubmit={submit} className="mt-6 space-y-3">
        <h3 className="text-sm font-semibold">Leave a comment</h3>
        <div className="grid gap-3 sm:grid-cols-[1fr]">
          <div className="space-y-1.5">
            <Label htmlFor="c-name">Name</Label>
            <Input id="c-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="c-body">Comment</Label>
            <Textarea id="c-body" value={body} onChange={(e) => setBody(e.target.value)} rows={3} maxLength={5000} required />
          </div>
        </div>
        {/* Honeypot — hidden from humans, bots tend to fill it. */}
        <input
          type="text"
          tabIndex={-1}
          autoComplete="off"
          value={website}
          onChange={(e) => setWebsite(e.target.value)}
          className="hidden"
          aria-hidden="true"
        />
        <TurnstileWidget ref={turnstileRef} onToken={setToken} />
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button type="submit" disabled={submitting || (turnstileEnabled && !token)}>
          {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Post comment
        </Button>
      </form>
    </section>
  );
}
