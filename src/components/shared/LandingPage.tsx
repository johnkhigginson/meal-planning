import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  UtensilsCrossed,
  Package,
  CalendarDays,
  ShoppingCart,
  Lightbulb,
  Camera,
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
    title: "Receipt & Photo Import",
    description:
      "Snap a photo of a receipt or cookbook page and let AI do the data entry for you.",
  },
];

export function LandingPage() {
  return (
    <div className="flex min-h-screen flex-col">
      {/* Nav */}
      <header className="border-b bg-card">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2">
            <LemonLogo className="h-8 w-8" />
            <span className="text-xl font-bold">My Lemon Kitchen</span>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/login">
              <Button variant="ghost">Sign In</Button>
            </Link>
            <Link href="/register">
              <Button>Get Started</Button>
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="bg-gradient-to-b from-yellow-50 to-background px-6 py-24 text-center">
        <div className="mx-auto max-w-3xl">
          <h1 className="text-5xl font-bold tracking-tight text-foreground">
            Meal planning,{" "}
            <span className="text-foreground">simplified</span>
          </h1>
          <p className="mt-6 text-lg leading-relaxed text-muted-foreground">
            Plan your meals, track your pantry, and generate smart grocery
            lists. Import recipes from anywhere — websites, cookbooks, or your
            own collection.
          </p>
          <div className="mt-10 flex justify-center gap-4">
            <Link href="/register">
              <Button size="lg" className="h-12 px-8 text-base">
                Start Planning
              </Button>
            </Link>
            <Link href="/login">
              <Button variant="outline" size="lg" className="h-12 px-8 text-base">
                Sign In
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="px-6 py-20">
        <div className="mx-auto max-w-6xl">
          <h2 className="text-center text-3xl font-bold">
            Everything you need to plan meals
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-center text-muted-foreground">
            From recipe storage to grocery shopping, My Lemon Kitchen handles
            the entire workflow.
          </p>
          <div className="mt-14 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((feature) => (
              <div key={feature.title} className="space-y-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#FFF700]/20">
                  <feature.icon className="h-5 w-5 text-foreground" />
                </div>
                <h3 className="text-lg font-semibold">{feature.title}</h3>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  {feature.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="border-t bg-card px-6 py-16 text-center">
        <h2 className="text-2xl font-bold">Ready to simplify your meals?</h2>
        <p className="mt-2 text-muted-foreground">
          Create a free account and start planning today.
        </p>
        <Link href="/register">
          <Button size="lg" className="mt-6 h-12 px-8 text-base">
            Get Started
          </Button>
        </Link>
      </section>

      {/* Footer */}
      <footer className="border-t px-6 py-6 text-center text-sm text-muted-foreground">
        My Lemon Kitchen
      </footer>
    </div>
  );
}
