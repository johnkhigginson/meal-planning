// Short-lived signed tokens that authorize an admin-initiated impersonation.
//
// An admin mints a token via the admin-only endpoint; the NextAuth
// "impersonate" credentials provider validates the signature and issues a
// session for the target user. Because tokens are HMAC-signed with AUTH_SECRET
// and only the gated endpoint mints them, a non-admin can never forge one. Each
// token carries a random jti and is single-use (see consumeImpersonationJti) so
// a captured token can't be replayed within its short TTL.

import crypto from "crypto";

const SECRET = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET || "";
const TTL_MS = 60_000;

interface Payload {
  t: number; // target user id (who you become)
  by: number | null; // value for session.impersonatedBy (null = clean session)
  jti: string; // unique id, enforced single-use at redemption
  exp: number;
}

export function createImpersonationToken(targetUserId: number, impersonatedBy: number | null): string {
  if (!SECRET) throw new Error("AUTH_SECRET is not configured");
  const payload: Payload = {
    t: targetUserId,
    by: impersonatedBy,
    jti: crypto.randomBytes(12).toString("hex"),
    exp: Date.now() + TTL_MS,
  };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = crypto.createHmac("sha256", SECRET).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function verifyImpersonationToken(
  token: string | undefined | null
): { targetUserId: number; impersonatedBy: number | null; jti: string } | null {
  if (!token || !SECRET) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;

  const expected = crypto.createHmac("sha256", SECRET).update(body).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString()) as Payload;
    if (typeof payload.t !== "number" || typeof payload.jti !== "string") return null;
    if (Date.now() > payload.exp) return null;
    return {
      targetUserId: payload.t,
      impersonatedBy: typeof payload.by === "number" ? payload.by : null,
      jti: payload.jti,
    };
  } catch {
    return null;
  }
}

// One-time use enforcement (in-memory; fine for a single instance). Returns
// false if the jti was already redeemed.
const consumed = new Map<string, number>();
export function consumeImpersonationJti(jti: string): boolean {
  const now = Date.now();
  if (consumed.size > 2000) {
    for (const [k, exp] of consumed) if (exp < now) consumed.delete(k);
  }
  if (consumed.has(jti)) return false;
  consumed.set(jti, now + TTL_MS + 10_000);
  return true;
}
