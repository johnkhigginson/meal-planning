import sanitizeHtml from "sanitize-html";

// Sanitizer for migrated blog post HTML before it is rendered with
// dangerouslySetInnerHTML on the PUBLIC blog. Blogger content is third-party
// HTML, so we strip scripts, event handlers, and unsafe URL schemes while
// keeping the formatting + images a recipe post needs.
const OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [
    ...sanitizeHtml.defaults.allowedTags,
    "img",
    "h1",
    "h2",
    "figure",
    "figcaption",
  ],
  allowedAttributes: {
    a: ["href", "name", "target", "rel"],
    img: ["src", "alt", "title", "width", "height"],
    "*": ["class"],
  },
  // Only safe link/image schemes; drops javascript:, vbscript:, etc.
  allowedSchemes: ["http", "https", "mailto"],
  allowedSchemesByTag: { img: ["http", "https", "data"] },
  // Force external links to open safely.
  transformTags: {
    a: sanitizeHtml.simpleTransform("a", { rel: "noopener noreferrer nofollow" }),
  },
};

export function sanitizeBlogHtml(html: string | null | undefined): string {
  if (!html) return "";
  return sanitizeHtml(html, OPTIONS);
}
