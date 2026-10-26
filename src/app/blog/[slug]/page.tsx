import { notFound } from "next/navigation";
import { BlogShell } from "@/components/blog/BlogShell";
import { BlogHeaderEditor } from "@/components/blog/BlogHeaderEditor";
import { CookbookBrowser, type BrowserPost } from "@/components/blog/CookbookBrowser";
import { FollowButton } from "@/components/blog/FollowButton";
import { getPublishedBookBySlug } from "@/lib/blog";
import { getCurrentUser } from "@/lib/auth";
import { absoluteUrl, SITE_NAME } from "@/lib/site";
import { bookUrl, metaDescription, pageTitle } from "@/lib/seo";
import { recipeAuthorName } from "@/lib/recipe-author";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: PageProps) {
  const { slug } = await params;
  const book = await getPublishedBookBySlug(slug);
  if (!book) notFound();

  // Fall back to the site default image (app/opengraph-image.tsx).
  const cover =
    absoluteUrl(book.coverImageUrl ?? book.posts.find((p) => p.imageUrl)?.imageUrl) ?? "/opengraph-image";
  const url = bookUrl(book);
  const description = metaDescription(
    book.description,
    book.tagline,
    `Recipes from ${book.name}, a family cookbook on ${SITE_NAME}.`
  );
  return {
    title: pageTitle(book.name),
    description,
    alternates: {
      canonical: url,
      types: { "application/rss+xml": `${url}/rss.xml` },
    },
    openGraph: {
      type: "website",
      siteName: SITE_NAME,
      title: book.name,
      description,
      url,
      images: [cover],
    },
    twitter: {
      card: "summary_large_image",
      title: book.name,
      description,
      images: [cover],
    },
  };
}

export default async function CookbookPage({ params }: PageProps) {
  const { slug } = await params;
  const book = await getPublishedBookBySlug(slug);
  if (!book) notFound();

  // Only the owning household can edit the header (matches the book PUT's
  // authorization, which is household-scoped).
  const user = await getCurrentUser();
  const canEdit = !!user && user.householdId === book.householdId;

  const posts: BrowserPost[] = book.posts.map((r) => ({
    id: r.id,
    name: r.name,
    slug: r.slug,
    description: r.description,
    imageUrl: r.imageUrl,
    prepTimeMinutes: r.prepTimeMinutes,
    cookTimeMinutes: r.cookTimeMinutes,
    servings: r.servings,
    publishedAt: r.publishedAt ? r.publishedAt.toISOString() : null,
    authorName: recipeAuthorName(r),
    tags: r.tags.map((t) => t.tag.name),
  }));

  return (
    <BlogShell
      homeHref={`/blog/${book.slug}`}
      homeLabel={book.name}
      aboutHref={`/blog/${book.slug}/about`}
      headerAction={<FollowButton bookId={book.id} slug={book.slug!} />}
      wide
    >
      <BlogHeaderEditor
        bookId={book.id}
        canEdit={canEdit}
        name={book.name}
        tagline={book.tagline}
        description={book.description}
        coverImageUrl={book.coverImageUrl}
      />
      <CookbookBrowser bookSlug={book.slug!} posts={posts} />
    </BlogShell>
  );
}
