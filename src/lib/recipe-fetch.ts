import * as cheerio from "cheerio";
import { safeFetch, UnsafeUrlError } from "@/lib/ssrf";
import { getSiteUrl } from "@/lib/site";
import {
  extractFallback,
  extractStructuredRecipe,
  type ScrapedRecipe,
} from "@/lib/recipe-scrape";

// Fetches a recipe page and reads the recipe off it, working around the bot
// protection most big recipe sites run. Each request goes through safeFetch, so
// every hop is still checked against private addresses.
//
// What we learned testing against Cloudflare-fronted sites (Allrecipes, Serious
// Eats, Budget Bytes): they compare the User-Agent with the TLS fingerprint.
// Node's TLS handshake doesn't look like Chrome, so a Chrome User-Agent gets a
// 402/403 challenge, while an honest bot User-Agent is sometimes let through.
// So we try a browser profile first (it works on sites that only check
// headers), then mobile Safari, then the bot profile. We don't go further than
// that: a site that still refuses has decided not to serve servers, and the
// user gets told how to import the recipe another way.

export type ScrapeErrorCode = "INVALID_URL" | "NOT_FOUND" | "BLOCKED" | "TIMEOUT" | "NO_RECIPE" | "FETCH_FAILED";

export class RecipeScrapeError extends Error {
  name = "RecipeScrapeError";
  constructor(
    public code: ScrapeErrorCode,
    message: string
  ) {
    super(message);
  }
}

const ATTEMPT_TIMEOUT_MS = 8_000;
const TOTAL_BUDGET_MS = 15_000;
const MAX_BODY_BYTES = 5 * 1024 * 1024;

// Bump these now and then. A User-Agent far behind current Chrome is itself a
// bot signal.
const CHROME_MAJOR = "153";

type HeaderProfile = { name: string; headers: Record<string, string> };

// Node's fetch decodes gzip, deflate and br on its own. It doesn't decode zstd
// on Node 20, so we don't advertise it.
const ACCEPT_ENCODING = "gzip, deflate, br";

const CHROME_DESKTOP: HeaderProfile = {
  name: "chrome",
  headers: {
    "User-Agent": `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${CHROME_MAJOR}.0.0.0 Safari/537.36`,
    Accept:
      "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
    "Accept-Language": "en-US,en;q=0.9",
    "Accept-Encoding": ACCEPT_ENCODING,
    "sec-ch-ua": `"Chromium";v="${CHROME_MAJOR}", "Google Chrome";v="${CHROME_MAJOR}", "Not_A Brand";v="99"`,
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": '"Windows"',
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "none",
    "Sec-Fetch-User": "?1",
    "Upgrade-Insecure-Requests": "1",
  },
};

const SAFARI_MOBILE: HeaderProfile = {
  name: "safari-mobile",
  headers: {
    "User-Agent":
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1",
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Accept-Encoding": ACCEPT_ENCODING,
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "none",
  },
};

const BOT: HeaderProfile = {
  name: "bot",
  headers: {
    "User-Agent": `Mozilla/5.0 (compatible; MyLemonKitchenBot/1.0; +${getSiteUrl()})`,
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Accept-Encoding": ACCEPT_ENCODING,
  },
};

// The bot profile goes twice on the main page: Cloudflare sometimes challenges
// one bot request and passes the next, and a retry costs about 100ms.
const PAGE_PROFILES = [CHROME_DESKTOP, SAFARI_MOBILE, BOT];
const PAGE_PROFILES_WITH_RETRY = [...PAGE_PROFILES, BOT];
// Guessed endpoints get one plain request each, so a site that is already
// refusing us doesn't get a burst of retries.
const API_PROFILES = [BOT];

type Attempt =
  | { kind: "ok"; body: string; url: string }
  | { kind: "not-found" }
  | { kind: "blocked"; status: number }
  | { kind: "timeout" }
  | { kind: "failed"; message: string };

// Challenge and captcha pages some services send with a 200.
const CHALLENGE_MARKERS =
  /<title>\s*(?:just a moment|attention required|access denied|pardon our interruption)|_cf_chl_opt|cf-browser-verification|px-captcha|captcha-delivery\.com/i;

class BudgetSpent extends Error {}

class Deadline {
  private readonly end = Date.now() + TOTAL_BUDGET_MS;
  remaining() {
    return this.end - Date.now();
  }
  // A signal for one attempt: the per-attempt cap or what's left overall,
  // whichever comes first.
  signal() {
    const ms = Math.min(ATTEMPT_TIMEOUT_MS, this.remaining());
    if (ms < 500) throw new BudgetSpent();
    return AbortSignal.timeout(ms);
  }
}

async function readCapped(res: Response): Promise<string> {
  if (!res.body) return "";
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BODY_BYTES) {
      await reader.cancel();
      break;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}

function isTimeout(err: unknown): boolean {
  return err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError");
}

