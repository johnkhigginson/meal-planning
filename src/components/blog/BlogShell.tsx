import Link from "next/link";
import { LemonLogo } from "@/components/shared/LemonLogo";

// Standalone chrome for the public blog. Intentionally independent of the
// authenticated AppShell/Navbar so outside visitors get a clean, login-free
// reading experience.
export function BlogShell({
  children,
  homeHref = "/blog",
  homeLabel = "Recipe Blog",
  wide = false,
}: {
  children: React.ReactNode;
  homeHref?: string;
  homeLabel?: string;
  wide?: boolean;
}) {
  const width = wide ? "max-w-5xl" : "max-w-3xl";
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="border-b border-border/60 bg-card/50">
        <div className={`mx-auto flex ${width} items-center gap-2 px-4 py-4`}>
          <Link href={homeHref} className="flex items-center gap-2">
            <LemonLogo className="h-7 w-7" />
            <span className="text-base font-bold tracking-tight">{homeLabel}</span>
          </Link>
        </div>
      </header>

      <main className={`mx-auto w-full ${width} flex-1 px-4 py-8`}>{children}</main>

      <footer className="border-t border-border/60 py-6">
        <div className={`mx-auto ${width} px-4 text-xs text-muted-foreground`}>
          Powered by My Lemon Kitchen
        </div>
      </footer>
    </div>
  );
}

// Tailwind-only article styling for preserved blog HTML (no typography plugin).
export const PROSE_CLASS =
  "max-w-none text-[15px] leading-7 text-foreground [&_a]:text-primary [&_a]:underline " +
  "[&_h2]:mt-6 [&_h2]:mb-2 [&_h2]:text-xl [&_h2]:font-bold [&_h3]:mt-5 [&_h3]:mb-2 [&_h3]:text-lg [&_h3]:font-semibold " +
  "[&_p]:my-3 [&_ul]:my-3 [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:my-3 [&_ol]:list-decimal [&_ol]:pl-6 [&_li]:my-1 " +
  "[&_img]:my-4 [&_img]:max-w-full [&_img]:rounded-xl [&_img]:h-auto [&_blockquote]:border-l-4 [&_blockquote]:border-border " +
  "[&_blockquote]:pl-4 [&_blockquote]:italic [&_table]:my-3 [&_iframe]:max-w-full";
