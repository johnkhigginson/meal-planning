// Daily spend guard for Gemini calls: a per-user cap and a global cap, both
// counted per UTC calendar day. Pure and dependency-free (no Next, no Prisma)
// so scripts/verify-ai-guard.ts can test it offline with an injected clock.
//
// Counts live in memory. The app runs as a single systemd process on one
// server, so one counter is the whole picture, but every count resets when
// the process restarts (on deploy or reboot). Treat the caps as a guard
// against runaway usage, not a billing guarantee.

export const DEFAULT_DAILY_LIMIT_PER_USER = 50;
export const DEFAULT_DAILY_LIMIT_GLOBAL = 1000;

export const AI_LIMIT_MESSAGE =
  "You have reached today's limit for AI features. It resets at midnight UTC. You can still add recipes manually.";
export const AI_DISABLED_MESSAGE =
  "AI features are turned off right now. You can still add recipes manually.";

export interface AiLimits {
  perUser: number;
  global: number;
}

// Unset or blank uses the default. 0 disables AI. Anything that isn't a whole
// number of 0 or more also falls back to the default, so a typo can't
// accidentally turn the cap off.
function readLimit(raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw.trim() === "") return fallback;
  const n = Number(raw);
  return Number.isInteger(n) && n >= 0 ? n : fallback;
}

export function readAiLimits(env: Record<string, string | undefined> = process.env): AiLimits {
  return {
    perUser: readLimit(env.AI_DAILY_LIMIT_PER_USER, DEFAULT_DAILY_LIMIT_PER_USER),
    global: readLimit(env.AI_DAILY_LIMIT_GLOBAL, DEFAULT_DAILY_LIMIT_GLOBAL),
  };
}

// "2026-10-26" for any instant on that UTC day.
export function utcDayKey(now: Date): string {
  return now.toISOString().slice(0, 10);
}

export type AiBudgetResult =
  | { ok: true }
  | { ok: false; reason: "disabled" | "user" | "global"; message: string };

export interface ConsumeOptions {
  // Skip the per-user cap (admins). The global cap still applies.
  exemptFromUserCap?: boolean;
}

export class AiBudget {
  private day = "";
  private global = 0;
  private perUser = new Map<string, number>();

  constructor(
    private readonly limits: () => AiLimits = () => readAiLimits(),
    private readonly clock: () => Date = () => new Date()
  ) {}

  private roll() {
    const today = utcDayKey(this.clock());
    if (today !== this.day) {
      this.day = today;
      this.global = 0;
      this.perUser.clear();
    }
  }

  // Check both caps and, when both allow it, count one AI call.
  consume(userId: string | number, opts: ConsumeOptions = {}): AiBudgetResult {
    this.roll();
    const limits = this.limits();
    const userCapped = !opts.exemptFromUserCap;

    // Either cap set to 0 is the off switch, for admins too.
    if (limits.global === 0 || limits.perUser === 0) {
      return { ok: false, reason: "disabled", message: AI_DISABLED_MESSAGE };
    }
    const key = String(userId);
    const used = this.perUser.get(key) ?? 0;
    if (userCapped && used >= limits.perUser) {
      return { ok: false, reason: "user", message: AI_LIMIT_MESSAGE };
    }
    if (this.global >= limits.global) {
      return { ok: false, reason: "global", message: AI_LIMIT_MESSAGE };
    }
    this.perUser.set(key, used + 1);
    this.global++;
    return { ok: true };
  }

  usage(userId: string | number): { day: string; user: number; global: number } {
    this.roll();
    return { day: this.day, user: this.perUser.get(String(userId)) ?? 0, global: this.global };
  }
}

// Seconds until the next UTC midnight, for the Retry-After header.
export function secondsUntilUtcMidnight(now: Date): number {
  const next = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
  return Math.max(1, Math.ceil((next - now.getTime()) / 1000));
}
