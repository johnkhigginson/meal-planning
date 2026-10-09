import Link from "next/link";
import { Check } from "lucide-react";
import { LemonLogo } from "./LemonLogo";
import { LemonSlice } from "@/components/landing/LemonSlice";
import { cn } from "@/lib/utils";

// Pill links. Kept local because buttonVariants lives in a client module and
// can't be called from this server component.
const pill =
  "inline-flex items-center justify-center rounded-full font-bold transition-[transform,background-color,box-shadow] duration-200 ease-out hover:-translate-y-px focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-ring";
const pillSolid =
  "bg-brand font-extrabold text-brand-foreground hover:bg-brand/85 hover:shadow-[0_6px_18px_-8px_rgb(122_92_0/0.55)]";
const pillOutline = "border-[1.5px] border-foreground hover:bg-muted";

const features = [
  {
    title: "Recipe collection",
    description:
      "Store all your recipes in one place. Import from websites, scan cookbook pages, or add your own.",
  },
  {
    title: "Pantry tracking",
    description:
      "Keep track of what you have on hand. Scan receipts to instantly update your pantry.",
  },
  {
    title: "What can I make?",
    description: "See which recipes you can make right now based on what is in your pantry.",
  },
  {
    title: "Meal planning",
    description: "Plan your meals for the week. Dinners only, or the whole day. Your call.",
  },
  {
    title: "Smart grocery lists",
    description: "Auto-generate grocery lists from your meal plan, minus what you already have.",
  },
  {
    title: "Photo import",
    description: "Snap a photo of a receipt or cookbook page and skip the data entry.",
  },
];

const household = [
  "Share your kitchen with a partner or roommate",
  "Know exactly what you can cook tonight",
  "Never forget an ingredient at the store",
];

