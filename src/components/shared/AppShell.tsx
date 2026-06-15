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

  return (
    <>
      <div className="app-nav hidden lg:block">
        <Navbar />
      </div>
      <div className="app-nav lg:hidden">
        <MobileNav />
      </div>
      <main className="flex-1 overflow-auto p-4 pb-28 lg:p-6 lg:pb-6">
        <ImpersonationBanner />
        {children}
      </main>
    </>
  );
}
