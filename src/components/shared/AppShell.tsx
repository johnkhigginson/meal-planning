"use client";

import { useEffect } from "react";
import dynamic from "next/dynamic";
import { useSession } from "next-auth/react";
import { usePathname } from "next/navigation";
import { PageLoader } from "./PageLoader";
import { isAuthPage } from "@/lib/nav";

// The app chrome loads in its own chunks, so pages that never show it (sign-in,
// sign-up, the landing page, the blog) don't download it. These are rendered
// only after the session loads on the client, so nothing is lost from the
// server HTML.
const loadNavbar = () => import("./Navbar").then((m) => m.Navbar);
const loadMobileNav = () => import("./MobileNav").then((m) => m.MobileNav);
const Navbar = dynamic(loadNavbar);
const MobileNav = dynamic(loadMobileNav);
const ImpersonationBanner = dynamic(() => import("./ImpersonationBanner").then((m) => m.ImpersonationBanner));
const EmailVerificationBanner = dynamic(() =>
  import("./EmailVerificationBanner").then((m) => m.EmailVerificationBanner)
);

const publicPages = ["/privacy", "/terms", "/contact"];

export function AppShell({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession();
  const pathname = usePathname();

  const onAuthPage = isAuthPage(pathname);
  const isLandingPage = pathname === "/";
  // The public blog is fully standalone: no app chrome for anyone (including
  // logged-in users), and it must render immediately without the session
  // loading gate (which otherwise swaps the page for a spinner — breaking
  // back-navigation between the recipe list and a recipe).
  const isBlog = pathname === "/blog" || pathname.startsWith("/blog/");
  // Legal and contact pages bring their own public chrome, like the blog.
  const isPublicPage = publicPages.includes(pathname);
  const isStandalone = isBlog || isPublicPage;

  // On app pages, fetch the nav chunks while the session is still loading
  // instead of after it.
  const wantsNav = !onAuthPage && !isStandalone;
  useEffect(() => {
    if (wantsNav) {
      loadNavbar();
      loadMobileNav();
    }
  }, [wantsNav]);

  // Don't show loading spinner on public pages
  if (status === "loading" && !onAuthPage && !isLandingPage && !isStandalone) {
    return <PageLoader />;
  }

  const showNav = session && wantsNav && !(isLandingPage && !session);

  if (!showNav) {
    return (
      <div className="flex-1">
        {!isStandalone && <ImpersonationBanner />}
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
        <EmailVerificationBanner />
        {children}
      </main>
    </>
  );
}