async function attempt(url: string, profile: HeaderProfile, deadline: Deadline, accept?: string): Promise<Attempt> {
  const headers = accept ? { ...profile.headers, Accept: accept } : profile.headers;
  try {
    const res = await safeFetch(url, { headers, signal: deadline.signal() });
    if (res.status === 404 || res.status === 410) {
      await res.body?.cancel();
      return { kind: "not-found" };
    }
    if (res.headers.get("cf-mitigated") || [401, 402, 403, 429, 503].includes(res.status)) {
      await res.body?.cancel();
      return { kind: "blocked", status: res.status };
    }
    if (!res.ok) {
      await res.body?.cancel();
      return { kind: "failed", message: `The site answered with status ${res.status}.` };
    }
    const body = await readCapped(res);
    if (body.length < 100_000 && CHALLENGE_MARKERS.test(body)) return { kind: "blocked", status: res.status };
    return { kind: "ok", body, url: res.url || url };
  } catch (err) {
    if (err instanceof UnsafeUrlError || err instanceof BudgetSpent) throw err;
    if (isTimeout(err)) return { kind: "timeout" };
    const code = (err as { cause?: { code?: string } })?.cause?.code ?? (err as { code?: string })?.code;
    if (code === "ENOTFOUND" || code === "EAI_AGAIN") {
      throw new RecipeScrapeError("INVALID_URL", "We couldn't find that website. Check the address and try again.");
    }
    return { kind: "failed", message: err instanceof Error ? err.message : "Request failed" };
  }
}

// Tries each header profile until one gets a real answer. A 404 is final: no
// header profile will make a missing page appear. So is a timeout: a host that
// sat on one request for 8s will sit on the next, and the user is waiting.
// Blocks and other failures move on to the next profile. Returns the most
// informative failure when nothing worked.
async function fetchWithProfiles(
  url: string,
  deadline: Deadline,
  profiles: HeaderProfile[],
  accept?: string
): Promise<Attempt> {
  // Prefer reporting a block over a generic failure.
  let worst: Extract<Attempt, { kind: "blocked" } | { kind: "failed" }> | null = null;
  for (const profile of profiles) {
    let result: Attempt;
    try {
      result = await attempt(url, profile, deadline, accept);
    } catch (err) {
      if (err instanceof BudgetSpent) break;
      throw err;
    }
    if (result.kind === "ok" || result.kind === "not-found" || result.kind === "timeout") return result;
    if (!worst || result.kind === "blocked") worst = result;
  }
  // Nothing ran at all only when the time budget was already gone.
  return worst ?? { kind: "timeout" };
}

// A heuristic read only counts when it found something to cook from. Every page
// has an h1, including 404s and challenge pages.
function usable(recipe: ScrapedRecipe | null): ScrapedRecipe | null {
  return recipe && recipe.name && (recipe.ingredients.length > 0 || recipe.instructions) ? recipe : null;
}

// AMP and print copies of the page, as the page itself links them. They tend
// to carry the same structured data with less script, and are sometimes
// exempt from bot rules.
function linkedAlternates(html: string, base: string): string[] {
  const $ = cheerio.load(html);
  const hrefs = [
    $('link[rel="amphtml"]').attr("href"),
    $("a.wprm-recipe-print").attr("href"),
    $("a.tasty-recipes-print-button, a.tasty-recipes-print-link").attr("href"),
    $("a.mv-create-print-button").attr("href"),
  ];
  return resolveAll(hrefs, base);
}

function resolveAll(hrefs: (string | undefined)[], base: string): string[] {
  const urls = new Set<string>();
  for (const href of hrefs) {
    if (!href) continue;
    try {
      urls.add(new URL(href, base).toString());
    } catch {
      // ignore malformed links
    }
  }
  return [...urls];
}

async function fromAlternatePage(
  url: string,
  deadline: Deadline,
  profiles = PAGE_PROFILES
): Promise<ScrapedRecipe | null> {
  const result = await fetchWithProfiles(url, deadline, profiles);
  return result.kind === "ok" ? extractStructuredRecipe(result.body) : null;
}

// WordPress sites usually leave the REST API open even when the page itself is
// behind a challenge. The post's rendered content carries the recipe card
// (WP Recipe Maker, Tasty, Mediavine), and yoast_head carries any JSON-LD.
async function fromWordPressApi(pageUrl: URL, deadline: Deadline): Promise<ScrapedRecipe | null> {
  const slug = pageUrl.pathname.split("/").filter(Boolean).pop();
  if (!slug) return null;
  const api = new URL("/wp-json/wp/v2/posts", pageUrl.origin);
  api.searchParams.set("slug", slug);
  api.searchParams.set("_fields", "title,content,yoast_head");

  const result = await fetchWithProfiles(api.toString(), deadline, API_PROFILES, "application/json");
  if (result.kind !== "ok") return null;
  try {
    const posts = JSON.parse(result.body) as {
      title?: { rendered?: string };
      content?: { rendered?: string };
      yoast_head?: string;
    }[];
    const post = Array.isArray(posts) ? posts[0] : null;
    if (!post?.content?.rendered) return null;
    const html = `<html><head>${post.yoast_head ?? ""}</head><body><h1>${post.title?.rendered ?? ""}</h1>${post.content.rendered}</body></html>`;
    const recipe = extractStructuredRecipe(html) ?? usable(extractFallback(html));
    // A REST copy is only worth using if it has both halves of the recipe.
    return recipe && recipe.ingredients.length > 0 && recipe.instructions ? recipe : null;
  } catch {
    return null;
  }
}

