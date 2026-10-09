import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Clock, Users, Heart, UserRound, UtensilsCrossed } from "lucide-react";

interface RecipeCardProps {
  recipe: {
    id: number;
    name: string;
    description: string | null;
    servings: number;
    prepTimeMinutes: number | null;
    cookTimeMinutes: number | null;
    sourceType: string;
    imageUrl?: string | null;
    isFavorite: boolean;
    tags: { tag: { id: number; name: string } }[];
    author?: { id: number; name: string } | null;
    authorName?: string | null;
  };
  // Show which household member is credited. Only worth surfacing in shared
  // households; a typed author name ("Grandma Jean") always shows.
  showAuthor?: boolean;
}

export function RecipeCard({ recipe, showAuthor = false }: RecipeCardProps) {
  const totalTime =
    (recipe.prepTimeMinutes || 0) + (recipe.cookTimeMinutes || 0);

  return (
    <Link
      href={`/recipes/${recipe.id}`}
      className="group flex h-full flex-col overflow-hidden rounded-2xl border bg-card transition-[transform,box-shadow,border-color] duration-200 ease-out hover:-translate-y-0.5 hover:border-input hover:shadow-[0_14px_30px_-18px_rgb(60_45_10/0.45)] focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring"
    >
      <div className="aspect-[4/3] w-full overflow-hidden bg-accent">
        {recipe.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={recipe.imageUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <UtensilsCrossed className="h-6 w-6 text-primary/50" />
          </div>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-2 p-4">
        <div className="space-y-0.5">
          <div className="flex items-start justify-between gap-2">
            <h3 className="line-clamp-2 text-base leading-snug font-bold">{recipe.name}</h3>
            {recipe.isFavorite && (
              <Heart
                role="img"
                aria-label="Favorite"
                className="mt-0.5 h-4 w-4 shrink-0 fill-red-600 text-red-600"
              />
            )}
          </div>
          {totalTime > 0 && (
            <p className="flex items-center gap-1 text-xs text-muted-foreground">
              <Clock className="h-3 w-3" />
              {totalTime} min
            </p>
          )}
        </div>

        {recipe.description && (
          <p className="line-clamp-2 text-sm leading-relaxed text-muted-foreground">
            {recipe.description}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <Users className="h-3 w-3" />
            {recipe.servings}
          </span>
          <Badge variant="secondary" className="px-1.5 py-0 text-[10px]">
            {recipe.sourceType}
          </Badge>
          {((showAuthor && recipe.author?.name) || recipe.authorName) && (
            <span className="flex items-center gap-1">
              <UserRound className="h-3 w-3" />
              {recipe.author?.name ?? recipe.authorName}
            </span>
          )}
        </div>

        {recipe.tags.length > 0 && (
          <div className="mt-auto flex flex-wrap gap-1 pt-1">
            {recipe.tags.map(({ tag }) => (
              <Badge key={tag.id} variant="tag">
                {tag.name}
              </Badge>
            ))}
          </div>
        )}
      </div>
    </Link>
  );
}
