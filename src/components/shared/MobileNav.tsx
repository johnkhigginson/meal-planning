"use client";

import { useState } from "react";
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
  Menu,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { LemonLogo } from "./LemonLogo";

const navItems = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/recipes", label: "Recipes", icon: UtensilsCrossed },
  { href: "/pantry", label: "Pantry", icon: Package },
  { href: "/what-can-i-make", label: "What Can I Make?", icon: Lightbulb },
  { href: "/meal-plan", label: "Meal Plan", icon: CalendarDays },
  { href: "/grocery-list", label: "Grocery List", icon: ShoppingCart },
  { href: "/stores", label: "Stores", icon: Store },
];

export function MobileNav() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const { data: session } = useSession();

  return (
    <>
      {/* Top bar */}
      <div className="sticky top-0 z-50 flex items-center justify-between border-b bg-background px-4 py-3">
        <div className="flex items-center gap-2">
          <LemonLogo className="h-7 w-7" />
          <span className="text-base font-bold tracking-tight">My Lemon Kitchen</span>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setOpen(!open)}
        >
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </Button>
      </div>

      {/* Slide-down menu */}
      {open && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/20 backdrop-blur-sm"
            onClick={() => setOpen(false)}
          />
          <div className="fixed inset-x-0 top-[57px] z-50 border-b bg-background p-4 shadow-lg">
            <nav className="space-y-1">
              {navItems.map((item) => {
                const isActive =
                  pathname === item.href ||
                  (item.href !== "/" && pathname.startsWith(item.href));
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setOpen(false)}
                    className={cn(
                      "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                      isActive
                        ? "bg-primary/10 text-primary"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground"
                    )}
                  >
                    <item.icon className="h-4 w-4" />
                    {item.label}
                  </Link>
                );
              })}
            </nav>

            <div className="mt-3 border-t pt-3">
              {session?.user && (
                <div className="mb-2 px-3">
                  <p className="text-sm font-medium">{session.user.name}</p>
                  <p className="text-xs text-muted-foreground">{session.user.email}</p>
                </div>
              )}
              <Link
                href="/settings"
                onClick={() => setOpen(false)}
                className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <Settings className="h-4 w-4" />
                Settings
              </Link>
              <button
                onClick={() => signOut({ callbackUrl: "/login" })}
                className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <LogOut className="h-4 w-4" />
                Sign Out
              </button>
            </div>
          </div>
        </>
      )}
    </>
  );
}
