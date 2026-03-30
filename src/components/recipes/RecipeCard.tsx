import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
    isFavorite: boolean;
    tags: { tag: { id: number; name: string } }[];
  };
}

export function RecipeCard({ recipe }: RecipeCardProps) {
  const totalTime =
    (recipe.prepTimeMinutes || 0) + (recipe.cookTimeMinutes || 0);

  return (
    <Link href={`/recipes/${recipe.id}`}>
      <Card className="h-full transition-colors hover:bg-accent">
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between">
            <CardTitle className="text-base leading-tight">
              {recipe.name}
            </CardTitle>
            {recipe.isFavorite && (
              <Heart className="h-4 w-4 shrink-0 fill-red-500 text-red-500" />
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {recipe.description && (
            <p className="line-clamp-2 text-sm text-muted-foreground">
              {recipe.description}
            </p>
          )}

          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            {totalTime > 0 && (
              <span className="flex items-center gap-1">
                <Clock className="h-3.5 w-3.5" />
                {totalTime} min
              </span>
            )}
            <span className="flex items-center gap-1">
              <Users className="h-3.5 w-3.5" />
              {recipe.servings}
            </span>
            <Badge variant="secondary" className="text-xs">
              {recipe.sourceType}
            </Badge>
          </div>

          {recipe.tags.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {recipe.tags.map(({ tag }) => (
                <Badge key={tag.id} variant="outline" className="text-xs">
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
