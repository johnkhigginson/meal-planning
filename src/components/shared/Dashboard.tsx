import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  UtensilsCrossed,
  Package,
  CalendarDays,
  ShoppingCart,
  Lightbulb,
  Store,
  ArrowRight,
  BookOpen,
  Heart,
  Globe,
  Users,
  Plus,
} from "lucide-react";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { parseHiddenNav } from "@/lib/nav";

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
      include: { _count: { select: { entries: true } } },
    }),
    prisma.recipe.findMany({
      where: { householdId },
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      take: 6,
      select: { id: true, name: true, imageUrl: true },
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

  // Stat tiles — Recipes & Cookbooks always show; the rest follow the user's
  // menu preferences so a hidden section doesn't reappear on the home page.
  const stats = [
    { href: "/recipes", label: "Recipes", value: recipeCount, icon: UtensilsCrossed, always: true },
    { href: "/books", label: "Cookbooks", value: cookbookCount, icon: BookOpen, always: true },
    { href: "/pantry", label: "Pantry", value: pantryCount, icon: Package },
    { href: "/meal-plan", label: "Planned", value: currentPlan?._count.entries ?? 0, icon: CalendarDays },
    { href: "/stores", label: "Stores", value: storeCount, icon: Store },
  ].filter((s) => s.always || shows(s.href));

  const quickLinks = [
    { href: "/recipes/new", label: "Add a recipe", description: "Import from web, photo, or write your own", icon: UtensilsCrossed, always: true },
    { href: "/what-can-i-make", label: "What can I make?", description: "Find recipes matching your pantry", icon: Lightbulb },
    { href: "/meal-plan", label: "Plan your week", description: "Drag recipes into your weekly calendar", icon: CalendarDays },
    { href: "/grocery-list", label: "Grocery list", description: "Auto-generated from your meal plan", icon: ShoppingCart },
  ].filter((q) => q.always || shows(q.href));

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">
            {greeting()}, {firstName}
          </h1>
          <p className="text-sm text-muted-foreground">Here&apos;s what&apos;s in your kitchen</p>
        </div>
        <Link href="/recipes/new">
          <Button size="sm">
            <Plus className="mr-2 h-4 w-4" />
            Add recipe
          </Button>
        </Link>
      </div>

      {/* Stats */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <Link key={stat.href} href={stat.href}>
            <Card className="transition-all hover:shadow-md">
              <CardContent className="flex items-center gap-4 p-5">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/5">
                  <stat.icon className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <div className="text-2xl font-bold leading-none">{stat.value}</div>
                  <div className="mt-1 text-xs text-muted-foreground">{stat.label}</div>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      {/* Recently added/updated recipes */}
      {recentRecipes.length > 0 && (
        <div>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Recent recipes</h2>
            <Link href="/recipes" className="text-xs text-primary hover:underline">
              View all
            </Link>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {recentRecipes.map((r) => (
              <Link key={r.id} href={`/recipes/${r.id}`} className="group">
                <Card className="overflow-hidden p-0 transition-all hover:shadow-md">
                  <div className="aspect-square w-full overflow-hidden bg-muted">
                    {r.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={r.imageUrl} alt={r.name} className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center">
                        <UtensilsCrossed className="h-6 w-6 text-muted-foreground/40" />
                      </div>
                    )}
                  </div>
                  <div className="p-2">
                    <p className="line-clamp-2 text-xs font-medium leading-snug group-hover:text-primary">{r.name}</p>
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Published blogs with reach */}
      {publishedBooks.length > 0 && (
        <div>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Your blogs</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {publishedBooks.map((b) => (
              <Card key={b.id} className="transition-all hover:shadow-md">
                <CardContent className="flex items-center gap-4 p-5">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/5">
                    <Globe className="h-5 w-5 text-primary" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold">{b.name}</div>
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
                  <Link href={`/blog/${b.slug}`} className="shrink-0 text-xs text-primary hover:underline">
                    View
                  </Link>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* This week's plan */}
      {shows("/meal-plan") && (
        <div>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">This week</h2>
          <Link href="/meal-plan">
            <Card className="transition-all hover:shadow-md">
              <CardContent className="flex items-center gap-4 p-5">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/5">
                  <CalendarDays className="h-5 w-5 text-primary" />
                </div>
                <div className="flex-1">
                  <div className="text-sm font-semibold">
                    {currentPlan && currentPlan._count.entries > 0
                      ? `${currentPlan._count.entries} meal${currentPlan._count.entries === 1 ? "" : "s"} planned`
                      : "Nothing planned yet"}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {currentPlan && currentPlan._count.entries > 0
                      ? "Open your meal plan to review the week"
                      : "Plan your week to auto-build a grocery list"}
                  </div>
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground/30" />
              </CardContent>
            </Card>
          </Link>
        </div>
      )}

      {/* Quick Actions */}
      <div>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Quick Actions</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {quickLinks.map((link) => (
            <Link key={link.href} href={link.href}>
              <Card className="group transition-all hover:shadow-md">
                <CardContent className="flex items-center gap-4 p-5">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground">
                    <link.icon className="h-5 w-5" />
                  </div>
                  <div className="flex-1">
                    <div className="text-sm font-semibold">{link.label}</div>
                    <div className="text-xs text-muted-foreground">{link.description}</div>
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground/30 transition-transform group-hover:translate-x-0.5 group-hover:text-muted-foreground" />
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </div>

      {favoriteCount > 0 && (
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Heart className="h-3.5 w-3.5 fill-red-500 text-red-500" />
          {favoriteCount} favorite{favoriteCount === 1 ? "" : "s"} in your collection
        </p>
      )}
    </div>
  );
}
