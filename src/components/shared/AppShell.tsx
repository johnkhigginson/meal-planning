"use client";

import { useSession } from "next-auth/react";
import { usePathname } from "next/navigation";
import { Navbar } from "./Navbar";
import { MobileNav } from "./MobileNav";
import { PageLoader } from "./PageLoader";
import { ImpersonationBanner } from "./ImpersonationBanner";

const authPages = ["/login", "/register"];

export function AppShell({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession();
  const pathname = usePathname();

  const isAuthPage = authPages.includes(pathname);
  const isLandingPage = pathname === "/";
  // The public blog is fully standalone: no app chrome for anyone (including
  // logged-in users), and it must render immediately without the session
  // loading gate (which otherwise swaps the page for a spinner — breaking
  // back-navigation between the recipe list and a recipe).
  const isBlog = pathname === "/blog" || pathname.startsWith("/blog/");

  // Don't show loading spinner on public pages
  if (status === "loading" && !isAuthPage && !isLandingPage && !isBlog) {
    return <PageLoader />;
  }

  const showNav = session && !isAuthPage && !isBlog && !(isLandingPage && !session);

  if (!showNav) {
    return (
      <div className="flex-1">
        {!isBlog && <ImpersonationBanner />}
        {children}
      </div>
    );
  }

  // Phones get the bottom tab bar. From 640px up (a tablet, or a desktop window
  // snapped to half the screen) the side menu shows, as an icon rail until
  // there's room for the full sidebar at 1024px.
  return (
    <>
      <div className="app-nav hidden sm:block">
        <Navbar />
      </div>
      <div className="app-nav sm:hidden">
        <MobileNav />
      </div>
      <main className="min-w-0 flex-1 overflow-auto p-4 pb-28 sm:pb-4 lg:p-6 lg:pb-6">
        <ImpersonationBanner />
        {children}
      </main>
    </>
  );
}
