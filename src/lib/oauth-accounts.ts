import { prisma } from "@/lib/prisma";
import { normalizeEmail } from "@/lib/email-normalize";
import { audit } from "@/lib/audit";
import { checkRateLimit } from "@/lib/rate-limit";
import { createAccount } from "@/lib/user-registration";
import {
  decideOAuthLink,
  isProviderEmailVerified,
  profileName,
  providerLabel,
  type LinkLookups,
  type OAuthProviderId,
} from "@/lib/oauth-config";

// Error codes the login page knows how to explain (see LoginForm).
export type OAuthSignInError = "OAuthEmailUnverified" | "OAuthRateLimited" | "OAuthFailed";

export type OAuthSignInResult = { ok: true; userId: number } | { ok: false; error: OAuthSignInError };

const lookups: LinkLookups = {
  async findLinkedUserId(provider, providerAccountId) {
    const link = await prisma.userOAuthAccount.findUnique({
      where: { provider_providerAccountId: { provider, providerAccountId } },
      select: { userId: true },
    });
    return link?.userId ?? null;
  },
  findUserByEmail(email) {
    return prisma.user.findUnique({ where: { email }, select: { id: true, emailVerifiedAt: true } });
  },
};

function isUniqueViolation(err: unknown): boolean {
  return (err as { code?: unknown } | null)?.code === "P2002";
}

// Resolve a Google or Apple sign-in to a user: an existing link first, then a
// user with the same verified email (linked now), then a brand new account.
// Records lastLogin and the audit trail. Called from the Auth.js signIn
// callback; the jwt callback then loads the user through the link.
export async function signInWithOAuth(opts: {
  provider: OAuthProviderId;
  providerAccountId: string;
  profile: Record<string, unknown>;
  ip: string | null;
}): Promise<OAuthSignInResult> {
  const { provider, providerAccountId, profile, ip } = opts;
  const label = providerLabel(provider);

  const rawEmail = typeof profile.email === "string" ? profile.email : "";
  if (!rawEmail || !providerAccountId || !isProviderEmailVerified(provider, profile)) {
    return { ok: false, error: "OAuthEmailUnverified" };
  }
  const email = normalizeEmail(rawEmail);

  // Same spirit as the credentials throttle: cap sign-in attempts per IP.
  if (!checkRateLimit(`oauth-login:${ip ?? "unknown"}`, 20, 15 * 60_000).ok) {
    return { ok: false, error: "OAuthRateLimited" };
  }

  // Two first sign-ins racing can both decide to link or create; the unique
  // indexes stop the second, which then retries and finds the first's work.
  let userId: number | null = null;
  for (let attempt = 0; attempt < 2 && userId === null; attempt++) {
    try {
      userId = await resolveUser({ provider, providerAccountId, email, profile, ip, label });
    } catch (err) {
      if (attempt === 0 && isUniqueViolation(err)) continue;
      if (err instanceof RateLimitedError) return { ok: false, error: "OAuthRateLimited" };
      console.error("[oauth] sign-in failed", provider, err);
      return { ok: false, error: "OAuthFailed" };
    }
  }
  if (userId === null) return { ok: false, error: "OAuthFailed" };

  const user = await prisma.user.update({
    where: { id: userId },
    data: { lastLogin: new Date() },
    select: { id: true, name: true, householdId: true },
  });

  await audit({
    category: "AUTH",
    action: "LOGIN",
    summary: `${user.name} signed in with ${label}`,
    actorUserId: user.id,
    actorName: user.name,
    householdId: user.householdId,
    metadata: { provider },
    ip,
  });

  return { ok: true, userId: user.id };
}

class RateLimitedError extends Error {}

async function resolveUser(opts: {
  provider: OAuthProviderId;
  providerAccountId: string;
  email: string;
  profile: Record<string, unknown>;
  ip: string | null;
  label: string;
}): Promise<number> {
  const { provider, providerAccountId, email, profile, ip, label } = opts;
  const decision = await decideOAuthLink({ provider, providerAccountId, email }, lookups);
  if (decision.kind === "signin") return decision.userId;

  let userId: number;
  if (decision.kind === "link") {
    userId = decision.userId;
  } else {
    // New accounts share the registration throttle with the signup form.
    if (!checkRateLimit(`register:${ip ?? "unknown"}`, 5, 60 * 60_000).ok) throw new RateLimitedError();
    const created = await createAccount({
      name: profileName(provider, profile, email),
      email,
      passwordHash: null,
      // The provider verified the address, so there's nothing to confirm.
      emailVerifiedAt: new Date(),
      method: provider,
      ip,
    });
    userId = created.id;
  }

  await prisma.userOAuthAccount.create({
    data: { userId, provider, providerAccountId, email: email.slice(0, 320) },
  });

  // The provider just proved the user owns the address.
  if (decision.kind === "link" && decision.markEmailVerified) {
    await prisma.user.update({ where: { id: userId }, data: { emailVerifiedAt: new Date() } });
  }

  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { id: true, name: true, householdId: true },
  });
  await audit({
    category: "AUTH",
    action: "OAUTH_LINKED",
    summary: `${user.name} linked ${label}`,
    actorUserId: user.id,
    actorName: user.name,
    householdId: user.householdId,
    metadata: { provider, email },
    ip,
  });

  return userId;
}

// Session fields for a linked provider identity, the same ones credentials
// sign-in puts on the token.
export async function findOAuthSessionUser(provider: OAuthProviderId, providerAccountId: string) {
  const link = await prisma.userOAuthAccount.findUnique({
    where: { provider_providerAccountId: { provider, providerAccountId } },
    select: {
      user: {
        select: { id: true, name: true, email: true, householdId: true, systemRole: true, hiddenNavItems: true },
      },
    },
  });
  return link?.user ?? null;
}
