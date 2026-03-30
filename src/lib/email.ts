import { ServerClient } from "postmark";

function getClient() {
  const apiKey = process.env.POSTMARK_API_KEY;
  if (!apiKey) throw new Error("POSTMARK_API_KEY not configured");
  return new ServerClient(apiKey);
}

export async function sendHouseholdInviteEmail(
  toEmail: string,
  inviterName: string,
  householdName: string
) {
  const client = getClient();
  const signUpUrl = `https://mylemonkitchen.com/register`;

  await client.sendEmail({
    From: "hello@mylemonkitchen.com",
    To: toEmail,
    Subject: `${inviterName} invited you to ${householdName}`,
    HtmlBody: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 20px;">
        <div style="text-align: center; margin-bottom: 32px;">
          <span style="font-size: 24px; font-weight: 700;">My Lemon Kitchen</span>
        </div>
        <h1 style="font-size: 20px; font-weight: 600; margin: 0 0 16px;">You've been invited!</h1>
        <p style="color: #555; line-height: 1.6; margin: 0 0 24px;">
          <strong>${inviterName}</strong> has invited you to join <strong>${householdName}</strong> on My Lemon Kitchen.
          You'll share recipes, pantry items, meal plans, and grocery lists.
        </p>
        <div style="text-align: center; margin: 32px 0;">
          <a href="${signUpUrl}" style="display: inline-block; background: #000; color: #FFF700; padding: 12px 32px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 14px;">
            Create Your Account
          </a>
        </div>
        <p style="color: #999; font-size: 13px; line-height: 1.5;">
          Sign up with this email address (<strong>${toEmail}</strong>) and you'll automatically join the household.
        </p>
        <hr style="border: none; border-top: 1px solid #eee; margin: 32px 0;" />
        <p style="color: #bbb; font-size: 12px; text-align: center;">
          My Lemon Kitchen — Meal planning, squeezed simple.
        </p>
      </div>
    `,
    TextBody: `${inviterName} invited you to ${householdName} on My Lemon Kitchen.\n\nYou'll share recipes, pantry items, meal plans, and grocery lists.\n\nSign up at ${signUpUrl} with this email (${toEmail}) and you'll automatically join the household.`,
    MessageStream: "outbound",
  });
}
