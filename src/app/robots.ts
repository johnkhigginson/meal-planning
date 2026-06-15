import type { MetadataRoute } from "next";
import { getSiteUrl } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  const site = getSiteUrl();
  return {
    rules: {
      userAgent: "*",
      allow: ["/", "/blog"],
      // Private/app areas (auth-gated anyway) — keep them out of search results.
      disallow: [
        "/admin",
        "/api",
        "/settings",
        "/recipes",
        "/books",
        "/meal-plan",
        "/pantry",
        "/stores",
        "/grocery-list",
        "/what-can-i-make",
        "/share",
      ],
    },
    sitemap: `${site}/sitemap.xml`,
  };
}
