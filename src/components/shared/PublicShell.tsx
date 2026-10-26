import Link from "next/link";
import { LemonLogo } from "./LemonLogo";
import { FooterLinks } from "./FooterLinks";

// Chrome for public pages outside the app (privacy, terms, contact, and help
// for signed-out visitors). Matches the auth layout header.
export function PublicShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <header className="mx-auto flex w-full max-w-6xl items-center px-4 py-5 sm:px-6">
        <Link
          href="/"
          className="flex items-center gap-3 rounded-full focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-ring"
        >
          <LemonLogo className="h-8 w-8" />
          <span className="font-heading text-xl font-semibold tracking-tight">My Lemon Kitchen</span>
        </Link>
      </header>
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 pt-6 pb-20 sm:pt-10">{children}</main>
      <footer className="border-t">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-8 text-sm text-muted-foreground sm:px-6">
          <span className="flex items-center gap-2">
            <LemonLogo className="h-5 w-5" />
            My Lemon Kitchen
          </span>
          <FooterLinks />
        </div>
      </footer>
    </div>
  );
}

// Heading and body styling shared by the legal pages.
export function LegalDoc({
  title,
  lastUpdated,
  children,
}: {
  title: string;
  lastUpdated: string;
  children: React.ReactNode;
}) {
  return (
    <article className="space-y-8">
      <div className="space-y-2">
        <h1 className="text-4xl leading-tight font-medium tracking-[-0.02em] sm:text-5xl">{title}</h1>
        <p className="text-sm text-muted-foreground">Last updated {lastUpdated}</p>
      </div>
      <div className="space-y-8 text-base leading-7 [&_a]:font-bold [&_a]:text-primary [&_a]:underline-offset-4 hover:[&_a]:underline [&_li]:my-1 [&_p]:my-3 [&_ul]:my-3 [&_ul]:list-disc [&_ul]:pl-6 [&_li]:marker:text-primary">
        {children}
      </div>
    </article>
  );
}

export function LegalSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="font-heading text-2xl font-semibold">{title}</h2>
      {children}
    </section>
  );
}
