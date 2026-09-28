// A recipe credits either a user in the app (authorId) or a free-text name
// (authorName) for someone without an account, never both.

export function recipeAuthorName(recipe: {
  author?: { name: string } | null;
  authorName?: string | null;
}): string | null {
  return recipe.author?.name ?? recipe.authorName ?? null;
}

// Apply the either/or rule to incoming create or update data. A user author
// wins; a typed name clears any user author.
export function normalizeRecipeAuthor(data: { authorId?: number | null; authorName?: string | null }) {
  if (data.authorId != null) data.authorName = null;
  else if (data.authorName) data.authorId = null;
}
