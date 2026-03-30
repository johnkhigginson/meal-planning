import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Clock, Users, Pencil, Heart, BookOpen, Globe } from "lucide-react";
import { DeleteRecipeButton } from "@/components/recipes/DeleteRecipeButton";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function RecipeDetailPage({ params }: PageProps) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const householdId = user.householdId;
  const { id } = await params;
  const recipe = await prisma.recipe.findFirst({
    where: { id: parseInt(id, 10), householdId },
    include: {
      ingredients: {
        include: { ingredient: true, unit: true },
        orderBy: { sortOrder: "asc" },
      },
      tags: { include: { tag: true } },
    },
  });

  if (!recipe) notFound();

  const totalTime =
    (recipe.prepTimeMinutes || 0) + (recipe.cookTimeMinutes || 0);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h1 className="text-3xl font-bold">{recipe.name}</h1>
            {recipe.isFavorite && (
              <Heart className="h-5 w-5 fill-red-500 text-red-500" />
            )}
          </div>
          {recipe.description && (
            <p className="text-muted-foreground">{recipe.description}</p>
          )}
        </div>
        <div className="flex gap-2">
          <Link href={`/recipes/${recipe.id}/edit`}>
            <Button variant="outline" size="sm">
              <Pencil className="mr-1 h-4 w-4" />
              Edit
            </Button>
          </Link>
          <DeleteRecipeButton recipeId={recipe.id} />
        </div>
      </div>

      {/* Meta info */}
      <div className="flex flex-wrap items-center gap-4 text-sm">
        {totalTime > 0 && (
          <span className="flex items-center gap-1 text-muted-foreground">
            <Clock className="h-4 w-4" />
            {recipe.prepTimeMinutes && `${recipe.prepTimeMinutes}m prep`}
            {recipe.prepTimeMinutes && recipe.cookTimeMinutes && " + "}
            {recipe.cookTimeMinutes && `${recipe.cookTimeMinutes}m cook`}
          </span>
        )}
        <span className="flex items-center gap-1 text-muted-foreground">
          <Users className="h-4 w-4" />
          {recipe.servings} servings
        </span>
        {recipe.sourceType === "WEBSITE" && recipe.sourceUrl && (
          <a
            href={recipe.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-primary hover:underline"
          >
            <Globe className="h-4 w-4" />
            Source
          </a>
        )}
        {recipe.sourceType === "BOOK" && recipe.sourceBookTitle && (
          <span className="flex items-center gap-1 text-muted-foreground">
            <BookOpen className="h-4 w-4" />
            {recipe.sourceBookTitle}
            {recipe.sourceBookPage && `, p. ${recipe.sourceBookPage}`}
          </span>
        )}
      </div>

      {recipe.tags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {recipe.tags.map(({ tag }) => (
            <Badge key={tag.id} variant="outline">
              {tag.name}
            </Badge>
          ))}
        </div>
      )}

      <Separator />

      {/* Ingredients */}
      <Card>
        <CardHeader>
          <CardTitle>Ingredients</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2">
            {recipe.ingredients.map((ri) => (
              <li key={ri.id} className="flex items-baseline gap-2">
                <span className="font-medium">
                  {ri.quantity} {ri.unit.abbreviation}
                </span>
                <span>{ri.ingredient.name}</span>
                {ri.notes && (
                  <span className="text-sm text-muted-foreground">
                    ({ri.notes})
                  </span>
                )}
                {ri.optional && (
                  <Badge variant="secondary" className="text-xs">
                    optional
                  </Badge>
                )}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      {/* Instructions */}
      <Card>
        <CardHeader>
          <CardTitle>Instructions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="whitespace-pre-wrap">{recipe.instructions}</div>
        </CardContent>
      </Card>
    </div>
  );
}
