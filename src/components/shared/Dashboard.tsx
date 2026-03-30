import { Card, CardContent } from "@/components/ui/card";
import {
  UtensilsCrossed,
  Package,
  CalendarDays,
  ShoppingCart,
  Lightbulb,
  Store,
  ArrowRight,
} from "lucide-react";
import Link from "next/link";
import { prisma } from "@/lib/prisma";

interface DashboardProps {
  householdId: number;
}

export async function Dashboard({ householdId }: DashboardProps) {
  const [recipeCount, pantryCount, storeCount, currentPlan] =
    await Promise.all([
      prisma.recipe.count({ where: { householdId } }),
      prisma.inventoryItem.count({ where: { householdId } }),
      prisma.store.count({ where: { householdId } }),
      prisma.mealPlan.findFirst({
        where: { householdId },
        orderBy: { weekStartDate: "desc" },
        include: { _count: { select: { entries: true } } },
      }),
    ]);

  const stats = [
    { href: "/recipes", label: "Recipes", value: recipeCount, icon: UtensilsCrossed },
    { href: "/pantry", label: "Pantry", value: pantryCount, icon: Package },
    { href: "/meal-plan", label: "Planned", value: currentPlan?._count.entries ?? 0, icon: CalendarDays },
    { href: "/stores", label: "Stores", value: storeCount, icon: Store },
  ];

  const quickLinks = [
    { href: "/recipes/new", label: "Add a recipe", description: "Import from web, photo, or write your own", icon: UtensilsCrossed },
    { href: "/what-can-i-make", label: "What can I make?", description: "Find recipes matching your pantry", icon: Lightbulb },
    { href: "/meal-plan", label: "Plan your week", description: "Drag recipes into your weekly calendar", icon: CalendarDays },
    { href: "/grocery-list", label: "Grocery list", description: "Auto-generated from your meal plan", icon: ShoppingCart },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          Here&apos;s what&apos;s in your kitchen
        </p>
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

      {/* Quick Actions */}
      <div>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Quick Actions
        </h2>
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
    </div>
  );
}
