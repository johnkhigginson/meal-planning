import { RecipeForm } from "@/components/recipes/RecipeForm";

export default function NewRecipePage() {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <h1 className="text-3xl font-bold">Add Recipe</h1>
      <RecipeForm />
    </div>
  );
}
