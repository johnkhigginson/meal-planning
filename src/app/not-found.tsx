import type { Metadata } from "next";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { PublicShell } from "@/components/shared/PublicShell";

// Same pill buttons as the landing page.
const pill =
  "inline-flex min-h-12 items-center justify-center rounded-full px-6 font-bold transition-[transform,background-color,box-shadow] duration-200 ease-out hover:-translate-y-px focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-ring";
const pillSolid =
  "bg-brand font-extrabold text-brand-foreground hover:bg-brand/85 hover:shadow-[0_6px_18px_-8px_rgb(122_92_0/0.55)]";
const pillOutline = "border-[1.5px] border-foreground hover:bg-muted";

export const metadata: Metadata = {
  title: "Page not found",
  robots: { index: false },
};

// Shown for unknown URLs and every notFound() call (unknown or unpublished
// cookbooks and recipes included). There must be no loading.tsx above a
// public route, or the response streams with a 200 before notFound() runs.
export default function NotFound() {
  return (
    <PublicShell>
      <div className="space-y-6 py-10 text-center">
        <p className="font-heading text-6xl font-semibold text-primary">404</p>
        <h1 className="text-4xl leading-tight font-medium tracking-[-0.02em]">Page not found</h1>
        <p className="mx-auto max-w-md text-muted-foreground">
          This page does not exist, or it is not shared publicly. Check the address, or start from
          one of these.
        </p>
        <div className="flex flex-wrap justify-center gap-3">
          <Link href="/" className={cn(pill, pillSolid)}>
            Go home
          </Link>
          <Link href="/blog" className={cn(pill, pillOutline)}>
            Browse recipes
          </Link>
        </div>
      </div>
    </PublicShell>
  );
}
