import { createHash, randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";

// Single-use tokens sent by email (password reset, email verification). The raw
// token only ever lives in the emailed link; the database keeps its sha256.

export type AuthTokenPurpose = "PASSWORD_RESET" | "VERIFY_EMAIL";

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

// Issue a fresh token and invalidate any earlier unused ones for the same
// purpose, so only the most recent email works. Returns the raw token.
export async function createAuthToken(
  userId: number,
  purpose: AuthTokenPurpose,
  ttlMs: number
): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  await prisma.authToken.deleteMany({ where: { userId, purpose, usedAt: null } });
  await prisma.authToken.create({
    data: {
      userId,
      purpose,
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + ttlMs),
    },
  });
  return token;
}

// Mark a token used and return its user id, or null when it's unknown, expired
// or already used. The conditional update makes redemption atomic, so two
// requests racing with the same token can't both succeed.
export async function consumeAuthToken(
  token: unknown,
  purpose: AuthTokenPurpose
): Promise<number | null> {
  if (typeof token !== "string" || !token || token.length > 200) return null;
  const tokenHash = hashToken(token);
  const now = new Date();
  const { count } = await prisma.authToken.updateMany({
    where: { tokenHash, purpose, usedAt: null, expiresAt: { gt: now } },
    data: { usedAt: now },
  });
  if (count !== 1) return null;
  const row = await prisma.authToken.findUnique({ where: { tokenHash }, select: { userId: true } });
  return row?.userId ?? null;
}
