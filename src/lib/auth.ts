import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "./prisma";
import { normalizeEmail } from "./email-normalize";

interface ExtendedUser {
  householdId?: string;
  systemRole?: string;
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Credentials({
      credentials: {
        email: {},
        password: {},
      },
      async authorize(credentials) {
        const rawEmail = credentials?.email as string;
        const password = credentials?.password as string;
        if (!rawEmail || !password) return null;

        const email = normalizeEmail(rawEmail);
        const user = await prisma.user.findUnique({ where: { email } });
        if (!user) return null;

        const valid = await bcrypt.compare(password, user.passwordHash);
        if (!valid) return null;

        return {
          id: user.id.toString(),
          email: user.email,
          name: user.name,
          householdId: user.householdId.toString(),
          systemRole: user.systemRole,
        };
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.householdId = (user as ExtendedUser).householdId;
        token.systemRole = (user as ExtendedUser).systemRole;
      }
      return token;
    },
    session({ session, token }) {
      if (session.user && token.id) {
        session.user.id = token.id as string;
        (session.user as ExtendedUser).householdId = token.householdId as string;
        (session.user as ExtendedUser).systemRole = token.systemRole as string;
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
