import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "./prisma";
import { normalizeEmail } from "./email-normalize";
import { verifyTurnstile } from "./turnstile";
import { verifyImpersonationToken } from "./impersonation";
import { audit } from "./audit";

interface ExtendedUser {
  householdId?: string;
  systemRole?: string;
  impersonatedBy?: string | null;
  hiddenNavItems?: string;
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Credentials({
      credentials: {
        email: {},
        password: {},
        turnstileToken: {},
      },
      async authorize(credentials) {
        const rawEmail = credentials?.email as string;
        const password = credentials?.password as string;
        if (!rawEmail || !password) return null;

        const email = normalizeEmail(rawEmail);
        const user = await prisma.user.findUnique({ where: { email } });
        if (!user) return null;

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
  ],
  callbacks: {
    jwt({ token, user, trigger, session }) {
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
  },
  session: {
    strategy: "jwt",
  },
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
