"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { RecipeForm } from "@/components/recipes/RecipeForm";
import { RecipeNotes } from "@/components/recipes/RecipeNotes";
import { PageLoader } from "@/components/shared/PageLoader";
import type { RecipeIngredientRow } from "@/components/recipes/IngredientInput";

interface RecipeData {
  id: number;
  name: string;
  description: string | null;
  instructions: string;
  servings: number;
  prepTimeMinutes: number | null;
  cookTimeMinutes: number | null;
  sourceType: string;
  sourceUrl: string | null;
  sourceBookTitle: string | null;
  sourceBookPage: string | null;
  authorId: number | null;
  authorName: string | null;
  imageUrl: string | null;
  isFavorite: boolean;
  ingredients: {
    id: number;
    ingredientId: number;
    quantity: number;
    unitId: number;
    notes: string | null;
    optional: boolean;
    section: string | null;
    ingredient: { id: number; name: string };
    unit: { id: number; name: string; abbreviation: string };
  }[];
  tags: { tag: { id: number; name: string } }[];
}

export default function EditRecipePage() {
  const params = useParams();
  const [recipe, setRecipe] = useState<RecipeData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/recipes/${params.id}`)
      .then((r) => r.json())
      .then((data) => {
        setRecipe(data);
        setLoading(false);
      });
  }, [params.id]);

  if (loading) {
    return <PageLoader />;
  }

  if (!recipe) {
    return (
      <div className="mx-auto max-w-3xl rounded-3xl border bg-card px-6 py-14 text-center">
        <p className="font-heading text-xl">Recipe not found</p>
      </div>
    );
  }

  const initialIngredients: RecipeIngredientRow[] = recipe.ingredients.map(
    (ing, idx) => ({
      key: `edit-${ing.ingredientId}-${idx}`,
      section: ing.section ?? "",
      ingredientId: ing.ingredientId,
      ingredientName: ing.ingredient.name,
      quantity: ing.quantity,
      unitId: ing.unitId,
      notes: ing.notes || "",
      optional: ing.optional,
    })
  );

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <h1 className="text-3xl leading-tight font-medium">Edit recipe</h1>
      <RecipeForm
        recipeId={recipe.id}
        initialData={{
          name: recipe.name,
          description: recipe.description || "",
          instructions: recipe.instructions,
          servings: recipe.servings,
          prepTimeMinutes: recipe.prepTimeMinutes,
          cookTimeMinutes: recipe.cookTimeMinutes,
          sourceType: recipe.sourceType,
          sourceUrl: recipe.sourceUrl || "",
          sourceBookTitle: recipe.sourceBookTitle || "",
          sourceBookPage: recipe.sourceBookPage || "",
          authorId: recipe.authorId ?? null,
          authorName: recipe.authorName ?? "",
          imageUrl: recipe.imageUrl || "",
          isFavorite: recipe.isFavorite,
          ingredients: initialIngredients,
          tagIds: recipe.tags.map((t) => t.tag.id),
        }}
      />
      <RecipeNotes recipeId={recipe.id} />
    </div>
  );
}
