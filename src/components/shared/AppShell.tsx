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

  // Don't show loading spinner on public pages
  if (status === "loading" && !isAuthPage && !isLandingPage) {
    return <PageLoader />;
  }

  const showNav = session && !isAuthPage && !(isLandingPage && !session);

  if (!showNav) {
    return (
      <div className="flex-1">
        <ImpersonationBanner />
        {children}
      </div>
    );
  }

  return (
    <>
      <div className="hidden lg:block">
        <Navbar />
      </div>
      <div className="lg:hidden">
        <MobileNav />
      </div>
      <main className="flex-1 overflow-auto p-4 pb-28 lg:p-6 lg:pb-6">
        <ImpersonationBanner />
        {children}
      </main>
    </>
  );
}
