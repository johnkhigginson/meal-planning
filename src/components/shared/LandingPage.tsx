import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  UtensilsCrossed,
  Package,
  CalendarDays,
  ShoppingCart,
  Lightbulb,
  Camera,
  ArrowRight,
  Check,
} from "lucide-react";
import { LemonLogo } from "./LemonLogo";

const features = [
  {
    icon: UtensilsCrossed,
    title: "Recipe Collection",
    description:
      "Store all your recipes in one place. Import from websites, scan cookbook pages, or add your own.",
  },
  {
    icon: Package,
    title: "Pantry Tracking",
    description:
      "Keep track of what you have on hand. Scan receipts to instantly update your pantry.",
  },
  {
    icon: Lightbulb,
    title: "What Can I Make?",
    description:
      "See which recipes you can make right now based on what's in your pantry.",
  },
  {
    icon: CalendarDays,
    title: "Meal Planning",
    description:
      "Plan your meals for the week. Choose which meals to plan — dinners only, or the whole day.",
  },
  {
    icon: ShoppingCart,
    title: "Smart Grocery Lists",
    description:
      "Auto-generate grocery lists from your meal plan, minus what you already have.",
  },
  {
    icon: Camera,
    title: "AI-Powered Import",
    description:
      "Snap a photo of a receipt or cookbook page and let AI do the data entry for you.",
  },
];

const highlights = [
  "Import recipes from any website in one click",
  "Share your kitchen with a partner or roommate",
  "Know exactly what you can cook tonight",
  "Never forget an ingredient at the store",
];

export function LandingPage() {
  return (
    <div className="flex min-h-screen flex-col bg-white">
      {/* Nav */}
      <header className="sticky top-0 z-50 border-b bg-white/80 backdrop-blur-sm">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
          <div className="flex items-center gap-2.5">
            <LemonLogo className="h-8 w-8" />
            <span className="text-lg font-bold tracking-tight">My Lemon Kitchen</span>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/login">
              <Button variant="ghost" className="text-sm">Sign In</Button>
            </Link>
            <Link href="/register">
              <Button className="text-sm">Get Started</Button>
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden px-6 py-28">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-[#FFF700]/15 via-transparent to-transparent" />
        <div className="relative mx-auto max-w-4xl text-center">
          <div className="mx-auto mb-8 flex h-16 w-16 items-center justify-center">
            <LemonLogo className="h-16 w-16" />
          </div>
          <h1 className="text-5xl font-extrabold leading-[1.1] tracking-tight text-foreground sm:text-6xl">
            Meal planning,
            <br />
            <span className="bg-gradient-to-r from-[#FFF700] to-[#f5c800] bg-clip-text text-transparent">
              squeezed simple.
            </span>
          </h1>
          <p className="mx-auto mt-6 max-w-xl text-lg leading-relaxed text-muted-foreground">
            Plan meals, track your pantry, and build smart grocery lists.
            Import recipes from anywhere. Share everything with your household.
          </p>
          <div className="mt-10 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
            <Link href="/register">
              <Button size="lg" className="h-12 gap-2 px-8 text-base">
                Start Planning Free
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          </div>
          <div className="mt-12 flex flex-wrap justify-center gap-x-8 gap-y-3">
            {highlights.map((item) => (
              <div key={item} className="flex items-center gap-2 text-sm text-muted-foreground">
                <Check className="h-4 w-4 text-[#c4b000]" />
                {item}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="border-t bg-neutral-50 px-6 py-24">
        <div className="mx-auto max-w-6xl">
          <div className="text-center">
            <p className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">
              Features
            </p>
            <h2 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">
              Everything you need in one kitchen
            </h2>
          </div>
          <div className="mt-16 grid gap-10 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((feature) => (
              <div key={feature.title} className="group">
                <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-black transition-transform group-hover:scale-110">
                  <feature.icon className="h-5 w-5 text-[#FFF700]" />
                </div>
                <h3 className="text-base font-semibold">{feature.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                  {feature.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Household CTA */}
      <section className="border-t px-6 py-24">
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="text-3xl font-bold tracking-tight">
            Built for households, not just individuals
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            Invite your partner, roommate, or family to share recipes, pantry
            items, meal plans, and grocery lists. Everyone stays in sync.
          </p>
          <Link href="/register">
            <Button size="lg" className="mt-8 h-12 gap-2 px-8 text-base">
              Create Your Kitchen
              <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t bg-neutral-50 px-6 py-8">
        <div className="mx-auto flex max-w-6xl items-center justify-between">
          <div className="flex items-center gap-2">
            <LemonLogo className="h-5 w-5" />
            <span className="text-sm font-medium">My Lemon Kitchen</span>
          </div>
          <p className="text-xs text-muted-foreground">
            Made with lemons
          </p>
        </div>
      </footer>
    </div>
  );
}
