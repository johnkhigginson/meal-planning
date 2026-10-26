"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { isAuthPage } from "@/lib/nav";

// Sign-in and sign-up pages skip registration: on a first visit the worker's
// download and precache would compete with the form for a slow mobile
// connection. It registers on the first app page instead.
export function ServiceWorkerRegistrar() {
  const pathname = usePathname();
  const skip = isAuthPage(pathname);

  useEffect(() => {
    if (skip || !("serviceWorker" in navigator)) return;
    // Always check the network for a new sw.js, so a cache fix ships on the
    // next visit.
    navigator.serviceWorker.register("/sw.js", { updateViaCache: "none" }).catch(() => {});
  }, [skip]);

  return null;
}
