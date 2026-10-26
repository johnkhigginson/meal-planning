"use client";

import Script from "next/script";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { isAuthPage } from "@/lib/nav";

const GA_ID = process.env.NEXT_PUBLIC_GA_ID || "G-FF20MCHKLB";

declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    gtag?: (...args: any[]) => void;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    dataLayer?: any[];
  }
}

// Loads Google Analytics (GA4) and sends a page_view on client-side route
// changes (the initial view comes from the gtag config below).
export function Analytics() {
  const pathname = usePathname();
  const first = useRef(true);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    window.gtag?.("event", "page_view", {
      page_path: pathname + window.location.search,
      page_location: window.location.href,
      page_title: document.title,
    });
  }, [pathname]);

  if (!GA_ID) return null;
  // On sign-in and sign-up pages the tag waits until the page has finished
  // loading, so it doesn't compete with the form on a slow phone.
  const strategy = isAuthPage(pathname) ? "lazyOnload" : "afterInteractive";

  return (
    <>
      <Script src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`} strategy={strategy} />
      <Script id="ga-init" strategy={strategy}>
        {`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          window.gtag = gtag;
          gtag('js', new Date());
          gtag('config', '${GA_ID}');
        `}
      </Script>
    </>
  );
}
