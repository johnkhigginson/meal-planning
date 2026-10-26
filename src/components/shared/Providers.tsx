"use client";

import dynamic from "next/dynamic";
import { SessionProvider } from "next-auth/react";

// Toasts only follow a user action, so the toaster (and sonner) can load after
// the page is interactive instead of in every page's first-load bundle.
const Toaster = dynamic(() => import("@/components/ui/sonner").then((m) => m.Toaster), { ssr: false });

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      {children}
      <Toaster />
    </SessionProvider>
  );
}
