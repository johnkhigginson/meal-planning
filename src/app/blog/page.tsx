import Link from "next/link";
import { redirect } from "next/navigation";
import { BlogShell } from "@/components/blog/BlogShell";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BookOpen } from "lucide-react";
import { getPublishedBooks } from "@/lib/blog";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Recipe Blog",
  description: "Browse our published recipe collections.",
};

export default async function BlogIndexPage() {
  const books = await getPublishedBooks();

  // With a single published cookbook, skip the index and go straight to it.
  if (books.length === 1 && books[0].slug) {
    redirect(`/blog/${books[0].slug}`);
  }

  return (
    <BlogShell>
      <h1 className="mb-1 font-display text-4xl leading-tight font-semibold tracking-tight">Recipe collections</h1>
      <p className="mb-8 text-muted-foreground">Browse our published cookbooks.</p>

      {books.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-3xl border bg-card px-6 py-14 text-center">
          <div className="flex size-12 items-center justify-center rounded-2xl bg-brand-soft text-primary">
            <BookOpen className="h-6 w-6" aria-hidden="true" />
          </div>
          <p className="font-heading text-xl font-semibold">No published cookbooks yet.</p>
          <p className="text-muted-foreground">Check back soon!</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {books.map((book) => (
            <Link key={book.id} href={`/blog/${book.slug}`} className="block rounded-2xl focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring">
              <Card className="group h-full gap-0 overflow-hidden py-0 transition-[transform,box-shadow,border-color] duration-200 ease-out hover:-translate-y-0.5 hover:border-input hover:shadow-[0_14px_30px_-18px_rgb(60_45_10/0.45)]">
                {book.coverImageUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={book.coverImageUrl}
                    alt={book.name}
                    className="aspect-[16/9] w-full object-cover"
                  />
                )}
                <CardContent className="p-5">
                  <div className="flex items-center gap-2">
                    <BookOpen className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                    <h2 className="font-display text-xl font-semibold transition-colors duration-200 ease-out group-hover:text-primary">{book.name}</h2>
                  </div>
                  {book.description && (
                    <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                      {book.description}
                    </p>
                  )}
                  <Badge variant="secondary" className="mt-3">
                    {book._count.entries} recipes
                  </Badge>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </BlogShell>
  );
}
