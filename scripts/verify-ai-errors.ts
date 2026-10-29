// Offline checks for AI provider error handling (src/lib/ai-errors.ts): a
// simulated provider 400/403/500, a 429 and a network error all map to the
// friendly message, with the right status, and the response never contains the
// provider text or the API key. No DB, network or API key needed.
// Run: npx tsx scripts/verify-ai-errors.ts

import {
  AiProviderError,
  aiErrorResponse,
  aiNotConfiguredResponse,
  aiUnavailableMessage,
  describeAiError,
  type AiFeature,
} from "../src/lib/ai-errors";

let failures = 0;
function eq(label: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) { failures++; console.log(`  ✗ ${label}: got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)}`); }
  else console.log(`  ✓ ${label}`);
}

// A fake key, set only so the redaction check has something to look for.
const FAKE_KEY = "AIzaFAKEKEYFORTESTINGONLY0123456789";
process.env.GEMINI_API_KEY = FAKE_KEY;

// Shaped like the Gemini SDK's ApiError: a status and the provider JSON body
// as the message.
function providerError(status: number, providerStatus: string, text: string, reason?: string) {
  const body = {
    error: {
      code: status,
      message: text,
      status: providerStatus,
      details: reason ? [{ "@type": "type.googleapis.com/google.rpc.ErrorInfo", reason }] : [],
    },
  };
  return Object.assign(new Error(JSON.stringify(body)), { status });
}

const cases: { label: string; err: unknown; status: number; text: string }[] = [
  {
    label: "400 invalid key",
    err: providerError(400, "INVALID_ARGUMENT", `API key not valid. Please pass a valid API key. (${FAKE_KEY})`, "API_KEY_INVALID"),
    status: 502,
    text: "API key not valid",
  },
  { label: "403 permission denied", err: providerError(403, "PERMISSION_DENIED", "Generative Language API has not been used in project 123", "SERVICE_DISABLED"), status: 502, text: "generativelanguage" },
  { label: "500 internal", err: providerError(500, "INTERNAL", "Internal error encountered."), status: 502, text: "Internal error" },
  { label: "429 quota", err: providerError(429, "RESOURCE_EXHAUSTED", "Quota exceeded for metric generativelanguage.googleapis.com", "RATE_LIMIT_EXCEEDED"), status: 503, text: "Quota exceeded" },
  { label: "network error", err: new TypeError("fetch failed: getaddrinfo ENOTFOUND generativelanguage.googleapis.com"), status: 503, text: "ENOTFOUND" },
];

const features: AiFeature[] = ["photo", "document", "receipt", "extract"];

// Keep the expected server-side logging out of the report.
const realError = console.error;
const logged: string[] = [];
console.error = (...args: unknown[]) => { logged.push(args.join(" ")); };

async function main() {
  const results: Awaited<ReturnType<typeof collect>> = await collect();
  console.error = realError;

  console.log("Provider errors map to friendly messages:");
  for (const r of results) {
    eq(`${r.label} (${r.feature}): status`, r.status, r.expected);
    eq(`${r.label} (${r.feature}): friendly message`, r.body.error, aiUnavailableMessage(r.feature));
    const raw = JSON.stringify(r.body);
    eq(`${r.label} (${r.feature}): no provider text`, raw.includes(r.text) || /googleapis|INVALID_ARGUMENT|API key/i.test(raw), false);
    eq(`${r.label} (${r.feature}): no key`, raw.includes(FAKE_KEY), false);
  }

  console.log("Missing key:");
  for (const f of features) {
    const res = aiNotConfiguredResponse("test", f);
    const body = await res.json();
    eq(`${f}: 503 and friendly`, [res.status, body.error], [503, aiUnavailableMessage(f)]);
    eq(`${f}: does not mention the env var`, /GEMINI/.test(JSON.stringify(body)), false);
  }

  console.log("Server log:");
  const log = logged.join("\n");
  eq("log has the provider status and reason", /providerStatus=400 status=INVALID_ARGUMENT reason=API_KEY_INVALID/.test(log), true);
  eq("log names the route", log.includes("[ai] test failed"), true);
  eq("log does not contain the key", log.includes(FAKE_KEY), false);

  console.log("Parsing:");
  eq("describe 400", describeAiError(cases[0].err), { providerStatus: 400, providerCode: "INVALID_ARGUMENT", reason: "API_KEY_INVALID" });
  eq("describe network error", describeAiError(cases[4].err), { providerStatus: null, providerCode: null, reason: null });
  const wrapped = new AiProviderError(aiUnavailableMessage("extract"), 429, true, false);
  eq("AiProviderError keeps the friendly message", wrapped.message, aiUnavailableMessage("extract"));

  console.log("Friendly text:");
  eq("photo message", aiUnavailableMessage("photo"), "Photo reading is unavailable right now. Please try again later or enter the recipe by hand.");
  eq("no em dashes", features.some((f) => aiUnavailableMessage(f).includes(String.fromCharCode(0x2014))), false);

  if (failures) { console.log(`\n${failures} check(s) failed`); process.exit(1); }
  console.log("\nAll checks passed");
}

async function collect() {
  const out: { label: string; feature: AiFeature; status: number; expected: number; text: string; body: { error: string } }[] = [];
  for (const c of cases) {
    for (const feature of features) {
      const res = aiErrorResponse("test", feature, c.err);
      out.push({ label: c.label, feature, status: res.status, expected: c.status, text: c.text, body: await res.json() });
    }
  }
  return out;
}

main();
