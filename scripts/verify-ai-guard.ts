// Offline checks for the daily AI spend guard (src/lib/ai-budget.ts): env
// parsing and defaults, per-user and global caps, 0 as the off switch, the
// admin exemption, and the UTC day rollover with an injected clock.
// No DB, network or API key needed.
// Run: npx tsx scripts/verify-ai-guard.ts

import {
  AI_DISABLED_MESSAGE,
  AI_LIMIT_MESSAGE,
  AiBudget,
  DEFAULT_DAILY_LIMIT_GLOBAL,
  DEFAULT_DAILY_LIMIT_PER_USER,
  readAiLimits,
  secondsUntilUtcMidnight,
  utcDayKey,
  type AiLimits,
} from "../src/lib/ai-budget";

let failures = 0;
function eq(label: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) { failures++; console.log(`  ✗ ${label}: got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)}`); }
  else console.log(`  ✓ ${label}`);
}

// A clock the test can move forward.
function fakeClock(iso: string) {
  let now = new Date(iso);
  return { now: () => now, set: (next: string) => { now = new Date(next); } };
}

function budget(limits: AiLimits, iso = "2026-10-26T12:00:00Z") {
  const clock = fakeClock(iso);
  return { b: new AiBudget(() => limits, clock.now), clock };
}

// Call consume n times and return how many were allowed.
function run(b: AiBudget, user: number, n: number, admin = false): number {
  let allowed = 0;
  for (let i = 0; i < n; i++) if (b.consume(user, { exemptFromUserCap: admin }).ok) allowed++;
  return allowed;
}

console.log("Env parsing:");
eq("defaults are 50 and 1000", [DEFAULT_DAILY_LIMIT_PER_USER, DEFAULT_DAILY_LIMIT_GLOBAL], [50, 1000]);
eq("unset uses defaults", readAiLimits({}), { perUser: 50, global: 1000 });
eq("blank uses defaults", readAiLimits({ AI_DAILY_LIMIT_PER_USER: " ", AI_DAILY_LIMIT_GLOBAL: "" }), { perUser: 50, global: 1000 });
eq("explicit values", readAiLimits({ AI_DAILY_LIMIT_PER_USER: "5", AI_DAILY_LIMIT_GLOBAL: "20" }), { perUser: 5, global: 20 });
eq("0 is kept (off switch)", readAiLimits({ AI_DAILY_LIMIT_PER_USER: "0", AI_DAILY_LIMIT_GLOBAL: "0" }), { perUser: 0, global: 0 });
eq("garbage falls back to defaults", readAiLimits({ AI_DAILY_LIMIT_PER_USER: "lots", AI_DAILY_LIMIT_GLOBAL: "-3" }), { perUser: 50, global: 1000 });
eq("fractions fall back to defaults", readAiLimits({ AI_DAILY_LIMIT_PER_USER: "2.5" }).perUser, 50);

console.log("Per-user cap:");
{
  const { b } = budget({ perUser: 3, global: 100 });
  eq("user 1 gets exactly 3 of 5", run(b, 1, 5), 3);
  const denied = b.consume(1);
  eq("4th call is denied as a user cap", denied.ok ? "ok" : denied.reason, "user");
  eq("denial carries the friendly message", denied.ok ? "" : denied.message, AI_LIMIT_MESSAGE);
  eq("user 2 has their own count", run(b, 2, 2), 2);
  eq("usage is counted", b.usage(1), { day: "2026-10-26", user: 3, global: 5 });
  eq("denied calls are not counted", b.usage(1).global, 5);
}

console.log("Global cap:");
{
  const { b } = budget({ perUser: 10, global: 4 });
  eq("users 1 and 2 share 4 calls", run(b, 1, 3) + run(b, 2, 3), 4);
  const denied = b.consume(3);
  eq("a fresh user is denied by the global cap", denied.ok ? "ok" : denied.reason, "global");
  eq("an admin is denied by the global cap too", b.consume(9, { exemptFromUserCap: true }).ok, false);
}

console.log("Admin exemption:");
{
  const { b } = budget({ perUser: 2, global: 100 });
  eq("an admin goes past the per-user cap", run(b, 1, 5, true), 5);
  eq("a regular user still stops at 2", run(b, 2, 5), 2);
}

console.log("0 disables AI:");
{
  const { b } = budget({ perUser: 0, global: 100 });
  const r = b.consume(1);
  eq("per-user 0 denies as disabled", r.ok ? "ok" : r.reason, "disabled");
  eq("disabled message", r.ok ? "" : r.message, AI_DISABLED_MESSAGE);
  eq("per-user 0 disables admins too", b.consume(1, { exemptFromUserCap: true }).ok, false);
  const g = budget({ perUser: 50, global: 0 }).b.consume(1, { exemptFromUserCap: true });
  eq("global 0 denies as disabled", g.ok ? "ok" : g.reason, "disabled");
}

console.log("Limits are read on every call:");
{
  let limits: AiLimits = { perUser: 1, global: 100 };
  const b = new AiBudget(() => limits, () => new Date("2026-10-26T12:00:00Z"));
  eq("first call allowed", b.consume(1).ok, true);
  eq("second call denied at 1", b.consume(1).ok, false);
  limits = { perUser: 2, global: 100 };
  eq("raising the cap allows one more", b.consume(1).ok, true);
}

console.log("UTC day rollover:");
{
  const { b, clock } = budget({ perUser: 2, global: 3 }, "2026-10-26T23:59:58Z");
  eq("2 calls before midnight", run(b, 1, 5), 2);
  eq("user 2 gets the last global call", run(b, 2, 5), 1);
  clock.set("2026-10-26T23:59:59.999Z");
  eq("still the same UTC day", b.consume(3).ok, false);
  clock.set("2026-10-27T00:00:00Z");
  eq("new UTC day resets the user count", run(b, 1, 5), 2);
  eq("new UTC day resets the global count", b.usage(1), { day: "2026-10-27", user: 2, global: 2 });
  // 01:00 in UTC+2 is still 23:00 the previous day in UTC.
  eq("day key is UTC, not local", utcDayKey(new Date("2026-10-27T01:00:00+02:00")), "2026-10-26");
}

console.log("Retry-After:");
eq("one hour before midnight", secondsUntilUtcMidnight(new Date("2026-10-26T23:00:00Z")), 3600);
eq("at midnight, a full day", secondsUntilUtcMidnight(new Date("2026-10-27T00:00:00Z")), 86400);
eq("never below 1", secondsUntilUtcMidnight(new Date("2026-10-26T23:59:59.9995Z")) >= 1, true);

console.log(failures ? `\n${failures} check(s) failed` : "\nAll AI guard checks passed");
process.exit(failures ? 1 : 0);
