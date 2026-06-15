"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { IngredientInput, type RecipeIngredientRow } from "./IngredientInput";
import { Plus, Loader2, Globe, Upload, Camera, X } from "lucide-react";
import { useSession } from "next-auth/react";
import { trackEvent } from "@/lib/analytics";

interface Unit {
  id: number;
  name: string;
  abbreviation: string;
  unitType: string;
}

interface Tag {
  id: number;
  name: string;
  householdId: number | null;
}

interface Member {
  id: number;
  name: string;
}

interface RecipeFormData {
  name: string;
  description: string;
  instructions: string;
  servings: number;
  prepTimeMinutes: number | null;
  cookTimeMinutes: number | null;
  sourceType: string;
  sourceUrl: string;
  sourceBookTitle: string;
  sourceBookPage: string;
  authorId: number | null;
  imageUrl: string;
  isFavorite: boolean;
  ingredients: RecipeIngredientRow[];
  tagIds: number[];
}

interface RecipeFormProps {
  initialData?: RecipeFormData;
  recipeId?: number;
  // When set, a newly-created recipe is added to this cookbook (collaborator
  // contribution). The recipe is created in the cookbook's household.
  bookId?: number;
}

let ingredientKeyCounter = 0;

function newIngredientRow(): RecipeIngredientRow {
  return {
    key: `ing-${++ingredientKeyCounter}-${Date.now()}`,
    ingredientId: 0,
    ingredientName: "",
    quantity: 0,
    unitId: 0,
    notes: "",
    optional: false,
  };
}

