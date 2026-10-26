import Link from "next/link";
import { notFound } from "next/navigation";
import { BlogShell } from "@/components/blog/BlogShell";
import { ArrowLeft } from "lucide-react";
import { getPublishedBookAuthors } from "@/lib/blog";
import { SITE_NAME } from "@/lib/site";
import { bookUrl, metaDescription, pageTitle } from "@/lib/seo";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: PageProps) {
  const { slug } = await params;
  const data = await getPublishedBookAuthors(slug);
  if (!data) notFound();
  const url = `${bookUrl(data.book)}/about`;
  const description = metaDescription(
    data.book.description,
    `The cooks behind ${data.book.name}, a family cookbook on ${SITE_NAME}.`
  );
  return {
    title: pageTitle(`About ${data.book.name}`),
    description,
    alternates: { canonical: url },
    openGraph: { type: "website", siteName: SITE_NAME, title: `About ${data.book.name}`, description, url },
  };
}

export default async function AboutPage({ params }: PageProps) {
  const { slug } = await params;
  const data = await getPublishedBookAuthors(slug);
  if (!data) notFound();

  const { book, authors } = data;
  const withBio = authors.filter((a) => a.bio || a.avatarUrl);
  const shown = withBio.length > 0 ? withBio : authors;

  return (
    <BlogShell homeHref={`/blog/${book.slug}`} homeLabel={book.name} aboutHref={`/blog/${book.slug}/about`}>
      <Link
        href={`/blog/${book.slug}`}
        className="mb-4 inline-flex items-center gap-1 rounded text-sm font-bold text-muted-foreground transition-colors duration-200 ease-out hover:text-foreground focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        <ArrowLeft className="h-4 w-4" /> {book.name}
      </Link>

      <h1 className="font-display text-4xl leading-tight font-semibold tracking-tight">About</h1>
      {book.description && <p className="mt-2 text-muted-foreground">{book.description}</p>}

      <div className="mt-8 space-y-4">
        {shown.length === 0 && (
          <p className="text-muted-foreground">The cooks behind {book.name}.</p>
        )}
        {shown.map((author) => (
          <div key={author.id} className="flex gap-4 rounded-2xl border bg-card p-5">
            {author.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={author.avatarUrl}
                alt={author.name}
                className="h-16 w-16 shrink-0 rounded-full object-cover"
              />
            ) : (
              <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-brand-soft font-heading text-2xl font-semibold text-primary">
                {author.name.charAt(0).toUpperCase()}
              </div>
            )}
            <div className="min-w-0">
              <h2 className="font-display text-xl font-semibold">{author.name}</h2>
              {author.bio ? (
                <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{author.bio}</p>
              ) : (
                <p className="mt-1 text-sm text-muted-foreground">Contributor to {book.name}.</p>
              )}
            </div>
          </div>
        ))}
      </div>
    </BlogShell>
  );
}
