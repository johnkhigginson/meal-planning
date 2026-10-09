import Link from "next/link";
import { LemonLogo } from "@/components/shared/LemonLogo";

// Standalone chrome for the public blog. Intentionally independent of the
// authenticated AppShell/Navbar so outside visitors get a clean, login-free
// reading experience.
export function BlogShell({
  children,
  homeHref = "/blog",
  homeLabel = "Recipe blog",
  aboutHref,
  headerAction,
  wide = false,
}: {
  children: React.ReactNode;
  homeHref?: string;
  homeLabel?: string;
  aboutHref?: string;
  // Optional control rendered in the masthead (e.g. a Follow button).
  headerAction?: React.ReactNode;
  wide?: boolean;
}) {
  const width = wide ? "max-w-5xl" : "max-w-3xl";
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <header className="sticky top-0 z-40 border-b bg-background/90 backdrop-blur print:hidden">
        <div className={`mx-auto flex ${width} items-center justify-between gap-3 px-4 py-3`}>
          <Link
            href={homeHref}
            className="flex min-w-0 items-center gap-2 rounded-lg focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            <LemonLogo className="h-7 w-7 shrink-0" />
            <span className="truncate font-display text-lg font-semibold tracking-tight">{homeLabel}</span>
          </Link>
          <nav className="flex shrink-0 items-center gap-4 text-sm font-bold text-muted-foreground sm:gap-5">
            <Link
              href={homeHref}
              className="rounded transition-colors duration-200 ease-out hover:text-foreground focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              Recipes
            </Link>
            {aboutHref && (
              <Link
                href={aboutHref}
                className="rounded transition-colors duration-200 ease-out hover:text-foreground focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                About
              </Link>
            )}
            {headerAction}
          </nav>
        </div>
      </header>

      <main className={`mx-auto w-full ${width} flex-1 px-4 py-10`}>{children}</main>

      <footer className="mt-8 border-t py-8 print:hidden">
        <div className={`mx-auto ${width} flex items-center gap-2 px-4 text-xs text-muted-foreground`}>
          <LemonLogo className="h-4 w-4" />
          Powered by My Lemon Kitchen
        </div>
      </footer>
    </div>
  );
}

// Tailwind-only article styling for preserved blog HTML (no typography plugin).
export const PROSE_CLASS =
  "max-w-none text-base leading-7 text-foreground [&_a]:font-bold [&_a]:text-primary [&_a]:underline [&_a]:underline-offset-2 " +
  "[&_h2]:mt-8 [&_h2]:mb-2 [&_h2]:font-display [&_h2]:text-2xl [&_h2]:font-semibold [&_h3]:mt-6 [&_h3]:mb-2 [&_h3]:font-display [&_h3]:text-xl [&_h3]:font-semibold " +
  "[&_p]:my-3 [&_ul]:my-3 [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:my-3 [&_ol]:list-decimal [&_ol]:pl-6 [&_li]:my-1 [&_li]:marker:text-primary " +
  "[&_strong]:font-bold [&_img]:my-5 [&_img]:max-w-full [&_img]:rounded-2xl [&_img]:h-auto [&_blockquote]:my-5 [&_blockquote]:rounded-2xl [&_blockquote]:bg-muted " +
  "[&_blockquote]:px-5 [&_blockquote]:py-3 [&_blockquote]:font-display [&_blockquote]:italic [&_table]:my-3 [&_table]:block [&_table]:max-w-full [&_table]:overflow-x-auto [&_iframe]:max-w-full";
