interface TurnstileVerifyResponse {
  success: boolean;
  "error-codes"?: string[];
}

/**
 * Server-side validation of a Cloudflare Turnstile token.
 *
 * When TURNSTILE_SECRET_KEY is not set the check is skipped (returns true) so
 * the app keeps working before keys are configured. The honeypot and email
 * normalization defenses still apply in that state. Once the secret is set,
 * verification is enforced and fails closed on any error.
 */
export async function verifyTurnstile(
  token: unknown,
  remoteip?: string
): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) {
    console.warn(
      "[turnstile] TURNSTILE_SECRET_KEY not set; skipping CAPTCHA verification"
    );
    return true;
  }

  if (typeof token !== "string" || token.length === 0) return false;

  const form = new URLSearchParams();
  form.append("secret", secret);
  form.append("response", token);
  if (remoteip) form.append("remoteip", remoteip);

  try {
    const res = await fetch(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: form,
      }
    );
    const data = (await res.json()) as TurnstileVerifyResponse;
    return data.success === true;
  } catch (err) {
    console.error("[turnstile] verification request failed", err);
    return false;
  }
}
