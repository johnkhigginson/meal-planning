"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, Rss, Loader2, Upload, CheckCircle2, AlertTriangle, ExternalLink, Sparkles } from "lucide-react";

interface MigrateResult {
  blogTitle: string;
  bookId: number;
  bookName: string;
  totalPosts: number;
  imported: number;
  updated: number;
  skipped: number;
  importedComments: number;
  errors: string[];
}

interface AiProgress {
  processed: number;
  withIngredients: number;
  remaining: number;
  done: boolean;
}

interface Member {
  id: number;
  name: string;
  email?: string;
  household?: { id: number; name: string };
}

export default function MigratePage() {
  const { data: session } = useSession();
  const isAdmin = (session?.user as { systemRole?: string } | undefined)?.systemRole === "ADMIN";
  const currentUserId = session?.user?.id ?? "";

  const [blogUrl, setBlogUrl] = useState("therecipesociety.blogspot.com");
  const [bookName, setBookName] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [ownerId, setOwnerId] = useState<string>("");
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<MigrateResult | null>(null);
  const [aiRunning, setAiRunning] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiProgress, setAiProgress] = useState<AiProgress | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Load all users (admin scope) so the importer can hand ownership to any
  // account — including someone in their own separate household, e.g. Mom.
  // The cookbook and recipes are created in the chosen owner's household.
  useEffect(() => {
    fetch("/api/admin/users")
      .then((r) => r.json())
      .then((data: { users?: Member[] }) => {
        setMembers(data.users ?? []);
        setOwnerId((prev) => prev || currentUserId);
      })
      .catch(() => {});
  }, [currentUserId]);

  const selectedOwner = members.find((m) => String(m.id) === ownerId);

  async function runImport() {
    setRunning(true);
    setError(null);
    setResult(null);

    try {
      const owner = ownerId ? parseInt(ownerId, 10) : undefined;
      let res: Response;
      if (file) {
        // Offline path: send the Blogger XML export as multipart.
        const fd = new FormData();
        fd.append("file", file);
        if (bookName.trim()) fd.append("bookName", bookName.trim());
        if (owner) fd.append("ownerUserId", String(owner));
        res = await fetch("/api/admin/migrate-blog", { method: "POST", body: fd });
      } else {
        // Live path: fetch the blog's feed server-side.
        res = await fetch("/api/admin/migrate-blog", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ blogUrl, bookName: bookName.trim() || undefined, ownerUserId: owner }),
        });
      }

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Import failed");
      } else {
        setResult(data);
      }
    } catch {
      setError("Something went wrong running the import.");
    } finally {
      setRunning(false);
    }
  }

  // Loop the batched AI pass until every imported recipe has been processed.
  async function runAiExtraction() {
    setAiRunning(true);
    setAiError(null);
    setAiProgress(null);
    const owner = ownerId ? parseInt(ownerId, 10) : undefined;
    let processedTotal = 0;
    let ingredientsTotal = 0;
    try {
      for (let i = 0; i < 1000; i++) {
        const res = await fetch("/api/admin/extract-ingredients", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ownerUserId: owner, limit: 6 }),
        });
        const d = await res.json();
        if (!res.ok) {
          setAiError(d.error || "Extraction failed");
          break;
        }
        processedTotal += d.processed;
        ingredientsTotal += d.withIngredients;
        setAiProgress({
          processed: processedTotal,
          withIngredients: ingredientsTotal,
          remaining: d.remaining,
          done: d.done,
        });
        // Stop when finished, or when a batch made no progress (persistent errors).
        if (d.done || d.processed === 0) break;
      }
    } catch {
      setAiError("Something went wrong during AI extraction.");
    } finally {
      setAiRunning(false);
    }
  }

  if (!isAdmin) {
    return (
      <div className="py-12 text-center text-muted-foreground">
        Only admins can run blog migrations.
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-center gap-2">
        <Link href="/admin">
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold">Import from Blogger</h1>
          <p className="text-sm text-muted-foreground">
            Migrate a Blogspot blog into a cookbook. Each post becomes a recipe with its
            original content preserved.
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Rss className="h-4 w-4 text-primary" /> Source
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="blogUrl">Blog address</Label>
            <Input
              id="blogUrl"
              value={blogUrl}
              onChange={(e) => setBlogUrl(e.target.value)}
              placeholder="yourblog.blogspot.com"
              disabled={!!file}
            />
            <p className="text-xs text-muted-foreground">
              Pulls every post from the blog&apos;s public feed. Requires the blog host to be
              reachable from the server.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="h-px flex-1 bg-border" />
            <span className="text-xs uppercase tracking-wide text-muted-foreground">or upload export</span>
            <div className="h-px flex-1 bg-border" />
          </div>

          <div className="space-y-2">
            <Label>Blogger XML export</Label>
            <input
              ref={fileRef}
              type="file"
              accept=".xml,application/xml,text/xml"
              className="hidden"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
            <div className="flex items-center gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
                <Upload className="mr-2 h-4 w-4" />
                {file ? "Change file" : "Choose XML file"}
              </Button>
              {file && (
                <span className="text-xs text-muted-foreground">
                  {file.name}{" "}
                  <button className="underline" onClick={() => { setFile(null); if (fileRef.current) fileRef.current.value = ""; }}>
                    remove
                  </button>
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Blogger → Settings → Manage blog → Back up content. Works fully offline.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="bookName">Cookbook name (optional)</Label>
            <Input
              id="bookName"
              value={bookName}
              onChange={(e) => setBookName(e.target.value)}
              placeholder="Defaults to the blog's title"
            />
          </div>

          {members.length > 0 && (
            <div className="space-y-2">
              <Label>Owner</Label>
              <Select value={ownerId} onValueChange={(v) => v && setOwnerId(v)}>
                <SelectTrigger>
                  <SelectValue>
                    {selectedOwner
                      ? `${selectedOwner.name}${selectedOwner.household ? ` · ${selectedOwner.household.name}` : ""}`
                      : "Choose an owner"}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {members.map((m) => (
                    <SelectItem key={m.id} value={String(m.id)}>
                      {m.name}
                      {m.household ? ` · ${m.household.name}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                The cookbook and every imported recipe are created in this person&apos;s
                household and owned by them — not just attributed.
                {selectedOwner?.household && (
                  <>
                    {" "}
                    Importing into <span className="font-medium">{selectedOwner.household.name}</span>.
                  </>
                )}
              </p>
            </div>
          )}

          <p className="text-xs text-muted-foreground">
            Re-running is safe: posts already imported are <span className="font-medium">updated</span> in
            place (description, full post content, photo) rather than duplicated.
          </p>

          <Button onClick={runImport} disabled={running || (!file && !blogUrl.trim())}>
            {running ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Rss className="mr-2 h-4 w-4" />}
            {running ? "Importing…" : "Start import"}
          </Button>

          {error && (
            <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </CardContent>
      </Card>

      {result && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <CheckCircle2 className="h-4 w-4 text-green-600" /> Import complete
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="grid grid-cols-3 gap-3">
              <Stat label="New" value={result.imported} />
              <Stat label="Updated" value={result.updated} />
              <Stat label="Total posts" value={result.totalPosts} />
            </div>
            <p className="text-muted-foreground">
              Added to <span className="font-medium text-foreground">{result.bookName}</span>.
              {result.importedComments > 0 && ` Imported ${result.importedComments} comment${result.importedComments === 1 ? "" : "s"}.`}
              {" "}Next, run AI extraction below to pull structured ingredients from the posts.
            </p>
            <div className="flex gap-2">
              <Link href={`/books/${result.bookId}`}>
                <Button size="sm" variant="outline">
                  <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
                  Open cookbook
                </Button>
              </Link>
            </div>
            {result.errors.length > 0 && (
              <div className="rounded-lg border border-border/60 bg-muted/40 p-3">
                <p className="mb-1 font-medium">Some posts had issues:</p>
                <ul className="list-disc space-y-0.5 pl-5 text-xs text-muted-foreground">
                  {result.errors.map((e, i) => (
                    <li key={i}>{e}</li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Step 2 — AI ingredient extraction. Runnable any time for the selected
          owner; processes in batches and loops until done. */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Sparkles className="h-4 w-4 text-primary" /> Extract ingredients with AI
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p className="text-muted-foreground">
            Reads each imported post and pulls out structured ingredients and steps
            {selectedOwner ? <> for <span className="font-medium text-foreground">{selectedOwner.name}</span></> : null}.
            Posts without a real recipe are skipped. Safe to run repeatedly — it only
            processes recipes it hasn&apos;t handled yet.
          </p>

          <Button onClick={runAiExtraction} disabled={aiRunning} variant="outline">
            {aiRunning ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
            {aiRunning ? "Extracting…" : "Run AI extraction"}
          </Button>

          {aiProgress && (
            <div className="rounded-lg border border-border/60 bg-muted/40 p-3 text-xs">
              Processed <span className="font-medium">{aiProgress.processed}</span> · added ingredients to{" "}
              <span className="font-medium">{aiProgress.withIngredients}</span> · {aiProgress.remaining} remaining
              {aiProgress.done && " · done ✓"}
            </div>
          )}

          {aiError && (
            <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-destructive">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{aiError}</span>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-border/60 bg-card p-3 text-center">
      <div className="text-2xl font-bold">{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}
