import { notFound } from "next/navigation";
import { BlogShell } from "@/components/blog/BlogShell";
import { BlogHeaderEditor } from "@/components/blog/BlogHeaderEditor";
import { CookbookBrowser, type BrowserPost } from "@/components/blog/CookbookBrowser";
import { getPublishedBookBySlug } from "@/lib/blog";
import { getCurrentUser } from "@/lib/auth";
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
    authorName: r.author?.name ?? null,
    tags: r.tags.map((t) => t.tag.name),
  }));

  return (
    <BlogShell homeHref={`/blog/${book.slug}`} homeLabel={book.name} aboutHref={`/blog/${book.slug}/about`} wide>
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
