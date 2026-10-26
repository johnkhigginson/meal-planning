// Offline checks for Google/Apple sign-in config and account linking
// (src/lib/oauth-config.ts). No DB or network needed. Uses a throwaway key.
// Run: npx tsx scripts/verify-oauth.ts

import { decodeJwt, decodeProtectedHeader, exportPKCS8, exportSPKI, generateKeyPair, importSPKI, jwtVerify } from "jose";
import {
  APPLE_AUDIENCE,
  APPLE_SECRET_TTL_SECONDS,
  appleClientSecret,
  decideOAuthLink,
  enabledOAuthProviders,
  isProviderEmailVerified,
  profileName,
  readOAuthConfig,
  type LinkLookups,
} from "../src/lib/oauth-config";

let failures = 0;
function eq(label: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) { failures++; console.log(`  ✗ ${label}: got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)}`); }
  else console.log(`  ✓ ${label}`);
}

async function main() {
  console.log("Provider gating:");
  eq("no keys, no providers", enabledOAuthProviders({}), []);
  eq("Google id alone is not enough", enabledOAuthProviders({ AUTH_GOOGLE_ID: "g" }), []);
  eq("blank values count as unset", enabledOAuthProviders({ AUTH_GOOGLE_ID: " ", AUTH_GOOGLE_SECRET: "s" }), []);
  eq("Google with id and secret", enabledOAuthProviders({ AUTH_GOOGLE_ID: "g", AUTH_GOOGLE_SECRET: "s" }), ["google"]);
  eq("Apple id alone is not enough", enabledOAuthProviders({ AUTH_APPLE_ID: "a" }), []);
  eq("Apple with a ready-made secret", enabledOAuthProviders({ AUTH_APPLE_ID: "a", AUTH_APPLE_SECRET: "jwt" }), ["apple"]);
  eq(
    "Apple key setup missing the key id",
    enabledOAuthProviders({ AUTH_APPLE_ID: "a", AUTH_APPLE_TEAM_ID: "T", AUTH_APPLE_PRIVATE_KEY: "k" }),
    []
  );
  eq(
    "Apple key setup complete",
    enabledOAuthProviders({ AUTH_APPLE_ID: "a", AUTH_APPLE_TEAM_ID: "T", AUTH_APPLE_KEY_ID: "K", AUTH_APPLE_PRIVATE_KEY: "k" }),
    ["apple"]
  );
  eq("Apple secret needs the Services ID", enabledOAuthProviders({ AUTH_APPLE_SECRET: "jwt" }), []);
  eq(
    "both, Google first",
    enabledOAuthProviders({ AUTH_APPLE_ID: "a", AUTH_APPLE_SECRET: "jwt", AUTH_GOOGLE_ID: "g", AUTH_GOOGLE_SECRET: "s" }),
    ["google", "apple"]
  );
  eq(
    "ready-made Apple secret wins over a key",
    readOAuthConfig({ AUTH_APPLE_ID: "a", AUTH_APPLE_SECRET: "jwt", AUTH_APPLE_TEAM_ID: "T", AUTH_APPLE_KEY_ID: "K", AUTH_APPLE_PRIVATE_KEY: "k" }).apple,
    { clientId: "a", clientSecret: "jwt" }
  );
  eq(
    "PEM with literal \\n escapes is unescaped",
    readOAuthConfig({ AUTH_APPLE_ID: "a", AUTH_APPLE_TEAM_ID: "T", AUTH_APPLE_KEY_ID: "K", AUTH_APPLE_PRIVATE_KEY: "-----BEGIN-----\\nabc\\n-----END-----" }).apple?.key?.privateKey,
    "-----BEGIN-----\nabc\n-----END-----"
  );

  console.log("Apple client secret:");
  const { privateKey, publicKey } = await generateKeyPair("ES256", { extractable: true });
  const pem = await exportPKCS8(privateKey);
  const escaped = pem.trim().replace(/\n/g, "\\n");
  const apple = readOAuthConfig({
    AUTH_APPLE_ID: "com.example.web",
    AUTH_APPLE_TEAM_ID: "TEAM123456",
    AUTH_APPLE_KEY_ID: "KEY1234567",
    AUTH_APPLE_PRIVATE_KEY: escaped,
  }).apple!;
  const now = 1_800_000_000;
  const secret = await appleClientSecret(apple, now);
  const header = decodeProtectedHeader(secret);
  const claims = decodeJwt(secret);
  eq("header alg and kid", { alg: header.alg, kid: header.kid }, { alg: "ES256", kid: "KEY1234567" });
  eq("iss is the team id", claims.iss, "TEAM123456");
  eq("sub is the Services ID", claims.sub, "com.example.web");
  eq("aud is Apple", claims.aud, APPLE_AUDIENCE);
  eq("iat is now", claims.iat, now);
  eq("expires after the TTL", (claims.exp ?? 0) - now, APPLE_SECRET_TTL_SECONDS);
  eq("TTL is well under six months", APPLE_SECRET_TTL_SECONDS < 60 * 60 * 24 * 30, true);
  const verified = await jwtVerify(secret, await importSPKI(await exportSPKI(publicKey), "ES256"), {
    issuer: "TEAM123456",
    audience: APPLE_AUDIENCE,
    currentDate: new Date((now + 60) * 1000),
  }).then(() => true, () => false);
  eq("signature verifies with the public key", verified, true);
  eq("cached while fresh", await appleClientSecret(apple, now + 30 * 60), secret);
  const renewed = await appleClientSecret(apple, now + APPLE_SECRET_TTL_SECONDS - 5 * 60);
  eq("renewed before expiry", renewed !== secret && decodeJwt(renewed).iat === now + APPLE_SECRET_TTL_SECONDS - 5 * 60, true);
  eq("ready-made secret returned as is", await appleClientSecret({ clientId: "a", clientSecret: "premade" }), "premade");
  const badKey = await appleClientSecret({ clientId: "a", key: { teamId: "T", keyId: "K", privateKey: "not a key" } }).then(
    () => "signed",
    () => "threw"
  );
  eq("a malformed key throws (auth.ts then drops Apple)", badKey, "threw");

  console.log("Verified email:");
  eq("Google true", isProviderEmailVerified("google", { email_verified: true }), true);
  eq("Google string is not trusted", isProviderEmailVerified("google", { email_verified: "true" }), false);
  eq("Google missing", isProviderEmailVerified("google", {}), false);
  eq("Apple true", isProviderEmailVerified("apple", { email_verified: true }), true);
  eq("Apple \"true\"", isProviderEmailVerified("apple", { email_verified: "true" }), true);
  eq("Apple \"false\"", isProviderEmailVerified("apple", { email_verified: "false" }), false);

  console.log("Names:");
  eq("Google name", profileName("google", { name: "  Ada  Lovelace " }, "ada@example.com"), "Ada Lovelace");
  eq("Apple first authorization", profileName("apple", { user: { name: { firstName: "Ada", lastName: "Lovelace" } } }, "x@privaterelay.appleid.com"), "Ada Lovelace");
  eq("Apple later sign-in falls back to the email", profileName("apple", {}, "ada@example.com"), "ada");
  eq("Google without a name", profileName("google", {}, "cook@example.com"), "cook");

  console.log("Linking decision:");
  const fake = (links: Record<string, number>, users: Record<string, { id: number; emailVerifiedAt: Date | null }>): LinkLookups => ({
    async findLinkedUserId(provider, id) { return links[`${provider}:${id}`] ?? null; },
    async findUserByEmail(email) { return users[email] ?? null; },
  });
  const input = { provider: "apple" as const, providerAccountId: "001.abc", email: "ada@example.com" };
  eq(
    "existing link wins, even over another user's email",
    await decideOAuthLink(input, fake({ "apple:001.abc": 7 }, { "ada@example.com": { id: 9, emailVerifiedAt: null } })),
    { kind: "signin", userId: 7 }
  );
  eq(
    "link to the unverified user with that email and verify it",
    await decideOAuthLink(input, fake({}, { "ada@example.com": { id: 9, emailVerifiedAt: null } })),
    { kind: "link", userId: 9, markEmailVerified: true }
  );
  eq(
    "link to an already verified user",
    await decideOAuthLink(input, fake({}, { "ada@example.com": { id: 9, emailVerifiedAt: new Date(0) } })),
    { kind: "link", userId: 9, markEmailVerified: false }
  );
  eq(
    "a Google link does not match Apple",
    await decideOAuthLink(input, fake({ "google:001.abc": 7 }, {})),
    { kind: "create" }
  );
  eq("nobody yet: create", await decideOAuthLink(input, fake({}, {})), { kind: "create" });

  console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) failed.`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
