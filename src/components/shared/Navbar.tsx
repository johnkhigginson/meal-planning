"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import {
  ChefHat,
  UtensilsCrossed,
  Package,
  Lightbulb,
  CalendarDays,
  ShoppingCart,
  Store,
  LogOut,
  User,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

const navItems = [
  { href: "/", label: "Dashboard", icon: ChefHat },
  { href: "/recipes", label: "Recipes", icon: UtensilsCrossed },
  { href: "/pantry", label: "Pantry", icon: Package },
  { href: "/what-can-i-make", label: "What Can I Make?", icon: Lightbulb },
  { href: "/meal-plan", label: "Meal Plan", icon: CalendarDays },
  { href: "/grocery-list", label: "Grocery List", icon: ShoppingCart },
  { href: "/stores", label: "Stores", icon: Store },
];

export function Navbar() {
  const pathname = usePathname();
  const { data: session } = useSession();

  return (
    <aside className="flex h-full w-60 flex-col border-r bg-card">
      <div className="flex items-center gap-2 border-b px-4 py-4">
        <ChefHat className="h-6 w-6 text-primary" />
        <span className="text-lg font-semibold">Meal Planner</span>
      </div>
      <nav className="flex-1 space-y-1 p-2">
        {navItems.map((item) => {
          const isActive =
            pathname === item.href ||
            (item.href !== "/" && pathname.startsWith(item.href));
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              )}
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* User section */}
      {session?.user && (
        <div className="border-t p-2">
          <div className="flex items-center gap-3 rounded-md px-3 py-2">
            <User className="h-4 w-4 text-muted-foreground" />
            <div className="flex-1 truncate">
              <p className="truncate text-sm font-medium">
                {session.user.name}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {session.user.email}
              </p>
            </div>
          </div>
          <Separator className="my-1" />
          <Link
            href="/settings"
            className="flex items-center gap-3 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground"
          >
            Settings
          </Link>
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start gap-3 px-3 text-muted-foreground"
            onClick={() => signOut({ callbackUrl: "/login" })}
          >
            <LogOut className="h-4 w-4" />
            Sign Out
          </Button>
        </div>
      )}
    </aside>
  );
}
