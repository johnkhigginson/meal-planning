import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { enforceRateLimit } from "@/lib/rate-limit";
import { AiBudget, secondsUntilUtcMidnight } from "@/lib/ai-budget";

// Single source of truth for the Gemini model. Every AI call site imports this,
// so switching models is a one-line change.
//
// Model history: 2.0-flash-lite (shut down 2026-06-01) → 2.5-flash-lite →
// 3.1-flash-lite. 2.5-flash-lite is slated for retirement (listed around
// October 2026), with 3.1-flash-lite as its named replacement.
export const GEMINI_MODEL = "gemini-3.1-flash-lite";

// Per-user burst limit. It stops a runaway client loop or a single user
// hammering one endpoint. The daily caps (per user and global) are the real
// cost ceiling and live in the shared AI budget below.
const PER_MIN = Number(process.env.AI_LIMIT_PER_MIN ?? 10);

// One budget for the whole process. Limits are read from the environment on
// every check, so AI_DAILY_LIMIT_PER_USER and AI_DAILY_LIMIT_GLOBAL apply
// without a code change. See src/lib/ai-budget.ts for the day boundary (UTC)
// and the restart caveat.
const budget = new AiBudget();

function budgetResponse(message: string, reason: string): NextResponse {
  return NextResponse.json(
    { error: message, code: reason === "disabled" ? "ai_disabled" : "ai_daily_limit" },
    { status: 429, headers: { "Retry-After": String(secondsUntilUtcMidnight(new Date())) } }
  );
}

// Count one model call against the daily caps. Routes that make several model
// calls per request (the batch extractor) call this before each one; it
// returns a 429 response when a cap is hit, or null to proceed.
export function consumeAiCall(userId: number, isAdmin: boolean): NextResponse | null {
  const result = budget.consume(userId, { exemptFromUserCap: isAdmin });
  return result.ok ? null : budgetResponse(result.message, result.reason);
}

type AiGuard = { ok: true; userId: number; isAdmin: boolean } | { ok: false; response: NextResponse };

// Gate for every AI-backed endpoint: the caller must be signed in, must have AI
// enabled on their account (admin-controlled), must be within the burst limit,
// and must be within the daily caps. A guarded request counts as one AI call
// unless the caller passes { countLater: true } and calls consumeAiCall itself
// before each model call. Admins skip the per-user daily cap but not the
// global one.
export async function guardAi(
  scope: string,
  opts?: { perMin?: number; countLater?: boolean }
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

  // Burst limit is per-feature so one endpoint can't starve another.
  const burst = enforceRateLimit(`${scope}:min`, user.userId, opts?.perMin ?? PER_MIN, 60_000);
  if (burst) return { ok: false, response: burst };

  if (!opts?.countLater) {
    const daily = consumeAiCall(user.userId, user.isAdmin);
    if (daily) return { ok: false, response: daily };
  }

  return { ok: true, userId: user.userId, isAdmin: user.isAdmin };
}
