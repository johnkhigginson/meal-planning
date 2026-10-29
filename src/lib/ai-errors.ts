import { NextResponse } from "next/server";

// Provider errors (Gemini 400/403/500, network failures, a missing key) are
// logged on the server and mapped to a friendly message for the user. The raw
// provider text never reaches the client: it can name the provider, the
// endpoint or the key state.

export type AiFeature = "photo" | "document" | "receipt" | "extract";

const MESSAGES: Record<AiFeature, string> = {
  photo: "Photo reading is unavailable right now. Please try again later or enter the recipe by hand.",
  document: "Document import is unavailable right now. Please try again later or add the recipes by hand.",
  receipt: "Receipt scanning is unavailable right now. Please try again later or add the items by hand.",
  extract: "Ingredient extraction is unavailable right now. Please try again later.",
};

export function aiUnavailableMessage(feature: AiFeature): string {
  return MESSAGES[feature];
}

// Thrown by lib code (recipe-ai) after the provider error has been logged.
// The message is already friendly, so callers can show it as is.
export class AiProviderError extends Error {
  constructor(
    message: string,
    readonly providerStatus: number | null,
    readonly quota = false,
    readonly dailyQuota = false
  ) {
    super(message);
    this.name = "AiProviderError";
  }
}

export interface AiErrorInfo {
  // HTTP status of the provider response, or null for a network failure.
  providerStatus: number | null;
  // Provider status word ("INVALID_ARGUMENT") and reason ("API_KEY_INVALID").
  providerCode: string | null;
  reason: string | null;
}

// Pull the structured fields out of a provider error. The Gemini SDK puts the
// provider's JSON body in the error message; parse it for the status and
// reason, and fall back to nothing when it isn't JSON.
export function describeAiError(err: unknown): AiErrorInfo {
  const e = err as { status?: unknown; code?: unknown; message?: unknown } | null;
  let providerStatus: number | null =
    typeof e?.status === "number" ? e.status : typeof e?.code === "number" ? e.code : null;
  let providerCode: string | null = null;
  let reason: string | null = null;

  if (typeof e?.message === "string") {
    try {
      const body = JSON.parse(e.message)?.error;
      if (body && typeof body === "object") {
        if (providerStatus === null && typeof body.code === "number") providerStatus = body.code;
        if (typeof body.status === "string") providerCode = body.status;
        const detail = Array.isArray(body.details)
          ? body.details.find((d: { reason?: unknown }) => typeof d?.reason === "string")
          : null;
        if (detail) reason = detail.reason;
      }
    } catch {
      // Not JSON: a network error or a plain message.
    }
  }
  return { providerStatus, providerCode, reason };
}

// 429 (rate or quota) and 5xx from the provider, and network failures, are
// "try again later": 503. A rejected request or key (4xx) is our fault, not
// the user's: 502.
export function aiErrorStatus(info: AiErrorInfo): 502 | 503 {
  const s = info.providerStatus;
  if (s === null || s === 429 || s === 503) return 503;
  return 502;
}

// Redact anything key-shaped, plus the configured key itself.
function redact(text: string): string {
  let out = text.replace(/AIza[0-9A-Za-z_-]{20,}/g, "[redacted]");
  const key = process.env.GEMINI_API_KEY;
  if (key) out = out.split(key).join("[redacted]");
  return out;
}

// Log what an operator needs (route, statuses, reason) and nothing about the
// request body: no image or base64, no key.
export function logAiError(route: string, err: unknown): AiErrorInfo {
  const info = describeAiError(err);
  const raw = err instanceof Error ? err.message : String(err);
  console.error(
    `[ai] ${route} failed: providerStatus=${info.providerStatus ?? "none"} ` +
      `status=${info.providerCode ?? "none"} reason=${info.reason ?? "none"} ` +
      `message=${redact(raw).slice(0, 300)}`
  );
  return info;
}

// For route catch blocks: log, then answer with the friendly message.
export function aiErrorResponse(route: string, feature: AiFeature, err: unknown): NextResponse {
  const info = logAiError(route, err);
  return NextResponse.json({ error: MESSAGES[feature], code: "ai_unavailable" }, { status: aiErrorStatus(info) });
}

// For a missing GEMINI_API_KEY: the operator sees it in the log, the user sees
// the friendly text.
export function aiNotConfiguredResponse(route: string, feature: AiFeature): NextResponse {
  console.error(`[ai] ${route} failed: GEMINI_API_KEY is not configured`);
  return NextResponse.json({ error: MESSAGES[feature], code: "ai_unavailable" }, { status: 503 });
}
