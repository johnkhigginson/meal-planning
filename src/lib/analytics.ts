// Lightweight client-side event tracking for Google Analytics. No-ops on the
// server or before gtag has loaded.
export function trackEvent(name: string, params?: Record<string, unknown>): void {
  if (typeof window !== "undefined" && typeof window.gtag === "function") {
    window.gtag("event", name, params ?? {});
  }
}
