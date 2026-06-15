"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";

declare global {
  interface Window {
    turnstile?: {
      render: (
        el: HTMLElement,
        opts: {
          sitekey: string;
          callback?: (token: string) => void;
          "error-callback"?: () => void;
          "expired-callback"?: () => void;
          theme?: "light" | "dark" | "auto";
        }
      ) => string;
      reset: (widgetId?: string) => void;
      remove: (widgetId?: string) => void;
    };
  }
}

const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
export const turnstileEnabled = Boolean(SITE_KEY);

export interface TurnstileHandle {
  reset: () => void;
}

// Reusable Cloudflare Turnstile widget. Renders nothing when no site key is
// configured (Turnstile disabled). Reports the token via onToken and exposes an
// imperative reset (tokens are single-use).
export const TurnstileWidget = forwardRef<TurnstileHandle, { onToken: (token: string) => void }>(
  function TurnstileWidget({ onToken }, ref) {
    const containerRef = useRef<HTMLDivElement>(null);
    const widgetIdRef = useRef<string | null>(null);

    useImperativeHandle(ref, () => ({
      reset() {
        if (widgetIdRef.current !== null && window.turnstile) {
          window.turnstile.reset(widgetIdRef.current);
        }
        onToken("");
      },
    }));

    useEffect(() => {
      if (!SITE_KEY) return;
      let cancelled = false;

      const renderWidget = () => {
        if (cancelled || !window.turnstile || !containerRef.current) return;
        if (widgetIdRef.current !== null) return;
        widgetIdRef.current = window.turnstile.render(containerRef.current, {
          sitekey: SITE_KEY,
          callback: (t) => onToken(t),
          "error-callback": () => onToken(""),
          "expired-callback": () => onToken(""),
          theme: "auto",
        });
      };

      if (window.turnstile) {
        renderWidget();
      } else {
        const SCRIPT_ID = "cf-turnstile-script";
        let script = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null;
        if (!script) {
          script = document.createElement("script");
          script.id = SCRIPT_ID;
          script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
          script.async = true;
          script.defer = true;
          document.head.appendChild(script);
        }
        script.addEventListener("load", renderWidget);
      }

      return () => {
        cancelled = true;
        if (widgetIdRef.current !== null && window.turnstile) {
          try {
            window.turnstile.remove(widgetIdRef.current);
          } catch {
            // already removed
          }
          widgetIdRef.current = null;
        }
      };
      // onToken is stable from the parent (defined with useCallback or inline);
      // re-running this effect would double-render the widget.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    if (!SITE_KEY) return null;
    return <div ref={containerRef} className="flex" />;
  }
);
