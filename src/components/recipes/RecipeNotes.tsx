"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2 } from "lucide-react";

export interface RecipeNote {
  id: number;
  body: string;
  createdByName: string | null;
  createdAt: string;
}

interface RecipeNotesProps {
  recipeId: number;
  initialNotes?: RecipeNote[];
  readOnly?: boolean;
}

export function RecipeNotes({ recipeId, initialNotes, readOnly = false }: RecipeNotesProps) {
  const [notes, setNotes] = useState<RecipeNote[]>(initialNotes ?? []);
  const [loading, setLoading] = useState(initialNotes === undefined);
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (initialNotes !== undefined) return;
    let active = true;
    fetch(`/api/recipes/${recipeId}/notes`)
      .then((r) => r.json())
      .then((data) => {
        if (!active) return;
        setNotes(Array.isArray(data) ? data : []);
        setLoading(false);
      })
      .catch(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [recipeId, initialNotes]);

  async function addNote() {
    const body = text.trim();
    if (!body) return;
    setSaving(true);
    setError("");

    const res = await fetch(`/api/recipes/${recipeId}/notes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body }),
    });

    if (res.ok) {
      const note: RecipeNote = await res.json();
      setNotes((prev) => [note, ...prev]);
      setText("");
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Could not save note");
    }
    setSaving(false);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Notes</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {!readOnly && (
          <div className="space-y-2">
            <Textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Add a note about this recipe (tweaks, substitutions, how it turned out)..."
              rows={3}
            />
            {error && <p className="text-sm text-destructive">{error}</p>}
            <div className="flex justify-end">
              <Button onClick={addNote} disabled={saving || !text.trim()} size="sm">
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Add Note
              </Button>
            </div>
          </div>
        )}

        {loading ? (
          <p className="text-sm text-muted-foreground">Loading notes...</p>
        ) : notes.length === 0 ? (
          <p className="text-sm text-muted-foreground">No notes yet.</p>
        ) : (
          <ul className="space-y-3">
            {notes.map((note) => (
              <li
                key={note.id}
                className="rounded-lg border border-border/60 bg-muted/30 p-3"
              >
                <p className="whitespace-pre-wrap text-sm">{note.body}</p>
                <p className="mt-1.5 text-xs text-muted-foreground">
                  {note.createdByName ? `${note.createdByName} · ` : ""}
                  {new Date(note.createdAt).toLocaleString()}
                </p>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
