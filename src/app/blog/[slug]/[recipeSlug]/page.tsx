import Link from "next/link";
import { notFound } from "next/navigation";
import { BlogShell, PROSE_CLASS } from "@/components/blog/BlogShell";
import { RecipeComments } from "@/components/blog/RecipeComments";
import { ScalableIngredients } from "@/components/recipes/ScalableIngredients";
import { PrintButton } from "@/components/recipes/PrintButton";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Clock, Users, Globe } from "lucide-react";
import { getPublishedRecipe, formatBlogDate } from "@/lib/blog";
import { getCurrentUser } from "@/lib/auth";
import { sanitizeBlogHtml } from "@/lib/sanitize";
import { absoluteUrl, getSiteUrl } from "@/lib/site";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ slug: string; recipeSlug: string }>;
}

export async function generateMetadata({ params }: PageProps) {
  const { slug, recipeSlug } = await params;
  const data = await getPublishedRecipe(slug, recipeSlug);
  if (!data) return { title: "Not found" };

  const { recipe } = data;
  const image = absoluteUrl(recipe.imageUrl);
  const url = `${getSiteUrl()}/blog/${slug}/${recipe.slug ?? recipe.id}`;
  return {
    title: recipe.name,
    description: recipe.description ?? undefined,
    alternates: { canonical: url },
    openGraph: {
      type: "article",
      title: recipe.name,
      description: recipe.description ?? undefined,
      url,
      images: image ? [image] : undefined,
      publishedTime: recipe.publishedAt?.toISOString(),
      authors: recipe.author?.name ? [recipe.author.name] : undefined,
    },
    twitter: {
      card: image ? "summary_large_image" : "summary",
      title: recipe.name,
      description: recipe.description ?? undefined,
      images: image ? [image] : undefined,
    },
  };
}

function isoDuration(min: number | null): string | undefined {
  return min && min > 0 ? `PT${min}M` : undefined;
}

// Schema.org Recipe JSON-LD for Google rich results. Emitted when we have
// enough to be a real recipe (ingredients or instructions).
function recipeJsonLd(recipe: Awaited<ReturnType<typeof getPublishedRecipe>>) {
  if (!recipe) return null;
  const r = recipe.recipe;
  const ingredients = r.ingredients.map(
    (ri) => `${ri.quantity} ${ri.unit.abbreviation} ${ri.ingredient.name}`.trim()
  );
  const steps = (r.instructions || "")
    .split("\n")
    .map((s) => s.replace(/^\s*\d+\.\s*/, "").trim())
    .filter(Boolean);
  if (ingredients.length === 0 && steps.length === 0) return null;

  const image = absoluteUrl(r.imageUrl);
  const data: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Recipe",
    name: r.name,
    description: r.description ?? undefined,
    image: image ? [image] : undefined,
    datePublished: r.publishedAt?.toISOString(),
    author: r.author?.name ? { "@type": "Person", name: r.author.name } : undefined,
    recipeYield: r.servings ? String(r.servings) : undefined,
    prepTime: isoDuration(r.prepTimeMinutes),
    cookTime: isoDuration(r.cookTimeMinutes),
    recipeIngredient: ingredients.length ? ingredients : undefined,
    recipeInstructions: steps.length ? steps.map((text) => ({ "@type": "HowToStep", text })) : undefined,
    keywords: r.tags.length ? r.tags.map((t) => t.tag.name).join(", ") : undefined,
  };
  return JSON.stringify(data).replace(/</g, "\\u003c");
}

export default async function BlogRecipePage({ params }: PageProps) {
  const { slug, recipeSlug } = await params;
  const data = await getPublishedRecipe(slug, recipeSlug);
  if (!data) notFound();

  const { book, recipe } = data;
  const totalTime = (recipe.prepTimeMinutes || 0) + (recipe.cookTimeMinutes || 0);

  // The recipe owner (their household) or an admin may delete comments.
  const user = await getCurrentUser();
  const canModerate = !!user && (user.isAdmin || user.householdId === recipe.householdId);

  const jsonLd = recipeJsonLd(data);

  return (
    <BlogShell homeHref={`/blog/${book.slug}`} homeLabel={book.name}>
      {jsonLd && (
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd }} />
      )}
      <Link
        href={`/blog/${book.slug}`}
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground print:hidden"
      >
        <ArrowLeft className="h-4 w-4" /> All recipes
      </Link>

      <article>
        <div className="flex items-start justify-between gap-3">
          <h1 className="text-3xl font-bold tracking-tight">{recipe.name}</h1>
          <PrintButton />
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          {recipe.publishedAt && formatBlogDate(recipe.publishedAt)}
          {recipe.author?.name ? ` · by ${recipe.author.name}` : ""}
        </p>

        {recipe.imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={recipe.imageUrl} alt={recipe.name} className="mt-5 w-full rounded-2xl object-cover" />
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

        {/* Quick ingredient reference (scalable by servings) when we have structured data. */}
        {recipe.ingredients.length > 0 && (
          <div className="mt-6">
            <ScalableIngredients
              baseServings={recipe.servings}
              ingredients={recipe.ingredients.map((ri) => ({
                quantity: ri.quantity,
                unit: ri.unit.abbreviation,
                name: ri.ingredient.name,
                notes: ri.notes,
              }))}
            />
          </div>
        )}

        {/* The full original post is always shown so nothing is lost. */}
        {recipe.bodyHtml ? (
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

        <div className="print:hidden">
          <RecipeComments recipeId={recipe.id} canModerate={canModerate} />
        </div>
      </article>
    </BlogShell>
  );
}
