import type { MetadataRoute } from "next";
import { getSiteUrl } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  const site = getSiteUrl();
  return {
    rules: {
      userAgent: "*",
      // Published recipe photos are served from /api/images. Google needs to
      // fetch them for recipe rich results, so they are allowed past /api.
      allow: ["/", "/blog", "/help", "/privacy", "/terms", "/contact", "/api/images/"],
      // Private/app areas (auth-gated anyway): keep them out of search results.
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
        "/invite",
      ],
    },
    sitemap: `${site}/sitemap.xml`,
  };
}
