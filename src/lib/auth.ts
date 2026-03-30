import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "./prisma";

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
        };
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.householdId = (user as { householdId?: string }).householdId;
      }
      return token;
    },
    session({ session, token }) {
      if (session.user && token.id) {
        session.user.id = token.id as string;
        (session.user as { householdId?: string }).householdId = token.householdId as string;
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

/**
 * Get the current user's ID and household ID. Returns null if not authenticated.
 */
export async function getCurrentUser(): Promise<{ userId: number; householdId: number } | null> {
  const session = await auth();
  if (!session?.user?.id) return null;
  const householdId = (session.user as { householdId?: string }).householdId;
  if (!householdId) return null;
  return {
    userId: parseInt(session.user.id, 10),
    householdId: parseInt(householdId, 10),
  };
}

/**
 * @deprecated Use getCurrentUser() instead
 */
export async function getCurrentUserId(): Promise<number | null> {
  const user = await getCurrentUser();
  return user?.userId ?? null;
}

/**
 * Get the current user's household ID, throwing if not authenticated.
 */
export async function requireHouseholdId(): Promise<number> {
  const user = await getCurrentUser();
  if (!user) throw new Error("Not authenticated");
  return user.householdId;
}

/**
 * Get both IDs, throwing if not authenticated.
 */
export async function requireUser(): Promise<{ userId: number; householdId: number }> {
  const user = await getCurrentUser();
  if (!user) throw new Error("Not authenticated");
  return user;
}