// Squarespace serves any page as JSON with ?format=json, with the post body
// as HTML.
async function fromSquarespaceJson(pageUrl: URL, deadline: Deadline): Promise<ScrapedRecipe | null> {
  const api = new URL(pageUrl);
  api.searchParams.set("format", "json");
  const result = await fetchWithProfiles(api.toString(), deadline, API_PROFILES, "application/json");
  if (result.kind !== "ok") return null;
  try {
    const data = JSON.parse(result.body) as { item?: { title?: string; body?: string } };
    if (!data.item?.body) return null;
    const html = `<html><body><h1>${data.item.title ?? ""}</h1>${data.item.body}</body></html>`;
    return extractStructuredRecipe(html) ?? usable(extractFallback(html));
  } catch {
    return null;
  }
}

// When the page itself is blocked we can't read its links, so guess the
// alternates that need no link: the WordPress API, an AMP copy, and the
// Squarespace JSON view.
async function fromGuessedAlternates(pageUrl: URL, deadline: Deadline): Promise<ScrapedRecipe | null> {
  const wordpress = await fromWordPressApi(pageUrl, deadline);
  if (wordpress) return wordpress;

  const amp = new URL(pageUrl);
  amp.pathname = amp.pathname.replace(/\/?$/, "/amp/");
  if (deadline.remaining() > 1_000) {
    const recipe = await fromAlternatePage(amp.toString(), deadline, API_PROFILES);
    if (recipe) return recipe;
  }

  if (deadline.remaining() > 1_000) return fromSquarespaceJson(pageUrl, deadline);
  return null;
}

// Microdata and some JSON-LD give the image as a relative path.
function absoluteImage(imageUrl: string | null, base: URL): string | null {
  if (!imageUrl) return null;
  try {
    return new URL(imageUrl, base).toString();
  } catch {
    return null;
  }
}

async function findRecipe(pageUrl: URL, deadline: Deadline): Promise<ScrapedRecipe> {
  const page = await fetchWithProfiles(pageUrl.toString(), deadline, PAGE_PROFILES_WITH_RETRY);

  if (page.kind === "not-found") {
    throw new RecipeScrapeError(
      "NOT_FOUND",
      "That page doesn't exist on the site (404). The recipe may have moved. Open the link in your browser and copy the current URL."
    );
  }

  if (page.kind === "ok") {
    const structured = extractStructuredRecipe(page.body);
    if (structured) return structured;

    for (const alt of linkedAlternates(page.body, page.url)) {
      if (deadline.remaining() < 1_000) break;
      const recipe = await fromAlternatePage(alt, deadline);
      if (recipe) return recipe;
    }
    if (deadline.remaining() > 1_000) {
      const wordpress = await fromWordPressApi(new URL(page.url), deadline);
      if (wordpress) return wordpress;
    }

    const heuristic = usable(extractFallback(page.body));
    if (heuristic) return heuristic;
    throw new RecipeScrapeError("NO_RECIPE", "We opened the page but couldn't find a recipe on it.");
  }

  if (page.kind === "timeout") {
    throw new RecipeScrapeError("TIMEOUT", `${pageUrl.hostname} took too long to respond.`);
  }

  const alternate = await fromGuessedAlternates(pageUrl, deadline);
  if (alternate) return alternate;

  if (page.kind === "blocked") {
    throw new RecipeScrapeError(
      "BLOCKED",
      `${pageUrl.hostname} blocked our request (status ${page.status}). Some sites block imports from servers.`
    );
  }
  throw new RecipeScrapeError("FETCH_FAILED", `We couldn't load that page. ${page.message}`);
}

export async function scrapeRecipeUrl(rawUrl: string): Promise<ScrapedRecipe> {
  let pageUrl: URL;
  try {
    pageUrl = new URL(rawUrl.trim());
  } catch {
    throw new RecipeScrapeError("INVALID_URL", "That doesn't look like a web address. Check the URL and try again.");
  }
  if (pageUrl.protocol !== "http:" && pageUrl.protocol !== "https:") {
    throw new RecipeScrapeError("INVALID_URL", "Only http and https links can be imported.");
  }

  try {
    const recipe = await findRecipe(pageUrl, new Deadline());
    return { ...recipe, imageUrl: absoluteImage(recipe.imageUrl, pageUrl) };
  } catch (err) {
    if (err instanceof UnsafeUrlError) {
      throw new RecipeScrapeError("INVALID_URL", "That address can't be imported. Use a public recipe website link.");
    }
    throw err;
  }
}
