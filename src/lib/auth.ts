import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "./prisma";

interface ExtendedUser {
  householdId?: string;
  isAdmin?: string;
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Credentials({
      credentials: {
        email: {},
        password: {},
      },
      async authorize(credentials) {
        const email = credentials?.email as string;
        const password = credentials?.password as string;
        if (!email || !password) return null;

        const user = await prisma.user.findUnique({ where: { email } });
        if (!user) return null;

        const valid = await bcrypt.compare(password, user.passwordHash);
        if (!valid) return null;

        return {
          id: user.id.toString(),
          email: user.email,
          name: user.name,
          householdId: user.householdId.toString(),
          isAdmin: user.isAdmin ? "true" : "false",
        };
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.householdId = (user as ExtendedUser).householdId;
        token.isAdmin = (user as ExtendedUser).isAdmin;
      }
      return token;
    },
    session({ session, token }) {
      if (session.user && token.id) {
        session.user.id = token.id as string;
        (session.user as ExtendedUser).householdId = token.householdId as string;
        (session.user as ExtendedUser).isAdmin = token.isAdmin as string;
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
  isAdmin: boolean;
}

export async function getCurrentUser(): Promise<AuthUser | null> {
  const session = await auth();
  if (!session?.user?.id) return null;
  const ext = session.user as ExtendedUser;
  if (!ext.householdId) return null;
  return {
    userId: parseInt(session.user.id, 10),
    householdId: parseInt(ext.householdId, 10),
    isAdmin: ext.isAdmin === "true",
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
