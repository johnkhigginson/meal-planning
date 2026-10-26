// Canonical public base URL for absolute links in SEO output (sitemap, RSS,
// Open Graph, JSON-LD). Override with NEXT_PUBLIC_SITE_URL if the domain
// changes.
export function getSiteUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL || "https://mylemonkitchen.com").replace(/\/$/, "");
}

export const SITE_NAME = "My Lemon Kitchen";
export const SITE_DESCRIPTION = "Plan meals, track your pantry, and generate smart grocery lists";

// Make an app-relative URL (e.g. an uploaded image at /api/images/1) absolute.
export function absoluteUrl(path: string | null | undefined): string | undefined {
  if (!path) return undefined;
  if (/^https?:\/\//i.test(path)) return path;
  return `${getSiteUrl()}${path.startsWith("/") ? "" : "/"}${path}`;
}

// Public support address from NEXT_PUBLIC_SUPPORT_EMAIL. Undefined when unset
// or not a plausible address, so pages can leave the email out instead of
// showing a fake one.
function readSupportEmail(): string | undefined {
  const email = process.env.NEXT_PUBLIC_SUPPORT_EMAIL?.trim();
  if (!email || !email.includes("@") || /\s/.test(email)) return undefined;
  return email;
}

export const SUPPORT_EMAIL: string | undefined = readSupportEmail();

// Shown as "Last updated" on the privacy, terms and contact pages. Bump it
// whenever the legal text changes.
export const LEGAL_LAST_UPDATED = "October 25, 2026";
