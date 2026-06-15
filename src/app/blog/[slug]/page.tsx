import Link from "next/link";
import { notFound } from "next/navigation";
import { BlogShell } from "@/components/blog/BlogShell";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Clock, Users } from "lucide-react";
import { getPublishedBookBySlug, formatBlogDate } from "@/lib/blog";
import { absoluteUrl, getSiteUrl } from "@/lib/site";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: PageProps) {
  const { slug } = await params;
  const book = await getPublishedBookBySlug(slug);
  if (!book) return { title: "Not found" };

  const cover = absoluteUrl(book.coverImageUrl ?? book.posts.find((p) => p.imageUrl)?.imageUrl);
  const url = `${getSiteUrl()}/blog/${slug}`;
  return {
    title: book.name,
    description: book.description ?? undefined,
    alternates: {
      canonical: url,
      types: { "application/rss+xml": `${url}/rss.xml` },
    },
    openGraph: {
      type: "website",
      title: book.name,
      description: book.description ?? undefined,
      url,
      images: cover ? [cover] : undefined,
    },
  };
}

export default async function CookbookPage({ params }: PageProps) {
  const { slug } = await params;
  const book = await getPublishedBookBySlug(slug);
  if (!book) notFound();

  return (
    <BlogShell homeHref={`/blog/${book.slug}`} homeLabel={book.name}>
      {book.coverImageUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={book.coverImageUrl}
          alt={book.name}
          className="mb-6 h-56 w-full rounded-2xl object-cover"
        />
      )}
      <h1 className="text-3xl font-bold tracking-tight">{book.name}</h1>
      {book.description && <p className="mt-2 text-muted-foreground">{book.description}</p>}
      <p className="mt-2 text-sm text-muted-foreground">{book.posts.length} recipes</p>

      <div className="mt-8 space-y-5">
        {book.posts.map((recipe) => {
          const totalTime = (recipe.prepTimeMinutes || 0) + (recipe.cookTimeMinutes || 0);
          const href = recipe.slug
            ? `/blog/${book.slug}/${recipe.slug}`
            : `/blog/${book.slug}/${recipe.id}`;
          return (
            <Link key={recipe.id} href={href} className="block">
              <Card className="group overflow-hidden transition-all hover:shadow-md">
                <div className="flex flex-col sm:flex-row">
                  {recipe.imageUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={recipe.imageUrl}
                      alt={recipe.name}
                      className="h-44 w-full object-cover sm:h-auto sm:w-48"
                    />
                  )}
                  <CardContent className="flex-1 p-5">
                    <h2 className="text-lg font-semibold group-hover:text-primary">{recipe.name}</h2>
                    {recipe.publishedAt && (
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {formatBlogDate(recipe.publishedAt)}
                        {recipe.author?.name ? ` · by ${recipe.author.name}` : ""}
                      </p>
                    )}
                    {recipe.description && (
                      <p className="mt-2 line-clamp-3 text-sm text-muted-foreground">
                        {recipe.description}
                      </p>
                    )}
                    <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
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
                      {recipe.tags.slice(0, 3).map(({ tag }) => (
                        <Badge key={tag.name} variant="outline" className="text-[10px]">
                          {tag.name}
                        </Badge>
                      ))}
                    </div>
                  </CardContent>
                </div>
              </Card>
            </Link>
          );
        })}
      </div>
    </BlogShell>
  );
}
