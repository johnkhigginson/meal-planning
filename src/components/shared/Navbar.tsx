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
  BookOpen,
  HelpCircle,
} from "lucide-react";
import { LemonLogo } from "./LemonLogo";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { parseHiddenNav } from "@/lib/nav";

const navItems = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/recipes", label: "Recipes", icon: UtensilsCrossed },
  { href: "/books", label: "Books", icon: BookOpen },
  { href: "/pantry", label: "Pantry", icon: Package },
  { href: "/what-can-i-make", label: "What Can I Make?", icon: Lightbulb },
  { href: "/meal-plan", label: "Meal Plan", icon: CalendarDays },
  { href: "/grocery-list", label: "Grocery List", icon: ShoppingCart },
  { href: "/stores", label: "Stores", icon: Store },
];

// Below 1024px the sidebar collapses to an icon rail; labels show as tooltips.
const linkBase =
  "flex items-center justify-center gap-3 rounded-lg px-3 py-2 text-[13px] font-medium transition-colors lg:justify-start";
const linkIdle = "text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-foreground";
const linkActive = "bg-sidebar-accent text-sidebar-primary";

export function Navbar() {
  const pathname = usePathname();
  const { data: session } = useSession();

  const hidden = parseHiddenNav((session?.user as { hiddenNavItems?: string } | undefined)?.hiddenNavItems);
  const visibleItems = navItems.filter((item) => !hidden.has(item.href));
  const systemRole = (session?.user as { systemRole?: string } | undefined)?.systemRole;
  const canAdmin = systemRole === "ADMIN" || systemRole === "CONTRIBUTOR";

  // The left inset keeps icons clear of the notch on a phone held sideways,
  // which is wide enough to get the rail.
  return (
    <aside className="flex h-full w-[calc(4rem+env(safe-area-inset-left))] flex-col border-r border-sidebar-border bg-sidebar pl-[env(safe-area-inset-left)] lg:w-56">
      {/* Logo */}
      <div className="flex items-center justify-center gap-2.5 py-5 lg:justify-start lg:px-5">
        <LemonLogo className="h-7 w-7" />
        <span className="hidden text-base font-bold tracking-tight text-sidebar-foreground lg:inline">
          My Lemon Kitchen
        </span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 pt-2">
        {visibleItems.map((item) => {
          const isActive =
            pathname === item.href ||
            (item.href !== "/" && pathname.startsWith(item.href));
          return (
            <Link
              key={item.href}
              href={item.href}
              title={item.label}
              aria-label={item.label}
              className={cn(linkBase, isActive ? linkActive : linkIdle)}
            >
              <item.icon className="h-4 w-4 shrink-0" />
              <span className="hidden lg:inline">{item.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* User section */}
      {session?.user && (
        <div className="space-y-0.5 border-t border-sidebar-border px-3 py-3">
          <div className="mb-1 hidden px-3 py-1.5 lg:block">
            <p className="truncate text-sm font-medium text-sidebar-foreground">
              {session.user.name}
            </p>
            <p className="truncate text-xs text-sidebar-foreground/50">
              {session.user.email}
            </p>
          </div>
          {canAdmin && (
            <Link
              href="/admin"
              title="Admin"
              aria-label="Admin"
              className={cn(linkBase, pathname.startsWith("/admin") ? linkActive : linkIdle)}
            >
              <Shield className="h-4 w-4 shrink-0" />
              <span className="hidden lg:inline">Admin</span>
            </Link>
          )}
          <Link
            href="/help"
            title="Help & Tutorial"
            aria-label="Help & Tutorial"
            className={cn(linkBase, pathname === "/help" ? linkActive : linkIdle)}
          >
            <HelpCircle className="h-4 w-4 shrink-0" />
            <span className="hidden lg:inline">Help &amp; Tutorial</span>
          </Link>
          <Link
            href="/settings"
            title="Settings"
            aria-label="Settings"
            className={cn(linkBase, pathname === "/settings" ? linkActive : linkIdle)}
          >
            <Settings className="h-4 w-4 shrink-0" />
            <span className="hidden lg:inline">Settings</span>
          </Link>
          <Button
            variant="ghost"
            size="sm"
            title="Sign Out"
            aria-label="Sign Out"
            className="w-full justify-center gap-3 px-3 text-[13px] text-sidebar-foreground/60 hover:text-sidebar-foreground lg:justify-start"
            onClick={() => signOut({ callbackUrl: "/login" })}
          >
            <LogOut className="h-4 w-4 shrink-0" />
            <span className="hidden lg:inline">Sign Out</span>
          </Button>
        </div>
      )}
    </aside>
  );
}