export function RecipeForm({ initialData, recipeId, bookId }: RecipeFormProps) {
  const router = useRouter();
  const { data: session } = useSession();
  const myHouseholdId = session?.user
    ? (session.user as { householdId?: string }).householdId ?? null
    : null;
  const fileInputRef = useRef<HTMLInputElement>(null);
  const photoUploadRef = useRef<HTMLInputElement>(null);
  const [saving, setSaving] = useState(false);
  const [scraping, setScraping] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [parsingPhoto, setParsingPhoto] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [units, setUnits] = useState<Unit[]>([]);
  const [allTags, setAllTags] = useState<Tag[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [newTagName, setNewTagName] = useState("");
  // Raw ingredient strings from scrape/photo that haven't been matched to DB ingredients yet
  const [rawIngredients, setRawIngredients] = useState<string[]>([]);

  const [form, setForm] = useState<RecipeFormData>(
    initialData || {
      name: "",
      description: "",
      instructions: "",
      servings: 4,
      prepTimeMinutes: null,
      cookTimeMinutes: null,
      sourceType: "PERSONAL",
      sourceUrl: "",
      sourceBookTitle: "",
      sourceBookPage: "",
      authorId: null,
      imageUrl: "",
      isFavorite: false,
      ingredients: [newIngredientRow()],
      tagIds: [],
    }
  );

  useEffect(() => {
    fetch("/api/units").then((r) => r.json()).then(setUnits);
    fetch("/api/tags").then((r) => r.json()).then(setAllTags);
    // For an existing recipe, the eligible authors are its household members
    // plus collaborators on any cookbook it's in; for a new recipe, household
    // members (or the target cookbook's people when contributing to one).
    const authorsUrl = recipeId
      ? `/api/recipes/${recipeId}/authors`
      : bookId
        ? `/api/books/${bookId}/authors`
        : "/api/household/members";
    fetch(authorsUrl)
      .then((r) => r.json())
      .then((d) => setMembers(Array.isArray(d) ? d : []))
      .catch(() => {});
  }, [recipeId, bookId]);

  function updateForm<K extends keyof RecipeFormData>(
    key: K,
    value: RecipeFormData[K]
  ) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handlePhotoFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingPhoto(true);
    setImportError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/images", { method: "POST", body: fd });
      const data = await res.json();
      if (res.ok && data.url) {
        updateForm("imageUrl", data.url);
      } else {
        setImportError(data.error || "Failed to upload photo");
      }
    } catch {
      setImportError("Failed to upload photo");
    } finally {
      setUploadingPhoto(false);
      if (photoUploadRef.current) photoUploadRef.current.value = "";
    }
  }

  function updateIngredient(index: number, row: RecipeIngredientRow) {
    const updated = [...form.ingredients];
    updated[index] = row;
    updateForm("ingredients", updated);
  }

  function removeIngredient(index: number) {
    if (form.ingredients.length <= 1) return;
    updateForm(
      "ingredients",
      form.ingredients.filter((_, i) => i !== index)
    );
  }

  function toggleTag(tagId: number) {
    updateForm(
      "tagIds",
      form.tagIds.includes(tagId)
        ? form.tagIds.filter((id) => id !== tagId)
        : [...form.tagIds, tagId]
    );
  }

  async function createTag() {
    if (!newTagName.trim()) return;
    // Scope the new category to the recipe's household: the target cookbook when
    // contributing as a collaborator, or the recipe being edited.
    const res = await fetch("/api/tags", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newTagName.trim(), bookId, recipeId }),
    });
    if (res.ok) {
      const tag = await res.json();
      setAllTags((prev) =>
        prev.some((t) => t.id === tag.id)
          ? prev
          : [...prev, tag].sort((a, b) => a.name.localeCompare(b.name))
      );
      if (!form.tagIds.includes(tag.id)) updateForm("tagIds", [...form.tagIds, tag.id]);
      setNewTagName("");
    }
  }

  // A custom category owned by my household can be deleted. Standard categories
  // (householdId null) and other households' categories cannot.
  function canDeleteTag(tag: Tag) {
    return tag.householdId != null && myHouseholdId != null && String(tag.householdId) === myHouseholdId;
  }

  async function deleteTag(tag: Tag) {
    if (!confirm(`Delete the category “${tag.name}”? It will be removed from all your recipes.`)) return;
    const res = await fetch(`/api/tags/${tag.id}`, { method: "DELETE" });
    if (res.ok) {
      setAllTags((prev) => prev.filter((t) => t.id !== tag.id));
      if (form.tagIds.includes(tag.id)) updateForm("tagIds", form.tagIds.filter((id) => id !== tag.id));
    }
  }

  // Apply scraped/parsed data to the form
  async function applyImportedData(data: {
    name?: string;
    description?: string;
    instructions?: string;
    servings?: number | null;
    prepTimeMinutes?: number | null;
    cookTimeMinutes?: number | null;
    ingredients?: string[];
    imageUrl?: string | null;
  }) {
    setForm((prev) => ({
      ...prev,
      name: data.name || prev.name,
      description: data.description || prev.description,
      instructions: data.instructions || prev.instructions,
      servings: data.servings || prev.servings,
      prepTimeMinutes: data.prepTimeMinutes ?? prev.prepTimeMinutes,
      cookTimeMinutes: data.cookTimeMinutes ?? prev.cookTimeMinutes,
      imageUrl: data.imageUrl || prev.imageUrl,
    }));

    // Auto-parse ingredient strings into structured rows
    if (data.ingredients && data.ingredients.length > 0) {
      try {
        const parseRes = await fetch("/api/ingredients/parse", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ingredients: data.ingredients }),
        });
        if (parseRes.ok) {
          const parsed = await parseRes.json();
          if (Array.isArray(parsed) && parsed.length > 0) {
            const rows: RecipeIngredientRow[] = parsed.map(
              (p: { ingredientId: number; ingredientName: string; quantity: number; unitId: number; notes: string; optional: boolean }, idx: number) => ({
                key: `parsed-${p.ingredientId}-${idx}`,
                ingredientId: p.ingredientId,
                ingredientName: p.ingredientName,
                quantity: p.quantity,
                unitId: p.unitId,
                notes: p.notes,
                optional: p.optional,
              })
            );
            updateForm("ingredients", rows);
          }
        }
      } catch {
        // Fall back to showing raw strings
        setRawIngredients(data.ingredients);
      }
    }
  }

  async function handleScrapeUrl() {
    if (!form.sourceUrl) return;
    setScraping(true);
    setImportError(null);

    try {
      const res = await fetch("/api/recipes/scrape", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: form.sourceUrl }),
      });

      if (!res.ok) {
        const err = await res.json();
        setImportError(err.error || "Failed to scrape recipe");
        return;
      }

      const data = await res.json();
      applyImportedData(data);
      trackEvent("recipe_url_import");
    } catch {
      setImportError("Failed to connect to URL");
    } finally {
      setScraping(false);
    }
  }

  async function handlePhotoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setParsingPhoto(true);
    setImportError(null);

    try {
      const formData = new FormData();
      formData.append("photo", file);

      const res = await fetch("/api/recipes/parse-photo", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const err = await res.json();
        setImportError(err.error || "Failed to parse photo");
        return;
      }

      const data = await res.json();
      applyImportedData(data);
    } catch {
      setImportError("Failed to parse photo");
    } finally {
      setParsingPhoto(false);
      // Reset file input
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);

    const payload = {
      name: form.name,
      description: form.description || undefined,
      instructions: form.instructions,
      servings: form.servings,
      prepTimeMinutes: form.prepTimeMinutes || undefined,
      cookTimeMinutes: form.cookTimeMinutes || undefined,
      sourceType: form.sourceType,
      sourceUrl: form.sourceType === "WEBSITE" ? form.sourceUrl || undefined : undefined,
      sourceBookTitle: form.sourceType === "BOOK" ? form.sourceBookTitle || undefined : undefined,
      sourceBookPage: form.sourceType === "BOOK" ? form.sourceBookPage || undefined : undefined,
      authorId: form.authorId,
      imageUrl: form.imageUrl.trim() || undefined,
      // Only on create: contribute the new recipe into a cookbook.
      bookId: !recipeId && bookId ? bookId : undefined,
      isFavorite: form.isFavorite,
      ingredients: form.ingredients
        .filter((ing) => ing.ingredientId > 0 && ing.quantity > 0 && ing.unitId > 0)
        .map((ing, idx) => ({
          ingredientId: ing.ingredientId,
          quantity: ing.quantity,
          unitId: ing.unitId,
          notes: ing.notes || undefined,
          optional: ing.optional,
          sortOrder: idx,
        })),
      tagIds: form.tagIds,
    };

    const url = recipeId ? `/api/recipes/${recipeId}` : "/api/recipes";
    const method = recipeId ? "PUT" : "POST";

    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    setSaving(false);

    if (res.ok) {
      const recipe = await res.json();
      trackEvent(recipeId ? "recipe_updated" : "recipe_created", { source_type: form.sourceType });
      router.push(`/recipes/${recipe.id}`);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Source — First */}
      <Card>
        <CardHeader>
          <CardTitle>Source</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Select
            value={form.sourceType}
            onValueChange={(v) => updateForm("sourceType", v ?? "PERSONAL")}
          >
            <SelectTrigger>
              <SelectValue>
                {{ PERSONAL: "Personal Recipe", WEBSITE: "Website", BOOK: "Cookbook / Book", BLOG: "Blog Post" }[form.sourceType] ?? "Personal Recipe"}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="PERSONAL">Personal Recipe</SelectItem>
              <SelectItem value="WEBSITE">Website</SelectItem>
              <SelectItem value="BOOK">Cookbook / Book</SelectItem>
            </SelectContent>
          </Select>

          {form.sourceType === "WEBSITE" && (
            <div className="space-y-3">
              <div className="space-y-2">
                <Label htmlFor="sourceUrl">Website URL</Label>
                <div className="flex gap-2">
                  <Input
                    id="sourceUrl"
                    type="url"
                    value={form.sourceUrl}
                    onChange={(e) => updateForm("sourceUrl", e.target.value)}
                    placeholder="https://www.allrecipes.com/recipe/..."
                    className="flex-1"
                  />
                  <Button
                    type="button"
                    onClick={handleScrapeUrl}
                    disabled={scraping || !form.sourceUrl}
                  >
                    {scraping ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Globe className="mr-2 h-4 w-4" />
                    )}
                    {scraping ? "Importing..." : "Import"}
                  </Button>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Paste a recipe URL and click Import to auto-fill the recipe details
              </p>
            </div>
          )}

          {form.sourceType === "BOOK" && (
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="bookTitle">Book Title</Label>
                  <Input
                    id="bookTitle"
                    value={form.sourceBookTitle}
                    onChange={(e) =>
                      updateForm("sourceBookTitle", e.target.value)
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="bookPage">Page</Label>
                  <Input
                    id="bookPage"
                    value={form.sourceBookPage}
                    onChange={(e) =>
                      updateForm("sourceBookPage", e.target.value)
                    }
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Upload Photo of Recipe</Label>
                <div className="flex gap-2">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    onChange={handlePhotoUpload}
                    className="hidden"
                    id="photo-upload"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={parsingPhoto}
                  >
                    {parsingPhoto ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Upload className="mr-2 h-4 w-4" />
                    )}
                    {parsingPhoto ? "Parsing..." : "Upload Photo"}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      if (fileInputRef.current) {
                        fileInputRef.current.setAttribute("capture", "environment");
                        fileInputRef.current.click();
                      }
                    }}
                    disabled={parsingPhoto}
                  >
                    <Camera className="mr-2 h-4 w-4" />
                    Take Photo
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Take a photo or upload an image of a cookbook page to auto-extract the recipe
                </p>
              </div>
            </div>
          )}

          {importError && (
            <p className="text-sm text-destructive">{importError}</p>
          )}
        </CardContent>
      </Card>

      {/* Raw imported ingredients (from scrape/photo) */}
      {rawIngredients.length > 0 && (
        <Card className="border-blue-200 bg-blue-50/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Imported Ingredients</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="text-sm text-muted-foreground">
              These ingredients were imported from the source. Add them to the
              ingredient list below by matching each to an ingredient in your database.
            </p>
            <ul className="space-y-1">
              {rawIngredients.map((ing, i) => (
                <li key={i} className="text-sm">
                  {ing}
                </li>
              ))}
            </ul>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setRawIngredients([])}
            >
              Dismiss
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Basic Info */}
      <Card>
        <CardHeader>
          <CardTitle>Basic Info</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Recipe Name *</Label>
            <Input
              id="name"
              value={form.name}
              onChange={(e) => updateForm("name", e.target.value)}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={form.description}
              onChange={(e) => updateForm("description", e.target.value)}
              rows={2}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="imageUrl">Photo</Label>
            <div className="flex items-start gap-3">
              {form.imageUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={form.imageUrl}
                  alt="Recipe preview"
                  className="h-16 w-16 shrink-0 rounded-lg object-cover"
                />
              )}
              <div className="flex-1 space-y-2">
                <input
                  ref={photoUploadRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handlePhotoFileUpload}
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => photoUploadRef.current?.click()}
                  disabled={uploadingPhoto}
                >
                  {uploadingPhoto ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Upload className="mr-2 h-4 w-4" />
                  )}
                  {uploadingPhoto ? "Uploading…" : form.imageUrl ? "Change photo" : "Upload photo"}
                </Button>
                <Input
                  id="imageUrl"
                  type="url"
                  value={form.imageUrl}
                  onChange={(e) => updateForm("imageUrl", e.target.value)}
                  placeholder="…or paste an image URL"
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Upload a photo from your device, or paste an image link. Auto-filled when importing from a website.
            </p>
          </div>

          {members.length > 0 && (
            <div className="space-y-2">
              <Label>Author</Label>
              <Select
                value={form.authorId != null ? String(form.authorId) : "none"}
                onValueChange={(v) =>
                  updateForm("authorId", v && v !== "none" ? parseInt(v, 10) : null)
                }
              >
                <SelectTrigger>
                  <SelectValue>
                    {members.find((m) => m.id === form.authorId)?.name ?? "Unassigned"}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Unassigned</SelectItem>
                  {members.map((m) => (
                    <SelectItem key={m.id} value={String(m.id)}>
                      {m.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="servings">Servings *</Label>
              <Input
                id="servings"
                type="number"
                min={1}
                value={form.servings}
                onChange={(e) =>
                  updateForm("servings", parseInt(e.target.value, 10) || 1)
                }
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="prepTime">Prep Time (min)</Label>
              <Input
                id="prepTime"
                type="number"
                min={0}
                value={form.prepTimeMinutes ?? ""}
                onChange={(e) =>
                  updateForm(
                    "prepTimeMinutes",
                    e.target.value ? parseInt(e.target.value, 10) : null
                  )
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cookTime">Cook Time (min)</Label>
              <Input
                id="cookTime"
                type="number"
                min={0}
                value={form.cookTimeMinutes ?? ""}
                onChange={(e) =>
                  updateForm(
                    "cookTimeMinutes",
                    e.target.value ? parseInt(e.target.value, 10) : null
                  )
                }
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Ingredients */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Ingredients</CardTitle>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              updateForm("ingredients", [
                ...form.ingredients,
                newIngredientRow(),
              ])
            }
          >
            <Plus className="mr-1 h-4 w-4" />
            Add Ingredient
          </Button>
        </CardHeader>
        <CardContent className="space-y-2">
          {form.ingredients.map((row, index) => (
            <IngredientInput
              key={row.key}
              row={row}
              units={units}
              onChange={(updated) => updateIngredient(index, updated)}
              onRemove={() => removeIngredient(index)}
            />
          ))}
        </CardContent>
      </Card>

      {/* Instructions */}
      <Card>
        <CardHeader>
          <CardTitle>Instructions</CardTitle>
        </CardHeader>
        <CardContent>
          <Textarea
            value={form.instructions}
            onChange={(e) => updateForm("instructions", e.target.value)}
            rows={8}
            placeholder="Step-by-step instructions..."
            required
          />
        </CardContent>
      </Card>

      {/* Tags */}
      <Card>
        <CardHeader>
          <CardTitle>Tags</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {allTags.map((tag) => (
              <Badge
                key={tag.id}
                variant={form.tagIds.includes(tag.id) ? "default" : "outline"}
                className="cursor-pointer gap-1"
                onClick={() => toggleTag(tag.id)}
              >
                {tag.name}
                {canDeleteTag(tag) && (
                  <button
                    type="button"
                    aria-label={`Delete category ${tag.name}`}
                    className="-mr-0.5 ml-0.5 rounded-full opacity-60 hover:opacity-100"
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteTag(tag);
                    }}
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </Badge>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            Standard categories are shared by everyone. Categories you add belong to your
            household — the ✕ removes one of your own.
          </p>
          <div className="flex gap-2">
            <Input
              placeholder="New tag name"
              value={newTagName}
              onChange={(e) => setNewTagName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  createTag();
                }
              }}
              className="w-48"
            />
            <Button type="button" variant="outline" size="sm" onClick={createTag}>
              Add Tag
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Submit */}
      <div className="flex gap-3">
        <Button type="submit" disabled={saving}>
          {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {recipeId ? "Update Recipe" : "Create Recipe"}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => router.back()}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}
