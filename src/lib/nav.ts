// Nav sections a user may hide from their own menu. Recipes, Cookbooks, the
// Dashboard, Settings, and Admin are always shown. Keyed by href so the Navbar,
// MobileNav, and Settings all agree.

export const OPTIONAL_NAV_ITEMS = [
  { href: "/pantry", label: "Pantry" },
  { href: "/what-can-i-make", label: "What Can I Make?" },
  { href: "/meal-plan", label: "Meal Plan" },
  { href: "/grocery-list", label: "Grocery List" },
  { href: "/stores", label: "Stores" },
] as const;

export function parseHiddenNav(value: string | null | undefined): Set<string> {
  return new Set(
    (value || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
  );
}

// Sign-in, sign-up and password pages. They render without the app chrome and
// skip the service worker, and analytics loads late on them.
export const AUTH_PAGES = ["/login", "/register", "/forgot-password", "/reset-password", "/verify-email"];

export function isAuthPage(pathname: string): boolean {
  return AUTH_PAGES.includes(pathname);
}
