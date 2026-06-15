"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Pencil, Loader2, Upload, X } from "lucide-react";

interface Props {
  bookId: number;
  canEdit: boolean;
  name: string;
  description: string | null;
  coverImageUrl: string | null;
}

// The published cookbook's header. Owners (and admins) get an inline editor to
// set the title, intro text, and cover image; everyone else sees the result.
export function BlogHeaderEditor({ bookId, canEdit, name, description, coverImageUrl }: Props) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(name);
  const [intro, setIntro] = useState(description ?? "");
  const [cover, setCover] = useState(coverImageUrl);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  async function uploadCover(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError("");
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/images", { method: "POST", body: fd });
      const data = await res.json();
      if (res.ok && data.url) setCover(data.url);
      else setError(data.error || "Upload failed");
    } catch {
      setError("Upload failed");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function save() {
    setSaving(true);
    setError("");
    try {
      const res = await fetch(`/api/books/${bookId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: title, description: intro, coverImageUrl: cover }),
      });
      if (res.ok) setEditing(false);
      else setError("Could not save the header");
    } catch {
      setError("Could not save the header");
    } finally {
      setSaving(false);
    }
  }

  if (editing) {
    return (
      <div className="mb-6 space-y-4 rounded-2xl border border-border/60 bg-card/50 p-5">
        <div className="space-y-2">
          <Label htmlFor="hdr-title">Title</Label>
          <Input id="hdr-title" value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="hdr-intro">Intro</Label>
          <Textarea id="hdr-intro" rows={3} value={intro} onChange={(e) => setIntro(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label>Cover image</Label>
          <div className="flex items-center gap-3">
            {cover && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={cover} alt="" className="h-16 w-24 shrink-0 rounded-lg object-cover" />
            )}
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={uploadCover} />
            <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={uploading}>
              {uploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
              {cover ? "Change" : "Upload"}
            </Button>
            {cover && (
              <Button type="button" variant="ghost" size="sm" onClick={() => setCover(null)}>
                <X className="mr-1 h-3.5 w-3.5" /> Remove
              </Button>
            )}
          </div>
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <div className="flex gap-2">
          <Button onClick={save} disabled={saving || uploading}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save header
          </Button>
          <Button variant="outline" onClick={() => setEditing(false)}>Cancel</Button>
        </div>
      </div>
    );
  }

  // Cover image → immersive hero with the title overlaid; otherwise a clean,
  // centered editorial masthead.
  if (cover) {
    return (
      <div className="relative mb-8 overflow-hidden rounded-3xl">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={cover} alt={title} className="h-72 w-full object-cover sm:h-80" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/25 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 p-6 sm:p-8">
          <h1 className="font-display text-4xl font-semibold tracking-tight text-white drop-shadow-sm sm:text-5xl">
            {title}
          </h1>
          {intro && <p className="mt-2 max-w-2xl text-sm text-white/85">{intro}</p>}
        </div>
        {canEdit && (
          <Button
            variant="outline"
            size="sm"
            className="absolute right-4 top-4 border-white/40 bg-white/85 hover:bg-white"
            onClick={() => setEditing(true)}
          >
            <Pencil className="mr-1.5 h-3.5 w-3.5" /> Edit header
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="mb-8 text-center">
      {canEdit && (
        <div className="mb-3 flex justify-end">
          <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
            <Pencil className="mr-1.5 h-3.5 w-3.5" /> Edit header
          </Button>
        </div>
      )}
      <h1 className="font-display text-4xl font-semibold tracking-tight sm:text-5xl">{title}</h1>
      {intro && <p className="mx-auto mt-3 max-w-2xl text-muted-foreground">{intro}</p>}
      <div className="mx-auto mt-5 h-px w-16 bg-primary/40" />
    </div>
  );
}
