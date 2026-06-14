import Link from "next/link";
import { notFound } from "next/navigation";
import { BlogShell, PROSE_CLASS } from "@/components/blog/BlogShell";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, Clock, Users, Globe } from "lucide-react";
import { getPublishedRecipe, formatBlogDate } from "@/lib/blog";
import { sanitizeBlogHtml } from "@/lib/sanitize";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ slug: string; recipeSlug: string }>;
}

export async function generateMetadata({ params }: PageProps) {
  const { slug, recipeSlug } = await params;
  const data = await getPublishedRecipe(slug, recipeSlug);
  if (!data) return { title: "Not found" };
  return {
    title: data.recipe.name,
    description: data.recipe.description ?? undefined,
  };
}

export default async function BlogRecipePage({ params }: PageProps) {
  const { slug, recipeSlug } = await params;
  const data = await getPublishedRecipe(slug, recipeSlug);
  if (!data) notFound();

  const { book, recipe } = data;
  const totalTime = (recipe.prepTimeMinutes || 0) + (recipe.cookTimeMinutes || 0);
  const hasStructured = recipe.ingredients.length > 0;

  return (
    <BlogShell homeHref={`/blog/${book.slug}`} homeLabel={book.name}>
      <Link
        href={`/blog/${book.slug}`}
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> {book.name}
      </Link>

      <article>
        <h1 className="text-3xl font-bold tracking-tight">{recipe.name}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {recipe.publishedAt && formatBlogDate(recipe.publishedAt)}
          {recipe.author?.name ? ` · by ${recipe.author.name}` : ""}
        </p>

        {recipe.imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={recipe.imageUrl}
            alt={recipe.name}
            className="mt-5 w-full rounded-2xl object-cover"
          />
        )}

        <div className="mt-5 flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
          {totalTime > 0 && (
            <span className="flex items-center gap-1">
              <Clock className="h-4 w-4" />
              {totalTime}m
            </span>
          )}
          <span className="flex items-center gap-1">
            <Users className="h-4 w-4" />
            {recipe.servings} servings
          </span>
          {recipe.sourceUrl && (
            <a
              href={recipe.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-primary hover:underline"
            >
              <Globe className="h-4 w-4" /> Original post
            </a>
          )}
        </div>

        {recipe.tags.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1">
            {recipe.tags.map(({ tag }) => (
              <Badge key={tag.name} variant="outline">
                {tag.name}
              </Badge>
            ))}
          </div>
        )}

        {/* Structured recipe when available; otherwise the preserved post body. */}
        {hasStructured ? (
          <div className="mt-6 space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Ingredients</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {recipe.ingredients.map((ri, i) => (
                    <li key={i} className="flex items-baseline gap-2">
                      <span className="font-medium">
                        {ri.quantity} {ri.unit.abbreviation}
                      </span>
                      <span>{ri.ingredient.name}</span>
                      {ri.notes && (
                        <span className="text-sm text-muted-foreground">({ri.notes})</span>
                      )}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Instructions</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="whitespace-pre-wrap">{recipe.instructions}</div>
              </CardContent>
            </Card>
          </div>
        ) : recipe.bodyHtml ? (
          // Preserved original post HTML (migrated content). Sanitized again at
          // render so even content stored before sanitization was added is safe.
          <div
            className={`mt-6 ${PROSE_CLASS}`}
            dangerouslySetInnerHTML={{ __html: sanitizeBlogHtml(recipe.bodyHtml) }}
          />
        ) : (
          <div className="mt-6 whitespace-pre-wrap">{recipe.instructions}</div>
        )}

        {recipe.author?.bio && (
          <div className="mt-10 rounded-2xl border border-border/60 bg-card/50 p-5">
            <p className="text-sm font-semibold">About {recipe.author.name}</p>
            <p className="mt-1 text-sm text-muted-foreground">{recipe.author.bio}</p>
          </div>
        )}
      </article>
    </BlogShell>
  );
}
