import { Card, CardContent } from "@/components/ui/card";
import {
  UtensilsCrossed,
  CalendarDays,
  ShoppingCart,
  Lightbulb,
  ArrowRight,
  Heart,
  Globe,
  Users,
  Plus,
} from "lucide-react";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { parseHiddenNav } from "@/lib/nav";
import { cn } from "@/lib/utils";

interface DashboardProps {
  userId: number;
  householdId: number;
  name: string;
}

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

// Pill links. buttonVariants lives in a client module, so it can't be called
// from this server component.
const pill =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-full px-5 text-[15px] font-bold transition-[transform,background-color,box-shadow] duration-200 ease-out hover:-translate-y-px focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring";

// Show dinner first when a day has several meals planned.
const SLOT_ORDER: Record<string, number> = { DINNER: 0, LUNCH: 1, BREAKFAST: 2, SNACK: 3 };

const liftCard =
  "hover:-translate-y-0.5 hover:border-input hover:shadow-[0_14px_30px_-18px_rgb(60_45_10/0.45)]";

export async function Dashboard({ userId, householdId, name }: DashboardProps) {
  const [
    me,
    recipeCount,
    favoriteCount,
    cookbookCount,
    pantryCount,
    storeCount,
    currentPlan,
    recentRecipes,
    publishedBooks,
  ] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { hiddenNavItems: true } }),
    prisma.recipe.count({ where: { householdId } }),
    prisma.recipe.count({ where: { householdId, isFavorite: true } }),
    prisma.recipeBook.count({ where: { householdId } }),
    prisma.inventoryItem.count({ where: { householdId } }),
    prisma.store.count({ where: { householdId } }),
    prisma.mealPlan.findFirst({
      where: { householdId },
      orderBy: { weekStartDate: "desc" },
      include: {
        entries: {
          select: { date: true, mealSlot: true, customName: true, recipe: { select: { name: true } } },
        },
      },
    }),
    prisma.recipe.findMany({
      where: { householdId },
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      take: 6,
      select: { id: true, name: true, imageUrl: true, prepTimeMinutes: true, cookTimeMinutes: true },
    }),
    prisma.recipeBook.findMany({
      where: { householdId, isPublished: true, slug: { not: null } },
      select: {
        id: true,
        name: true,
        slug: true,
        _count: { select: { entries: true, subscribers: true } },
      },
      orderBy: { publishedAt: "desc" },
    }),
  ]);

  const hidden = parseHiddenNav(me?.hiddenNavItems);
  const shows = (href: string) => !hidden.has(href);
  const firstName = name.trim().split(/\s+/)[0] || "there";
  const plannedCount = currentPlan?.entries.length ?? 0;

  // Seven days of the latest plan. Dates are SQL dates (UTC midnight), so
  // read them in UTC to avoid sliding a day in western time zones.
  const week = currentPlan
    ? Array.from({ length: 7 }, (_, i) => {
        const d = new Date(currentPlan.weekStartDate);
        d.setUTCDate(d.getUTCDate() + i);
        const key = d.toISOString().slice(0, 10);
        const meals = currentPlan.entries
          .filter((e) => e.date.toISOString().slice(0, 10) === key)
          .sort((a, b) => (SLOT_ORDER[a.mealSlot] ?? 9) - (SLOT_ORDER[b.mealSlot] ?? 9))
          .map((e) => e.recipe?.name ?? e.customName ?? "Meal");
        return {
          key,
          label: d.toLocaleDateString("en-US", { weekday: "short", day: "numeric", timeZone: "UTC" }),
          meals,
        };
      })
    : [];

  // Stat tiles: Recipes & Cookbooks always show; the rest follow the user's
  // menu preferences so a hidden section doesn't reappear on the home page.
  const stats = [
    { href: "/recipes", label: "Recipes", value: recipeCount, always: true },
    { href: "/books", label: "Cookbooks", value: cookbookCount, always: true },
    { href: "/pantry", label: "Pantry items", value: pantryCount },
    { href: "/meal-plan", label: "Meals planned", value: plannedCount },
    { href: "/stores", label: "Stores", value: storeCount },
  ].filter((s) => s.always || shows(s.href));

  const quickLinks = [
    { href: "/what-can-i-make", label: "What can I make?", description: "Find recipes matching your pantry", icon: Lightbulb },
    { href: "/grocery-list", label: "Grocery list", description: "Auto-generated from your meal plan", icon: ShoppingCart },
  ].filter((q) => shows(q.href));

  return (
    <div className="mx-auto max-w-6xl space-y-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-4xl leading-tight font-medium sm:text-5xl">
            {greeting()}, {firstName}
          </h1>
          <p className="text-muted-foreground">Here&apos;s what&apos;s in your kitchen</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {shows("/what-can-i-make") && (
            <Link href="/what-can-i-make" className={cn(pill, "border-[1.5px] border-foreground hover:bg-muted")}>
              What can I make?
            </Link>
          )}
          <Link
            href="/recipes/new"
            className={cn(pill, "bg-brand font-extrabold text-brand-foreground hover:bg-brand/85")}
          >
            <Plus className="h-4 w-4" strokeWidth={2.5} />
            Add recipe
          </Link>
        </div>
      </div>

      {/* This week */}
      {shows("/meal-plan") && (
        <section aria-labelledby="week-heading" className="rounded-3xl border bg-card p-5 sm:p-6">
          <div className="mb-4 flex items-baseline justify-between gap-3">
            <h2 id="week-heading" className="font-heading text-2xl font-semibold">
              This week
            </h2>
            <Link href="/meal-plan" className="text-sm font-bold text-primary hover:underline">
              Open meal plan
            </Link>
          </div>
          {plannedCount > 0 ? (
            <div className="overflow-x-auto">
              <ol className="grid min-w-[42rem] grid-cols-7 gap-2">
                {week.map((day) => (
                  <li
                    key={day.key}
                    className={cn(
                      "flex min-h-28 flex-col gap-1.5 rounded-2xl p-3",
                      day.meals.length > 0 ? "bg-muted" : "border-[1.5px] border-dashed border-input"
                    )}
                  >
                    <span className="text-xs font-extrabold text-muted-foreground uppercase">{day.label}</span>
                    {day.meals.length > 0 ? (
                      <>
                        <span className="text-[13px] leading-snug font-semibold">{day.meals[0]}</span>
                        {day.meals.length > 1 && (
                          <span className="text-xs text-muted-foreground">+{day.meals.length - 1} more</span>
                        )}
                      </>
                    ) : (
                      <span className="text-[13px] text-muted-foreground">Nothing planned</span>
                    )}
                  </li>
                ))}
              </ol>
            </div>
          ) : (
            <Link
              href="/meal-plan"
              className="flex items-center gap-4 rounded-2xl border-[1.5px] border-dashed border-input p-5 transition-colors hover:bg-muted"
            >
              <CalendarDays className="h-6 w-6 text-primary" />
              <div className="flex-1">
                <div className="font-semibold">Nothing planned yet</div>
                <div className="text-sm text-muted-foreground">Plan your week to auto-build a grocery list</div>
              </div>
              <ArrowRight className="h-4 w-4 text-muted-foreground" />
            </Link>
          )}
        </section>
      )}

      {/* Stats */}
      <section aria-label="Kitchen totals" className="grid grid-cols-2 gap-3 sm:grid-cols-[repeat(auto-fit,minmax(10rem,1fr))]">
        {stats.map((stat) => (
          <Link
            key={stat.href}
            href={stat.href}
            className={cn("flex flex-col gap-1 rounded-2xl border bg-card p-5 transition-[transform,box-shadow,border-color] duration-200 ease-out", liftCard)}
          >
            <span className="font-heading text-4xl leading-none font-medium tabular-nums">{stat.value}</span>
            <span className="text-sm font-semibold text-muted-foreground">{stat.label}</span>
          </Link>
        ))}
      </section>

      {/* Recently added/updated recipes */}
      {recentRecipes.length > 0 && (
        <section aria-labelledby="recent-heading">
          <div className="mb-4 flex items-baseline justify-between">
            <h2 id="recent-heading" className="font-heading text-2xl font-semibold">
              Recently added
            </h2>
            <Link href="/recipes" className="text-sm font-bold text-primary hover:underline">
              All recipes
            </Link>
          </div>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
            {recentRecipes.map((r) => {
              const mins = (r.prepTimeMinutes ?? 0) + (r.cookTimeMinutes ?? 0);
              return (
                <Link
                  key={r.id}
                  href={`/recipes/${r.id}`}
                  className={cn("group flex flex-col overflow-hidden rounded-2xl border bg-card transition-[transform,box-shadow,border-color] duration-200 ease-out", liftCard)}
                >
                  <div className="aspect-[4/3] w-full overflow-hidden bg-accent">
                    {r.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={r.imageUrl} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center">
                        <UtensilsCrossed className="h-6 w-6 text-primary/50" />
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col gap-0.5 p-3">
                    <p className="line-clamp-2 text-sm leading-snug font-bold">{r.name}</p>
                    {mins > 0 && <p className="text-xs text-muted-foreground">{mins} min</p>}
                  </div>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      {/* Published blogs with reach */}
      {publishedBooks.length > 0 && (
        <section aria-labelledby="blogs-heading">
          <h2 id="blogs-heading" className="mb-4 font-heading text-2xl font-semibold">
            Your blogs
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {publishedBooks.map((b) => (
              <Card key={b.id}>
                <CardContent className="flex items-center gap-4">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent">
                    <Globe className="h-5 w-5 text-primary" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-bold">{b.name}</div>
                    <div className="mt-0.5 flex items-center gap-3 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <UtensilsCrossed className="h-3 w-3" />
                        {b._count.entries} recipe{b._count.entries === 1 ? "" : "s"}
                      </span>
                      <span className="flex items-center gap-1">
                        <Users className="h-3 w-3" />
                        {b._count.subscribers} follower{b._count.subscribers === 1 ? "" : "s"}
                      </span>
                    </div>
                  </div>
                  <Link href={`/blog/${b.slug}`} className="shrink-0 text-sm font-bold text-primary hover:underline">
                    View
                  </Link>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      )}

      {/* Quick actions */}
      {quickLinks.length > 0 && (
        <section aria-labelledby="quick-heading">
          <h2 id="quick-heading" className="mb-4 font-heading text-2xl font-semibold">
            Quick actions
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {quickLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={cn("group flex items-center gap-4 rounded-2xl border bg-card p-5 transition-[transform,box-shadow,border-color] duration-200 ease-out", liftCard)}
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand text-brand-foreground">
                  <link.icon className="h-5 w-5" />
                </div>
                <div className="flex-1">
                  <div className="font-bold">{link.label}</div>
                  <div className="text-sm text-muted-foreground">{link.description}</div>
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform duration-200 group-hover:translate-x-0.5" />
              </Link>
            ))}
          </div>
        </section>
      )}

      {favoriteCount > 0 && (
        <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <Heart className="h-3.5 w-3.5 fill-red-600 text-red-600" />
          {favoriteCount} favorite{favoriteCount === 1 ? "" : "s"} in your collection
        </p>
      )}
    </div>
  );
}
