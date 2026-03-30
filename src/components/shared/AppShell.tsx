"use client";

import { useSession } from "next-auth/react";
import { usePathname } from "next/navigation";
import { Navbar } from "./Navbar";
import { MobileNav } from "./MobileNav";

const authPages = ["/login", "/register"];

export function AppShell({ children }: { children: React.ReactNode }) {
  const { data: session } = useSession();
  const pathname = usePathname();

  const isAuthPage = authPages.includes(pathname);
  const isLandingPage = pathname === "/" && !session;
  const showNav = session && !isAuthPage && !isLandingPage;

  if (!showNav) {
    return <div className="flex-1">{children}</div>;
  }

  return (
    <>
      {/* Desktop sidebar */}
      <div className="hidden lg:block">
        <Navbar />
      </div>
      {/* Mobile top + bottom bars */}
      <div className="lg:hidden">
        <MobileNav />
      </div>
      {/* Content area — bottom padding on mobile for tab bar */}
      <main className="flex-1 overflow-auto p-4 pb-28 lg:p-6 lg:pb-6">{children}</main>
    </>
  );
}
