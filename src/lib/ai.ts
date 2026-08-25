import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { enforceRateLimit } from "@/lib/rate-limit";

// Single source of truth for the Gemini model. Every AI call site imports this,
// so switching models is a one-line change.
//
// Model history: 2.0-flash-lite (shut down 2026-06-01) → 2.5-flash-lite →
// 3.1-flash-lite. 2.5-flash-lite is slated for retirement (listed around
// October 2026), with 3.1-flash-lite as its named replacement.
export const GEMINI_MODEL = "gemini-3.1-flash-lite";

// Per-user limits. The burst window stops a runaway client loop or a single user
// hammering an endpoint; the daily cap is the real cost ceiling. Both are
// tunable per environment without a code change.
const PER_MIN = Number(process.env.AI_LIMIT_PER_MIN ?? 10);
const PER_DAY = Number(process.env.AI_LIMIT_PER_DAY ?? 200);
const DAY_MS = 24 * 60 * 60 * 1000;

type AiGuard = { ok: true; userId: number } | { ok: false; response: NextResponse };

// Gate for every AI-backed endpoint: the caller must be signed in, must have AI
// enabled on their account (admin-controlled), and must be within both the burst
// and daily request budgets.
//
// NOTE: the counters live in the in-memory rate limiter, so they reset when the
// process restarts (i.e. on deploy). That makes the daily cap a strong guard
// against runaway usage rather than a hard billing guarantee — set a spend cap in
// Google Cloud too if you want an absolute ceiling.
export async function guardAi(
  scope: string,
  opts?: { perMin?: number; perDay?: number }
): Promise<AiGuard> {
  const user = await getCurrentUser();
  if (!user) {
    return { ok: false, response: NextResponse.json({ error: "Not authenticated" }, { status: 401 }) };
  }

  const row = await prisma.user.findUnique({
    where: { id: user.userId },
    select: { aiEnabled: true },
  });
  if (!row?.aiEnabled) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "AI features are turned off for your account. Ask an admin to enable them." },
        { status: 403 }
      ),
    };
  }

  // Burst limit is per-feature so one endpoint can't starve another...
  const burst = enforceRateLimit(`${scope}:min`, user.userId, opts?.perMin ?? PER_MIN, 60_000);
  if (burst) return { ok: false, response: burst };

  // ...while the daily budget is shared across every AI feature, so the cap is
  // "this person's total AI usage today", not per-endpoint.
  const daily = enforceRateLimit("ai:day", user.userId, opts?.perDay ?? PER_DAY, DAY_MS);
  if (daily) return { ok: false, response: daily };

  return { ok: true, userId: user.userId };
}
