import NextAuth, { type NextAuthConfig } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import Apple from "next-auth/providers/apple";
import type { Provider } from "next-auth/providers";
import bcrypt from "bcryptjs";
import { prisma } from "./prisma";
import { normalizeEmail } from "./email-normalize";
import { verifyTurnstile } from "./turnstile";
import { verifyImpersonationToken, consumeImpersonationJti } from "./impersonation";
import { audit, clientIp } from "./audit";
import { checkRateLimit } from "./rate-limit";
import { appleClientSecret, isOAuthProvider, readOAuthConfig } from "./oauth-config";
import { findOAuthSessionUser, signInWithOAuth } from "./oauth-accounts";

interface ExtendedUser {
  householdId?: string;
  systemRole?: string;
  impersonatedBy?: string | null;
  hiddenNavItems?: string;
}

let appleKeyErrorLogged = false;

// Google and Apple, each only when its keys are set (see oauth-config.ts).
// Built per request so a signed Apple client secret can be renewed before it
// expires. A bad Apple key drops Apple rather than breaking every auth() call.
async function oauthProviders(): Promise<{ providers: Provider[]; apple: boolean }> {
  const config = readOAuthConfig();
  const providers: Provider[] = [];
  if (config.google) {
    providers.push(Google({ clientId: config.google.clientId, clientSecret: config.google.clientSecret }));
  }
  let apple = false;
  if (config.apple) {
    try {
      const clientSecret = await appleClientSecret(config.apple);
      providers.push(Apple({ clientId: config.apple.clientId, clientSecret }));
      apple = true;
    } catch (err) {
      if (!appleKeyErrorLogged) console.error("[auth] Apple sign-in disabled: could not sign the client secret", err);
      appleKeyErrorLogged = true;
    }
  }
  return { providers, apple };
}

