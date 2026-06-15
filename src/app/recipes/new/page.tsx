import { RecipeForm } from "@/components/recipes/RecipeForm";

interface PageProps {
  searchParams: Promise<{ bookId?: string }>;
}

export default async function NewRecipePage({ searchParams }: PageProps) {
  const { bookId } = await searchParams;
  const parsedBookId = bookId ? parseInt(bookId, 10) : undefined;
  const validBookId = parsedBookId && !Number.isNaN(parsedBookId) ? parsedBookId : undefined;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <h1 className="text-2xl font-bold">{validBookId ? "Add Recipe to Cookbook" : "Add Recipe"}</h1>
      <RecipeForm bookId={validBookId} />
    </div>
  );
}
