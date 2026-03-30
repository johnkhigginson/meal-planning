"use client";

import { useSession } from "next-auth/react";
import { usePathname } from "next/navigation";
import { Navbar } from "./Navbar";

const authPages = ["/login", "/register"];

export function AppShell({ children }: { children: React.ReactNode }) {
  const { data: session } = useSession();
  const pathname = usePathname();

  // Don't show sidebar on auth pages or landing page when not logged in
  const isAuthPage = authPages.includes(pathname);
  const isLandingPage = pathname === "/" && !session;
  const showSidebar = session && !isAuthPage && !isLandingPage;

  if (!showSidebar) {
    return <div className="flex-1">{children}</div>;
  }

  return (
    <>
      <Navbar />
      <main className="flex-1 overflow-auto p-6">{children}</main>
    </>
  );
}
