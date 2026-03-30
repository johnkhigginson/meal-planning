import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  UtensilsCrossed,
  Package,
  CalendarDays,
  ShoppingCart,
  Lightbulb,
  Store,
} from "lucide-react";
import Link from "next/link";
import { prisma } from "@/lib/prisma";

interface DashboardProps {
  userId: number;
}

export async function Dashboard({ userId }: DashboardProps) {
  const [recipeCount, pantryCount, storeCount, currentPlan] =
    await Promise.all([
      prisma.recipe.count({ where: { userId } }),
      prisma.inventoryItem.count({ where: { userId } }),
      prisma.store.count({ where: { userId } }),
      prisma.mealPlan.findFirst({
        where: { userId },
        orderBy: { weekStartDate: "desc" },
        include: { _count: { select: { entries: true } } },
      }),
    ]);

  const stats = [
    {
      href: "/recipes",
      label: "Recipes",
      value: recipeCount,
      description: "in your collection",
      icon: UtensilsCrossed,
    },
    {
      href: "/pantry",
      label: "Pantry Items",
      value: pantryCount,
      description: "tracked in your pantry",
      icon: Package,
    },
    {
      href: "/meal-plan",
      label: "Planned Meals",
      value: currentPlan?._count.entries ?? 0,
      description: "this week",
      icon: CalendarDays,
    },
    {
      href: "/stores",
      label: "Stores",
      value: storeCount,
      description: "for price tracking",
      icon: Store,
    },
  ];

  const quickLinks = [
    { href: "/recipes/new", label: "Add Recipe", icon: UtensilsCrossed },
    { href: "/what-can-i-make", label: "What Can I Make?", icon: Lightbulb },
    { href: "/meal-plan", label: "Plan Meals", icon: CalendarDays },
    { href: "/grocery-list", label: "Grocery List", icon: ShoppingCart },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground">
          Welcome to your meal planning hub
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <Link key={stat.href} href={stat.href}>
            <Card className="transition-colors hover:bg-accent">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">
                  {stat.label}
                </CardTitle>
                <stat.icon className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stat.value}</div>
                <p className="text-xs text-muted-foreground">
                  {stat.description}
                </p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      <div>
        <h2 className="mb-3 text-lg font-semibold">Quick Actions</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {quickLinks.map((link) => (
            <Link key={link.href} href={link.href}>
              <Card className="transition-colors hover:bg-accent">
                <CardContent className="flex items-center gap-3 p-4">
                  <link.icon className="h-5 w-5 text-emerald-600" />
                  <span className="font-medium">{link.label}</span>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
