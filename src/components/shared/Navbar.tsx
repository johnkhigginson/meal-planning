"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import {
  UtensilsCrossed,
  Package,
  Lightbulb,
  CalendarDays,
  ShoppingCart,
  Store,
  LogOut,
  Settings,
  LayoutDashboard,
  Shield,
} from "lucide-react";
import { LemonLogo } from "./LemonLogo";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

const navItems = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
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
    <aside className="flex h-full w-56 flex-col border-r border-sidebar-border bg-sidebar">
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-5 py-5">
        <LemonLogo className="h-7 w-7" />
        <span className="text-base font-bold tracking-tight text-sidebar-foreground">My Lemon Kitchen</span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-0.5 px-3 pt-2">
        {navItems.map((item) => {
          const isActive =
            pathname === item.href ||
            (item.href !== "/" && pathname.startsWith(item.href));
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-[13px] font-medium transition-colors",
                isActive
                  ? "bg-sidebar-accent text-sidebar-primary"
                  : "text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-foreground"
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
        <div className="border-t border-sidebar-border px-3 py-3">
          <div className="mb-1 px-3 py-1.5">
            <p className="truncate text-sm font-medium text-sidebar-foreground">
              {session.user.name}
            </p>
            <p className="truncate text-xs text-sidebar-foreground/50">
              {session.user.email}
            </p>
          </div>
          {((session.user as { systemRole?: string }).systemRole === "ADMIN" || (session.user as { systemRole?: string }).systemRole === "CONTRIBUTOR") && (
            <Link
              href="/admin"
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-[13px] font-medium transition-colors",
                pathname.startsWith("/admin")
                  ? "bg-sidebar-accent text-sidebar-primary"
                  : "text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-foreground"
              )}
            >
              <Shield className="h-4 w-4" />
              Admin
            </Link>
          )}
          <Link
            href="/settings"
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2 text-[13px] font-medium transition-colors",
              pathname === "/settings"
                ? "bg-sidebar-accent text-sidebar-primary"
                : "text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-foreground"
            )}
          >
            <Settings className="h-4 w-4" />
            Settings
          </Link>
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start gap-3 px-3 text-[13px] text-sidebar-foreground/60 hover:text-sidebar-foreground"
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
