import dns from "node:dns/promises";
import net from "node:net";

// Guards server-side fetches of user/admin-supplied URLs against SSRF: only
// http/https, and the resolved address must not be private/loopback/link-local.
// Redirects are followed manually so each hop is re-validated.
//
// Note: this resolves DNS then fetches, so a determined DNS-rebinding attacker
// has a narrow TOCTOU window. For full protection you'd pin the connection to
// the validated IP via a custom undici dispatcher; this is a strong, simple
// mitigation appropriate for this app.

// Thrown when a URL is rejected before any request is made, so callers can tell
// "that address isn't allowed" apart from a network failure.
export class UnsafeUrlError extends Error {
  name = "UnsafeUrlError";
}

function ipIsPrivate(ip: string): boolean {
  const fam = net.isIP(ip);
  if (fam === 4) {
    const p = ip.split(".").map(Number);
    if (p.some((n) => Number.isNaN(n))) return true;
    if (p[0] === 0 || p[0] === 10 || p[0] === 127) return true;
    if (p[0] === 169 && p[1] === 254) return true; // link-local / cloud metadata
    if (p[0] === 172 && p[1] >= 16 && p[1] <= 31) return true;
    if (p[0] === 192 && p[1] === 168) return true;
    if (p[0] === 100 && p[1] >= 64 && p[1] <= 127) return true; // CGNAT
    return false;
  }
  if (fam === 6) {
    const lower = ip.toLowerCase().replace(/%.*$/, ""); // strip zone id
    if (lower === "::1" || lower === "::") return true;
    if (lower.startsWith("fe80")) return true; // link-local
    if (lower.startsWith("fc") || lower.startsWith("fd")) return true; // unique-local
    const mapped = lower.match(/::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
    if (mapped) return ipIsPrivate(mapped[1]);
    return false;
  }
  return true; // not a valid IP → treat as unsafe
}

async function assertPublicHost(hostname: string): Promise<void> {
  const host = hostname.replace(/^\[|\]$/g, ""); // strip IPv6 brackets
  if (net.isIP(host)) {
    if (ipIsPrivate(host)) throw new UnsafeUrlError("Blocked request to a private address");
    return;
  }
  const addrs = await dns.lookup(host, { all: true });
  if (addrs.length === 0) throw new UnsafeUrlError("Host did not resolve");
  for (const a of addrs) {
    if (ipIsPrivate(a.address)) throw new UnsafeUrlError("Blocked request to a private address");
  }
}

function raceSignal<T>(promise: Promise<T>, signal: AbortSignal | null | undefined): Promise<T> {
  if (!signal) return promise;
  signal.throwIfAborted();
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(signal.reason);
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(resolve, reject).finally(() => signal.removeEventListener("abort", onAbort));
  });
}

export async function safeFetch(
  rawUrl: string,
  init: RequestInit = {},
  maxRedirects = 3
): Promise<Response> {
  let current = rawUrl;
  for (let i = 0; i <= maxRedirects; i++) {
    let u: URL;
    try {
      u = new URL(current);
    } catch {
      throw new UnsafeUrlError("Invalid URL");
    }
    if (u.protocol !== "http:" && u.protocol !== "https:") {
      throw new UnsafeUrlError("Only http and https URLs are allowed");
    }
    // The DNS lookup isn't abortable, so race it against the caller's signal.
    // Otherwise a slow resolver runs past the caller's timeout.
    await raceSignal(assertPublicHost(u.hostname), init.signal);

    const res = await fetch(current, { ...init, redirect: "manual" });
    const location = res.status >= 300 && res.status < 400 ? res.headers.get("location") : null;
    if (!location) return res;
    await res.body?.cancel();
    current = new URL(location, current).toString();
  }
  throw new Error("Too many redirects");
}
