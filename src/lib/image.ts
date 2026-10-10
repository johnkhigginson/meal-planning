// Hosts the next/image optimizer may fetch. Keep in sync with
// images.remotePatterns in next.config.ts.
const OPTIMIZABLE_HOST = /^(blogger\.googleusercontent\.com|[a-z0-9-]+\.bp\.blogspot\.com)$/i;

// Whether a recipe photo can go through the next/image optimizer. Uploads are
// served from /api/images/*, which checks the viewer's session, and the
// optimizer fetches without cookies, so private photos would 404. Scraped
// photos can come from any site, so only known hosts are optimized; everything
// else is passed through to the browser untouched.
export function canOptimizeImage(src: string): boolean {
  try {
    const url = new URL(src);
    return url.protocol === "https:" && !url.search && OPTIMIZABLE_HOST.test(url.hostname);
  } catch {
    return false;
  }
}
