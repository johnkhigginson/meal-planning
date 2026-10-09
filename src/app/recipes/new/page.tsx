import { RecipeForm } from "@/components/recipes/RecipeForm";

interface PageProps {
  searchParams: Promise<{ bookId?: string }>;
}

export default async function NewRecipePage({ searchParams }: PageProps) {
  const { bookId } = await searchParams;
  const parsedBookId = bookId ? parseInt(bookId, 10) : undefined;
  const validBookId = parsedBookId && !Number.isNaN(parsedBookId) ? parsedBookId : undefined;

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <h1 className="text-3xl leading-tight font-medium">{validBookId ? "Add recipe to cookbook" : "Add recipe"}</h1>
      <RecipeForm bookId={validBookId} />
    </div>
  );
}
