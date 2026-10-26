import { SignJWT, importPKCS8 } from "jose";

// Google and Apple sign-in settings, read from the environment. Each provider
// is only offered when its keys are present, so a deploy without them behaves
// exactly as before. Nothing here touches the database, so the verify script
// can exercise it offline.

export type OAuthProviderId = "google" | "apple";

type Env = Record<string, string | undefined>;

export interface GoogleConfig {
  clientId: string;
  clientSecret: string;
}

export interface AppleKeyConfig {
  teamId: string;
  keyId: string;
  privateKey: string; // PEM (PKCS#8), as downloaded from Apple
}

export interface AppleConfig {
  clientId: string; // the Services ID
  clientSecret?: string; // a ready-made client secret JWT
  key?: AppleKeyConfig; // or the key to sign one at runtime
}

export interface OAuthConfig {
  google?: GoogleConfig;
  apple?: AppleConfig;
}

function read(env: Env, name: string): string | undefined {
  const v = env[name]?.trim();
  return v ? v : undefined;
}

// Env files often hold a PEM on one line with literal "\n" escapes.
export function normalizePem(raw: string): string {
  return raw.replace(/\\n/g, "\n").trim();
}

export function readOAuthConfig(env: Env = process.env): OAuthConfig {
  const config: OAuthConfig = {};

  const googleId = read(env, "AUTH_GOOGLE_ID");
  const googleSecret = read(env, "AUTH_GOOGLE_SECRET");
  if (googleId && googleSecret) config.google = { clientId: googleId, clientSecret: googleSecret };

  const appleId = read(env, "AUTH_APPLE_ID");
  if (appleId) {
    const appleSecret = read(env, "AUTH_APPLE_SECRET");
    const teamId = read(env, "AUTH_APPLE_TEAM_ID");
    const keyId = read(env, "AUTH_APPLE_KEY_ID");
    const privateKey = read(env, "AUTH_APPLE_PRIVATE_KEY");
    // A pre-made secret wins; otherwise all three key settings are needed.
    if (appleSecret) {
      config.apple = { clientId: appleId, clientSecret: appleSecret };
    } else if (teamId && keyId && privateKey) {
      config.apple = { clientId: appleId, key: { teamId, keyId, privateKey: normalizePem(privateKey) } };
    }
  }

  return config;
}

// Provider ids to show buttons for, in display order.
export function enabledOAuthProviders(env: Env = process.env): OAuthProviderId[] {
  const config = readOAuthConfig(env);
  const ids: OAuthProviderId[] = [];
  if (config.google) ids.push("google");
  if (config.apple) ids.push("apple");
  return ids;
}

// ─── Apple client secret ────────────────────────────────────────

export const APPLE_AUDIENCE = "https://appleid.apple.com";
// Apple accepts up to six months. An hour keeps a leaked secret short-lived and
// costs one cheap signature per hour.
export const APPLE_SECRET_TTL_SECONDS = 60 * 60;
// Sign a fresh one when the cached secret has less than this left.
const APPLE_SECRET_REFRESH_SECONDS = 10 * 60;

// Sign the ES256 client secret JWT Apple expects in place of a static secret.
export async function signAppleClientSecret(
  clientId: string,
  key: AppleKeyConfig,
  nowSeconds = Math.floor(Date.now() / 1000),
  ttlSeconds = APPLE_SECRET_TTL_SECONDS
): Promise<string> {
  const privateKey = await importPKCS8(key.privateKey, "ES256");
  return new SignJWT({})
    .setProtectedHeader({ alg: "ES256", kid: key.keyId })
    .setIssuer(key.teamId)
    .setSubject(clientId)
    .setAudience(APPLE_AUDIENCE)
    .setIssuedAt(nowSeconds)
    .setExpirationTime(nowSeconds + ttlSeconds)
    .sign(privateKey);
}

let appleSecretCache: { cacheKey: string; secret: string; expiresAt: number } | null = null;

// The client secret to send Apple: the configured one, or a signed one reused
// until it nears expiry.
export async function appleClientSecret(
  apple: AppleConfig,
  nowSeconds = Math.floor(Date.now() / 1000)
): Promise<string> {
  if (apple.clientSecret) return apple.clientSecret;
  if (!apple.key) throw new Error("Apple sign-in needs AUTH_APPLE_SECRET or a signing key");

  const cacheKey = `${apple.clientId}:${apple.key.teamId}:${apple.key.keyId}`;
  if (
    appleSecretCache &&
    appleSecretCache.cacheKey === cacheKey &&
    appleSecretCache.expiresAt - nowSeconds > APPLE_SECRET_REFRESH_SECONDS
  ) {
    return appleSecretCache.secret;
  }
  const secret = await signAppleClientSecret(apple.clientId, apple.key, nowSeconds);
  appleSecretCache = { cacheKey, secret, expiresAt: nowSeconds + APPLE_SECRET_TTL_SECONDS };
  return secret;
}

// ─── Profiles ───────────────────────────────────────────────────

export function isOAuthProvider(id: string | undefined): id is OAuthProviderId {
  return id === "google" || id === "apple";
}

export function providerLabel(id: OAuthProviderId): string {
  return id === "google" ? "Google" : "Apple";
}

// Only trust an email the provider itself has verified. Google sends a
// boolean; Apple has sent both a boolean and the string "true".
export function isProviderEmailVerified(provider: OAuthProviderId, profile: Record<string, unknown>): boolean {
  const v = profile.email_verified;
  if (provider === "google") return v === true;
  return v === true || v === "true";
}

// Display name for a new account. Apple only sends the name on the very first
// authorization (Auth.js puts it on profile.user), so fall back to the part of
// the email before the @.
export function profileName(provider: OAuthProviderId, profile: Record<string, unknown>, email: string): string {
  let name = "";
  if (provider === "google") {
    name = typeof profile.name === "string" ? profile.name : "";
  } else {
    const user = profile.user as { name?: { firstName?: unknown; lastName?: unknown } } | undefined;
    const first = typeof user?.name?.firstName === "string" ? user.name.firstName : "";
    const last = typeof user?.name?.lastName === "string" ? user.name.lastName : "";
    name = `${first} ${last}`;
  }
  name = name.replace(/\s+/g, " ").trim();
  if (!name) name = email.split("@")[0] || "Cook";
  return name.slice(0, 200);
}

// ─── Linking ────────────────────────────────────────────────────

export interface LinkLookups {
  // User id already linked to this provider identity, if any.
  findLinkedUserId(provider: OAuthProviderId, providerAccountId: string): Promise<number | null>;
  // User with this normalized email, if any.
  findUserByEmail(email: string): Promise<{ id: number; emailVerifiedAt: Date | null } | null>;
}

export type LinkDecision =
  | { kind: "signin"; userId: number } // already linked
  | { kind: "link"; userId: number; markEmailVerified: boolean } // existing user, first time with this provider
  | { kind: "create" }; // no account yet

// Who an OAuth sign-in belongs to. The provider identity wins over the email,
// so an Apple relay address or a changed Google email still finds the same
// user. The email must already be normalized and provider-verified.
export async function decideOAuthLink(
  input: { provider: OAuthProviderId; providerAccountId: string; email: string },
  lookups: LinkLookups
): Promise<LinkDecision> {
  const linked = await lookups.findLinkedUserId(input.provider, input.providerAccountId);
  if (linked !== null) return { kind: "signin", userId: linked };

  const existing = await lookups.findUserByEmail(input.email);
  if (existing) return { kind: "link", userId: existing.id, markEmailVerified: existing.emailVerifiedAt === null };

  return { kind: "create" };
}
