import Link from "next/link";
import Image from "next/image";
import { canOptimizeImage } from "@/lib/image";
import { notFound } from "next/navigation";
import { BlogShell, PROSE_CLASS } from "@/components/blog/BlogShell";
import { FollowButton } from "@/components/blog/FollowButton";
import { RecipeComments } from "@/components/blog/RecipeComments";
import { ScalableIngredients } from "@/components/recipes/ScalableIngredients";
import { RecipeInstructions } from "@/components/recipes/RecipeInstructions";
import { PrintButton } from "@/components/recipes/PrintButton";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Clock, Users, Globe } from "lucide-react";
import { getPublishedRecipe, formatBlogDate } from "@/lib/blog";
import { getCurrentUser } from "@/lib/auth";
import { sanitizeBlogHtml } from "@/lib/sanitize";
import { buildRecipeBreadcrumbJsonLd, buildRecipeJsonLd, jsonLdString, recipeMetadata } from "@/lib/seo";
import { decodeEntities } from "@/lib/text-clean";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ slug: string; recipeSlug: string }>;
}

export async function generateMetadata({ params }: PageProps) {
  const { slug, recipeSlug } = await params;
  const data = await getPublishedRecipe(slug, recipeSlug);
  if (!data) notFound();
  return recipeMetadata(data.recipe, data.book);
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

  const recipeLd = buildRecipeJsonLd(recipe, book);
  const breadcrumbLd = buildRecipeBreadcrumbJsonLd(recipe, book);

  return (
    <BlogShell
      homeHref={`/blog/${book.slug}`}
      homeLabel={book.name}
      aboutHref={`/blog/${book.slug}/about`}
      headerAction={book.slug ? <FollowButton bookId={book.id} slug={book.slug} /> : undefined}
    >
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdString(recipeLd ? [recipeLd, breadcrumbLd] : breadcrumbLd) }}
      />
      <Link
        href={`/blog/${book.slug}`}
        className="mb-4 inline-flex items-center gap-1 rounded text-sm font-bold text-muted-foreground transition-colors duration-200 ease-out hover:text-foreground focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring print:hidden"
      >
        <ArrowLeft className="h-4 w-4" /> All recipes
      </Link>

      <article>
        <div className="flex items-start justify-between gap-3">
          <h1 className="font-display text-4xl leading-tight font-semibold tracking-tight">{decodeEntities(recipe.name)}</h1>
          <PrintButton />
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          {recipe.publishedAt && formatBlogDate(recipe.publishedAt)}
          {/* A member's byline links to the About page, which lists members.
              A typed name has no profile to link to. */}
          {recipe.author?.name ? (
            <>
              {" · by "}
              <Link href={`/blog/${book.slug}/about`} className="font-bold text-primary hover:underline">
                {recipe.author.name}
              </Link>
            </>
          ) : recipe.authorName ? (
            ` · by ${recipe.authorName}`
          ) : null}
        </p>

        {recipe.imageUrl && (
          <Image
            src={recipe.imageUrl}
            alt={decodeEntities(recipe.name)}
            width={1600}
            height={1200}
            sizes="(min-width: 48rem) 48rem, 100vw"
            preload
            unoptimized={!canOptimizeImage(recipe.imageUrl)}
            className="mt-6 h-auto w-full rounded-3xl object-cover"
          />
        )}

        <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm font-semibold text-muted-foreground">
          {totalTime > 0 && (
            <span className="flex items-center gap-1">
              <Clock className="h-4 w-4 text-primary" aria-hidden="true" />
              {totalTime}m
            </span>
          )}
          <span className="flex items-center gap-1">
            <Users className="h-4 w-4 text-primary" aria-hidden="true" />
            {recipe.servings} servings
          </span>
          {recipe.sourceUrl && (
            <a
              href={recipe.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 font-bold text-primary hover:underline"
            >
              <Globe className="h-4 w-4" /> Original post
            </a>
          )}
        </div>

        {recipe.tags.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1">
            {recipe.tags.map(({ tag }) => (
              <Badge key={tag.name} variant="tag">
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
                optional: ri.optional,
                section: ri.section,
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
          <div className="mt-6">
            <RecipeInstructions text={recipe.instructions} />
          </div>
        )}

        {recipe.author?.bio && (
          <div className="mt-10 rounded-2xl border bg-card p-5">
            <p className="font-heading text-xl font-semibold">About {recipe.author.name}</p>
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
