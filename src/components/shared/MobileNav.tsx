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
  BookOpen,
  LogOut,
  Settings,
  Shield,
  LayoutDashboard,
  HelpCircle,
  MoreHorizontal,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { LemonLogo } from "./LemonLogo";
import { parseHiddenNav } from "@/lib/nav";

// Primary tabs shown in bottom bar
const primaryTabs = [
  { href: "/", label: "Home", icon: LayoutDashboard },
  { href: "/recipes", label: "Recipes", icon: UtensilsCrossed },
  { href: "/pantry", label: "Pantry", icon: Package },
  { href: "/meal-plan", label: "Plan", icon: CalendarDays },
];

// Secondary items shown in "More" sheet
const secondaryItems = [
  { href: "/books", label: "Books", icon: BookOpen },
  { href: "/what-can-i-make", label: "What Can I Make?", icon: Lightbulb },
  { href: "/grocery-list", label: "Grocery List", icon: ShoppingCart },
  { href: "/stores", label: "Stores", icon: Store },
  { href: "/help", label: "Help & Tutorial", icon: HelpCircle },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function MobileNav() {
  const [moreOpen, setMoreOpen] = useState(false);
  const pathname = usePathname();
  const { data: session } = useSession();

  const hidden = parseHiddenNav((session?.user as { hiddenNavItems?: string } | undefined)?.hiddenNavItems);
  const tabs = primaryTabs.filter((t) => !hidden.has(t.href));
  const secondary = secondaryItems.filter((i) => !hidden.has(i.href));

  function isActive(href: string) {
    return pathname === href || (href !== "/" && pathname.startsWith(href));
  }

  return (
    <>
      {/* Top header bar */}
      <div className="sticky top-0 z-50 flex items-center justify-center border-b bg-background/95 px-4 py-2.5 backdrop-blur-sm">
        <div className="flex items-center gap-2">
          <LemonLogo className="h-6 w-6" />
          <span className="text-sm font-bold tracking-tight">My Lemon Kitchen</span>
        </div>
      </div>

      {/* Bottom tab bar */}
      <nav className="fixed inset-x-0 bottom-0 z-50 border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-sm">
        <div className="flex items-stretch justify-around">
          {tabs.map((tab) => (
            <Link
              key={tab.href}
              href={tab.href}
              className={cn(
                "flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] font-medium transition-colors",
                isActive(tab.href)
                  ? "text-primary"
                  : "text-muted-foreground"
              )}
            >
              <tab.icon className="h-5 w-5" />
              {tab.label}
            </Link>
          ))}
          <button
            onClick={() => setMoreOpen(true)}
            className={cn(
              "flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] font-medium transition-colors",
              moreOpen ? "text-primary" : "text-muted-foreground"
            )}
          >
            <MoreHorizontal className="h-5 w-5" />
            More
          </button>
        </div>
      </nav>

      {/* More sheet */}
      {moreOpen && (
        <>
          <div
            className="fixed inset-0 z-[60] bg-black/30 backdrop-blur-sm"
            onClick={() => setMoreOpen(false)}
          />
          <div className="fixed inset-x-0 bottom-0 z-[70] rounded-t-2xl border-t bg-background pb-[env(safe-area-inset-bottom)] shadow-xl">
            <div className="flex items-center justify-between px-5 py-4">
              <span className="text-sm font-semibold">More</span>
              <button
                onClick={() => setMoreOpen(false)}
                className="rounded-full p-1 text-muted-foreground hover:bg-muted"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="px-3 pb-3">
              {secondary.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMoreOpen(false)}
                  className={cn(
                    "flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition-colors",
                    isActive(item.href)
                      ? "bg-primary/10 text-primary"
                      : "text-foreground hover:bg-muted"
                  )}
                >
                  <item.icon className="h-5 w-5" />
                  {item.label}
                </Link>
              ))}
              {session?.user && ((session.user as { systemRole?: string }).systemRole === "ADMIN" || (session.user as { systemRole?: string }).systemRole === "CONTRIBUTOR") && (
                <Link
                  href="/admin"
                  onClick={() => setMoreOpen(false)}
                  className={cn(
                    "flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition-colors",
                    isActive("/admin")
                      ? "bg-primary/10 text-primary"
                      : "text-foreground hover:bg-muted"
                  )}
                >
                  <Shield className="h-5 w-5" />
                  Admin
                </Link>
              )}
            </div>

            {session?.user && (
              <div className="border-t px-3 py-3">
                <div className="px-4 py-2">
                  <p className="text-sm font-medium">{session.user.name}</p>
                  <p className="text-xs text-muted-foreground">{session.user.email}</p>
                </div>
                <button
                  onClick={() => signOut({ callbackUrl: "/login" })}
                  className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  <LogOut className="h-5 w-5" />
                  Sign Out
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </>
  );
}