export const { handlers, signIn, signOut, auth } = NextAuth(async (request) => {
  const oauth = await oauthProviders();
  const config: NextAuthConfig = {
    providers: [
      Credentials({
        credentials: {
          email: {},
          password: {},
          turnstileToken: {},
        },
        async authorize(credentials, request) {
          const rawEmail = credentials?.email as string;
          const password = credentials?.password as string;
          if (!rawEmail || !password) return null;

          const email = normalizeEmail(rawEmail);

          // Brute-force throttle: cap attempts per IP+email window.
          const ip =
            (request as Request | undefined)?.headers?.get("x-forwarded-for")?.split(",")[0]?.trim() ||
            "unknown";
          if (!checkRateLimit(`login:${ip}:${email}`, 10, 15 * 60_000).ok) return null;

          const user = await prisma.user.findUnique({ where: { email } });
          // Accounts created through Google or Apple have no password until they
          // set one, so they fail like any other wrong password.
          if (!user || !user.passwordHash) return null;

          // Bot protection on sign-in. The auto-login right after registration
          // sends no token and is exempt because the register endpoint already
          // verified Turnstile; we recognize it by lastLogin being null. Every
          // login after that must pass verification (no-op when keys are unset).
          if (user.lastLogin) {
            const captchaOk = await verifyTurnstile(credentials?.turnstileToken);
            if (!captchaOk) return null;
          }

          const valid = await bcrypt.compare(password, user.passwordHash);
          if (!valid) return null;

          await prisma.user.update({
            where: { id: user.id },
            data: { lastLogin: new Date() },
          });

          await audit({
            category: "AUTH",
            action: "LOGIN",
            summary: `${user.name} signed in`,
            actorUserId: user.id,
            actorName: user.name,
            householdId: user.householdId,
          });

          return {
            id: user.id.toString(),
            email: user.email,
            name: user.name,
            householdId: user.householdId.toString(),
            systemRole: user.systemRole,
            hiddenNavItems: user.hiddenNavItems,
          };
        },
      }),
      // Admin impersonation. Accepts a signed token (minted only by the admin-only
      // /api/admin/impersonate endpoint) and issues a session for the target user.
      // `impersonatedBy` carries the originating admin so the UI can show a banner
      // and offer a one-click return.
      Credentials({
        id: "impersonate",
        name: "Impersonate",
        credentials: { token: {} },
        async authorize(credentials) {
          const payload = verifyImpersonationToken(credentials?.token as string | undefined);
          if (!payload) return null;
          // Single-use: reject a replayed token within its TTL window.
          if (!consumeImpersonationJti(payload.jti)) return null;

          const user = await prisma.user.findUnique({ where: { id: payload.targetUserId } });
          if (!user) return null;

          return {
            id: user.id.toString(),
            email: user.email,
            name: user.name,
            householdId: user.householdId.toString(),
            systemRole: user.systemRole,
            impersonatedBy: payload.impersonatedBy != null ? payload.impersonatedBy.toString() : null,
            hiddenNavItems: user.hiddenNavItems,
          };
        },
      }),
      ...oauth.providers,
    ],
    callbacks: {
      // Google and Apple sign-ins are matched to a user here (linking or
      // creating one); a refusal sends the user back to /login with a reason.
      // Credentials and impersonation already decided in authorize().
      async signIn({ account, profile }) {
        if (!account || !isOAuthProvider(account.provider)) return true;
        const result = await signInWithOAuth({
          provider: account.provider,
          providerAccountId: account.providerAccountId,
          profile: (profile ?? {}) as Record<string, unknown>,
          ip: request ? clientIp(request) : null,
        });
        return result.ok ? true : `/login?error=${result.error}`;
      },
      async jwt({ token, user, account, trigger, session }) {
        // The provider's user carries the provider's id, so load ours through the
        // link signIn just made and fill the token like credentials sign-in does.
        if (user && account && isOAuthProvider(account.provider)) {
          const linked = await findOAuthSessionUser(account.provider, account.providerAccountId);
          if (!linked) return null;
          token.sub = linked.id.toString();
          token.name = linked.name;
          token.email = linked.email;
          token.picture = undefined;
          user = {
            id: linked.id.toString(),
            householdId: linked.householdId.toString(),
            systemRole: linked.systemRole,
            impersonatedBy: null,
            hiddenNavItems: linked.hiddenNavItems,
          } as typeof user;
        }
        if (user) {
          token.id = user.id;
          token.householdId = (user as ExtendedUser).householdId;
          token.systemRole = (user as ExtendedUser).systemRole;
          token.impersonatedBy = (user as ExtendedUser).impersonatedBy ?? null;
          token.hiddenNavItems = (user as ExtendedUser).hiddenNavItems ?? "";
        }
        // Live update of menu preferences (via useSession().update) without a
        // re-login.
        if (trigger === "update" && session && typeof (session as { hiddenNavItems?: unknown }).hiddenNavItems === "string") {
          token.hiddenNavItems = (session as { hiddenNavItems: string }).hiddenNavItems;
        }
        return token;
      },
      session({ session, token }) {
        if (session.user && token.id) {
          session.user.id = token.id as string;
          (session.user as ExtendedUser).householdId = token.householdId as string;
          (session.user as ExtendedUser).systemRole = token.systemRole as string;
          (session.user as ExtendedUser).impersonatedBy = (token.impersonatedBy as string | null) ?? null;
          (session.user as ExtendedUser).hiddenNavItems = (token.hiddenNavItems as string) ?? "";
        }
        return session;
      },
    },
    pages: {
      signIn: "/login",
      // With Google or Apple on, their errors (cancelled consent, failed checks)
      // land on /login with a message instead of the bare Auth.js error page.
      ...(oauth.providers.length > 0 ? { error: "/login" } : {}),
    },
    session: {
      strategy: "jwt",
    },
  };
  // Apple returns by cross-site POST (response_mode=form_post). Auth.js already
  // relaxes its state and nonce cookies for that, but not the callback-url
  // cookie, so without this Apple sign-ins would always land on the home page
  // instead of the page that asked for sign-in.
  if (oauth.apple) {
    config.cookies = { callbackUrl: { options: { sameSite: "none", secure: true } } } as NextAuthConfig["cookies"];
  }
  return config;
});

interface AuthUser {
  userId: number;
  householdId: number;
  name: string;
  systemRole: string;
  isAdmin: boolean;
  isContributor: boolean;
}

export async function getCurrentUser(): Promise<AuthUser | null> {
  const session = await auth();
  if (!session?.user?.id) return null;
  const ext = session.user as ExtendedUser;
  if (!ext.householdId) return null;
  const systemRole = ext.systemRole || "USER";
  return {
    userId: parseInt(session.user.id, 10),
    householdId: parseInt(ext.householdId, 10),
    name: session.user.name ?? "",
    systemRole,
    isAdmin: systemRole === "ADMIN",
    isContributor: systemRole === "CONTRIBUTOR" || systemRole === "ADMIN",
  };
}

export async function getCurrentUserId(): Promise<number | null> {
  const user = await getCurrentUser();
  return user?.userId ?? null;
}

export async function requireHouseholdId(): Promise<number> {
  const user = await getCurrentUser();
  if (!user) throw new Error("Not authenticated");
  return user.householdId;
}

export async function requireUser(): Promise<AuthUser> {
  const user = await getCurrentUser();
  if (!user) throw new Error("Not authenticated");
  return user;
}

export async function requireAdmin(): Promise<AuthUser> {
  const user = await requireUser();
  if (!user.isAdmin) throw new Error("Not authorized");
  return user;
}

export async function requireContributor(): Promise<AuthUser> {
  const user = await requireUser();
  if (!user.isContributor) throw new Error("Not authorized");
  return user;
}
