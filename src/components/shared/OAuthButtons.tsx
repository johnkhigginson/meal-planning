"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import type { OAuthProviderId } from "@/lib/oauth-config";

// "Continue with Google / Apple" buttons for the sign-in and sign-up pages. The
// page decides on the server which providers are configured and passes them
// in, so nothing renders when no keys are set. These flows skip Turnstile; the
// provider has already checked the person.
export function OAuthButtons({
  providers,
  callbackUrl,
}: {
  providers: OAuthProviderId[];
  callbackUrl: string;
}) {
  const [pending, setPending] = useState<OAuthProviderId | null>(null);

  if (providers.length === 0) return null;

  function start(provider: OAuthProviderId) {
    setPending(provider);
    // Full-page redirect to the provider; the page unloads on success.
    signIn(provider, { callbackUrl }).catch(() => setPending(null));
  }

  return (
    <div className="space-y-3">
      {providers.includes("google") && (
        <Button
          type="button"
          size="lg"
          variant="outline"
          className="w-full bg-white text-[#1f1f1f] hover:bg-[#f2f2f2] dark:border-input dark:bg-white dark:text-[#1f1f1f] dark:hover:bg-[#f2f2f2]"
          disabled={pending !== null}
          onClick={() => start("google")}
        >
          {pending === "google" ? <Loader2 className="h-4 w-4 animate-spin" /> : <GoogleLogo />}
          Continue with Google
        </Button>
      )}
      {providers.includes("apple") && (
        <Button
          type="button"
          size="lg"
          className="w-full bg-black text-white hover:bg-black/85 hover:shadow-none dark:bg-white dark:text-black dark:hover:bg-white/85"
          disabled={pending !== null}
          onClick={() => start("apple")}
        >
          {pending === "apple" ? <Loader2 className="h-4 w-4 animate-spin" /> : <AppleLogo />}
          Continue with Apple
        </Button>
      )}
      <div className="flex items-center gap-3 text-xs text-muted-foreground" aria-hidden="true">
        <span className="h-px flex-1 bg-border" />
        or
        <span className="h-px flex-1 bg-border" />
      </div>
    </div>
  );
}

function GoogleLogo() {
  return (
    <svg viewBox="0 0 48 48" className="size-[18px]" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}

function AppleLogo() {
  return (
    <svg viewBox="0 0 814 1000" className="size-[18px]" fill="currentColor" aria-hidden="true">
      <path d="M788.1 340.9c-5.8 4.5-108.2 62.2-108.2 190.5 0 148.4 130.3 200.9 134.2 202.2-.6 3.2-20.7 71.9-68.7 141.9-42.8 61.6-87.5 123.1-155.5 123.1s-85.5-39.5-164-39.5c-76.5 0-103.7 40.8-165.9 40.8s-105.6-57-155.5-127C46.7 790.7 0 663 0 541.8c0-194.4 126.4-297.5 250.8-297.5 66.1 0 121.2 43.4 162.7 43.4 39.5 0 101.1-46 176.3-46 28.5 0 130.9 2.6 198.3 99.2zm-234-181.5c31.1-36.9 53.1-88.1 53.1-139.3 0-7.1-.6-14.3-1.9-20.1-50.6 1.9-110.8 33.7-147.1 75.8-28.5 32.4-55.1 83.6-55.1 135.5 0 7.8 1.3 15.6 1.9 18.1 3.2.6 8.4 1.3 13.6 1.3 45.4 0 102.5-30.4 135.5-71.3z" />
    </svg>
  );
}
