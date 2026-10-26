import { createAuthToken } from "@/lib/auth-tokens";
import { sendVerificationEmail } from "@/lib/email";
import { getSiteUrl } from "@/lib/site";

const VERIFY_TTL_MS = 24 * 60 * 60_000; // 24 hours

// Issue a fresh verification link and email it. Returns whether an email was
// sent (false when Postmark isn't configured).
export async function sendEmailVerification(user: {
  id: number;
  name: string;
  email: string;
}): Promise<boolean> {
  const token = await createAuthToken(user.id, "VERIFY_EMAIL", VERIFY_TTL_MS);
  return sendVerificationEmail(user.email, user.name, `${getSiteUrl()}/verify-email?token=${token}`);
}
