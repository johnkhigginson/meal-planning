import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Clock, Users, Heart } from "lucide-react";

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
  };
}

export function RecipeCard({ recipe }: RecipeCardProps) {
  const totalTime =
    (recipe.prepTimeMinutes || 0) + (recipe.cookTimeMinutes || 0);

  return (
    <Link href={`/recipes/${recipe.id}`}>
      <Card className="group h-full overflow-hidden transition-all hover:shadow-md">
        {recipe.imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={recipe.imageUrl}
            alt={recipe.name}
            className="h-36 w-full object-cover"
          />
        )}
        <CardContent className="space-y-3 p-5">
          <div className="flex items-start justify-between gap-2">
            <h3 className="text-sm font-semibold leading-snug group-hover:text-primary transition-colors">
              {recipe.name}
            </h3>
            {recipe.isFavorite && (
              <Heart className="h-4 w-4 shrink-0 fill-red-500 text-red-500" />
            )}
          </div>

          {recipe.description && (
            <p className="line-clamp-2 text-xs leading-relaxed text-muted-foreground">
              {recipe.description}
            </p>
          )}

          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            {totalTime > 0 && (
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {totalTime}m
              </span>
            )}
            <span className="flex items-center gap-1">
              <Users className="h-3 w-3" />
              {recipe.servings}
            </span>
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
              {recipe.sourceType}
            </Badge>
          </div>

          {recipe.tags.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {recipe.tags.map(({ tag }) => (
                <Badge key={tag.id} variant="outline" className="text-[10px] px-1.5 py-0">
                  {tag.name}
                </Badge>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </Link>
  );
}
