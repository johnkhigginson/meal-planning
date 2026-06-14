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
      <h1 className="mb-1 text-3xl font-bold tracking-tight">Recipe Collections</h1>
      <p className="mb-8 text-muted-foreground">Browse our published cookbooks.</p>

      {books.length === 0 ? (
        <div className="py-16 text-center text-muted-foreground">
          No published cookbooks yet. Check back soon!
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {books.map((book) => (
            <Link key={book.id} href={`/blog/${book.slug}`}>
              <Card className="group h-full overflow-hidden transition-all hover:shadow-md">
                {book.coverImageUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={book.coverImageUrl}
                    alt={book.name}
                    className="h-40 w-full object-cover"
                  />
                )}
                <CardContent className="p-5">
                  <div className="flex items-center gap-2">
                    <BookOpen className="h-4 w-4 text-primary" />
                    <h2 className="font-semibold group-hover:text-primary">{book.name}</h2>
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