export function LandingPage() {
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      {/* Header */}
      <header className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-5 sm:px-6">
        <Link href="/" className="flex items-center gap-3">
          <LemonLogo className="h-8 w-8" />
          <span className="font-heading text-xl font-semibold tracking-tight">My Lemon Kitchen</span>
        </Link>
        <nav aria-label="Account" className="flex items-center gap-2">
          <Link href="/login" className={cn(pill, "min-h-11 px-4 text-[15px] hover:bg-muted")}>
            Sign in
          </Link>
          <Link href="/register" className={cn(pill, pillSolid, "min-h-11 px-5 text-[15px]")}>
            Get started
          </Link>
        </nav>
      </header>

      {/* Hero */}
      <section className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-12 px-4 pt-8 pb-20 sm:px-6 lg:pt-12 lg:pb-24">
        <div className="flex min-w-0 flex-[1_1_440px] flex-col gap-6">
          <p className="text-sm font-extrabold tracking-[0.12em] text-primary uppercase">
            Recipes, pantry, plans, groceries
          </p>
          <h1 className="text-[clamp(2.75rem,6vw,5.25rem)] leading-[1.02] font-medium tracking-[-0.025em] text-balance">
            Your whole kitchen, <em className="font-normal">finally</em> in one place.
          </h1>
          <p className="max-w-[34em] text-lg leading-relaxed text-muted-foreground sm:text-xl">
            Plan meals, track your pantry, and generate smart grocery lists. Share it all with the
            people you cook for.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link href="/register" className={cn(pill, pillSolid, "min-h-14 px-8 text-[17px]")}>
              Create your kitchen
            </Link>
            <Link href="#features" className={cn(pill, pillOutline, "min-h-14 px-7 text-[17px]")}>
              See how it works
            </Link>
          </div>
          <p className="text-sm text-muted-foreground">
            Free to start. Works on your phone, tablet and desktop.
          </p>
        </div>

        <div className="flex min-w-0 flex-[1_1_380px] justify-center">
          <LemonSlice>
            <div className="pointer-events-none absolute bottom-[6%] left-0 z-10 flex items-center gap-3 rounded-2xl border bg-card px-4 py-3 shadow-[0_12px_30px_-16px_rgb(60_45_10/0.35)]">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-leaf-soft">
                <Check className="size-[18px] text-leaf-ink" strokeWidth={2.5} />
              </span>
              <span className="flex flex-col">
                <strong className="text-[15px]">Know what you can make</strong>
                <span className="text-[13px] text-muted-foreground">from what is in your pantry</span>
              </span>
            </div>
          </LemonSlice>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="scroll-mt-4 border-y bg-card">
        <div className="mx-auto flex max-w-6xl flex-col gap-14 px-4 py-20 sm:px-6 lg:py-24">
          <div className="flex flex-wrap items-end justify-between gap-6">
            <h2 className="max-w-[12em] font-heading text-[clamp(2.25rem,4vw,3.5rem)] leading-[1.05] font-medium tracking-[-0.02em]">
              Everything you need in one kitchen
            </h2>
            <p className="max-w-[26em] text-lg leading-relaxed text-muted-foreground">
              From the recipe you saved last spring to the lemon in the crisper drawer. It all
              talks to each other.
            </p>
          </div>
          <div className="grid border-t sm:grid-cols-2 lg:grid-cols-3">
            {features.map((f) => (
              <article key={f.title} className="flex flex-col gap-2 border-b py-8 pr-8">
                <h3 className="font-heading text-2xl font-semibold">{f.title}</h3>
                <p className="leading-relaxed text-muted-foreground">{f.description}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* Households */}
      <section className="mx-auto w-full max-w-6xl px-4 py-20 sm:px-6 lg:py-24">
        <div className="flex flex-wrap items-center gap-12 rounded-[2rem] bg-[#1f1b14] p-[clamp(2.25rem,6vw,5rem)] text-[#fbf7ee]">
          <div className="flex min-w-0 flex-[1_1_420px] flex-col gap-5">
            <h2 className="font-heading text-[clamp(2.1rem,4vw,3.25rem)] leading-[1.06] font-medium tracking-[-0.02em]">
              Built for households, not just individuals
            </h2>
            <p className="text-lg leading-relaxed text-[#d9d1bf]">
              Invite your partner, roommate, or family to share recipes, pantry items, meal plans,
              and grocery lists. Everyone stays in sync.
            </p>
            <div>
              <Link href="/register" className={cn(pill, pillSolid, "min-h-13 px-7 text-base focus-visible:outline-[#f4cf3a]")}>
                Create your kitchen
              </Link>
            </div>
          </div>
          <ul className="flex min-w-0 flex-[1_1_320px] flex-col">
            {household.map((item, i) => (
              <li
                key={item}
                className={cn(
                  "flex items-center gap-4 py-5 text-lg",
                  i < household.length - 1 && "border-b border-[#fbf7ee]/15"
                )}
              >
                <span className="size-2.5 shrink-0 rounded-full bg-brand" aria-hidden="true" />
                {item}
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Closing CTA */}
      <section className="mx-auto flex w-full max-w-6xl flex-col items-center gap-6 px-4 pt-4 pb-28 text-center sm:px-6">
        <h2 className="max-w-[14em] font-heading text-[clamp(2.25rem,5vw,4rem)] leading-[1.04] font-medium tracking-[-0.02em] text-balance">
          Dinner is easier when the kitchen remembers for you.
        </h2>
        <div className="flex flex-wrap justify-center gap-3">
          <Link href="/register" className={cn(pill, pillSolid, "min-h-14 px-8 text-[17px]")}>
            Get started free
          </Link>
          <Link href="/login" className={cn(pill, pillOutline, "min-h-14 px-7 text-[17px]")}>
            Sign in
          </Link>
        </div>
      </section>

      <footer className="mt-auto border-t">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-8 text-sm text-muted-foreground sm:px-6">
          <span className="flex items-center gap-2">
            <LemonLogo className="h-5 w-5" />
            My Lemon Kitchen
          </span>
          <nav aria-label="Footer" className="flex gap-6">
            <Link href="/blog">Recipe blogs</Link>
            <Link href="/login">Sign in</Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
