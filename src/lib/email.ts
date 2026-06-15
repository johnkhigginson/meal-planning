import { ServerClient } from "postmark";

function getClient() {
  const apiKey = process.env.POSTMARK_API_KEY;
  if (!apiKey) throw new Error("POSTMARK_API_KEY not configured");
  return new ServerClient(apiKey);
}

export async function sendCommentNotificationEmail(opts: {
  toEmail: string;
  commenterName: string;
  recipeName: string;
  commentBody: string;
  recipeUrl: string;
}) {
  const client = getClient();
  const { toEmail, commenterName, recipeName, commentBody, recipeUrl } = opts;
  const safeBody = commentBody.length > 600 ? commentBody.slice(0, 600) + "…" : commentBody;

  await client.sendEmail({
    From: "hello@mylemonkitchen.com",
    To: toEmail,
    Subject: `New comment on “${recipeName}”`,
    HtmlBody: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 20px;">
        <div style="text-align: center; margin-bottom: 24px;">
          <span style="font-size: 24px; font-weight: 700;">My Lemon Kitchen</span>
        </div>
        <h1 style="font-size: 18px; font-weight: 600; margin: 0 0 8px;">New comment on “${recipeName}”</h1>
        <p style="color: #555; margin: 0 0 16px;"><strong>${commenterName}</strong> wrote:</p>
        <blockquote style="margin: 0 0 24px; padding: 12px 16px; background: #f7f7f7; border-left: 3px solid #ddd; color: #333; white-space: pre-wrap;">${safeBody}</blockquote>
        <div style="text-align: center; margin: 24px 0;">
          <a href="${recipeUrl}" style="display: inline-block; background: #000; color: #FFF700; padding: 12px 32px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 14px;">
            View &amp; reply
          </a>
        </div>
        <hr style="border: none; border-top: 1px solid #eee; margin: 32px 0;" />
        <p style="color: #bbb; font-size: 12px; text-align: center;">My Lemon Kitchen</p>
      </div>
    `,
    TextBody: `New comment on "${recipeName}" by ${commenterName}:\n\n${safeBody}\n\nView & reply: ${recipeUrl}`,
    MessageStream: "outbound",
  });
}

// Notify a blog follower that a new recipe was posted to a cookbook they follow.
export async function sendNewRecipeEmail(opts: {
  toEmail: string;
  blogName: string;
  recipeName: string;
  recipeUrl: string;
  blogUrl: string;
  imageUrl?: string | null;
}) {
  const client = getClient();
  const { toEmail, blogName, recipeName, recipeUrl, blogUrl, imageUrl } = opts;

  await client.sendEmail({
    From: "hello@mylemonkitchen.com",
    To: toEmail,
    Subject: `New recipe on ${blogName}: “${recipeName}”`,
    HtmlBody: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 20px;">
        <div style="text-align: center; margin-bottom: 24px;">
          <span style="font-size: 24px; font-weight: 700;">${blogName}</span>
        </div>
        <h1 style="font-size: 18px; font-weight: 600; margin: 0 0 8px;">New recipe: “${recipeName}”</h1>
        ${imageUrl ? `<img src="${imageUrl}" alt="${recipeName}" style="width: 100%; max-height: 260px; object-fit: cover; border-radius: 12px; margin: 8px 0 16px;" />` : ""}
        <p style="color: #555; margin: 0 0 16px;">A new recipe was just posted to ${blogName}.</p>
        <div style="text-align: center; margin: 24px 0;">
          <a href="${recipeUrl}" style="display: inline-block; background: #000; color: #FFF700; padding: 12px 32px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 14px;">
            View recipe
          </a>
        </div>
        <hr style="border: none; border-top: 1px solid #eee; margin: 32px 0;" />
        <p style="color: #bbb; font-size: 12px; text-align: center;">
          You're receiving this because you follow ${blogName}.
          <br />Manage your follows at <a href="${blogUrl}" style="color:#999;">${blogName}</a>.
        </p>
      </div>
    `,
    TextBody: `New recipe on ${blogName}: "${recipeName}"\n\n${recipeUrl}\n\nYou're receiving this because you follow ${blogName}. Manage your follows at ${blogUrl}.`,
    MessageStream: "outbound",
  });
}

// Invite someone WITHOUT an account to collaborate on a cookbook. The link
// takes them to sign up and accept the invitation.
export async function sendCookbookInviteEmail(opts: {
  toEmail: string;
  inviterName: string;
  bookName: string;
  acceptUrl: string;
}) {
  const client = getClient();
  const { toEmail, inviterName, bookName, acceptUrl } = opts;

  await client.sendEmail({
    From: "hello@mylemonkitchen.com",
    To: toEmail,
    Subject: `${inviterName} invited you to collaborate on “${bookName}”`,
    HtmlBody: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 20px;">
        <div style="text-align: center; margin-bottom: 32px;">
          <span style="font-size: 24px; font-weight: 700;">My Lemon Kitchen</span>
        </div>
        <h1 style="font-size: 20px; font-weight: 600; margin: 0 0 16px;">You've been invited to collaborate!</h1>
        <p style="color: #555; line-height: 1.6; margin: 0 0 24px;">
          <strong>${inviterName}</strong> invited you to help with the cookbook
          <strong>${bookName}</strong> on My Lemon Kitchen. You'll be able to add and edit
          recipes and be credited as an author — all while keeping your own kitchen separate.
        </p>
        <div style="text-align: center; margin: 32px 0;">
          <a href="${acceptUrl}" style="display: inline-block; background: #000; color: #FFF700; padding: 12px 32px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 14px;">
            Create your account &amp; accept
          </a>
        </div>
        <p style="color: #999; font-size: 13px; line-height: 1.5;">
          Already have an account? Open the link above while signed in and you can accept right away.
        </p>
        <hr style="border: none; border-top: 1px solid #eee; margin: 32px 0;" />
        <p style="color: #bbb; font-size: 12px; text-align: center;">
          My Lemon Kitchen — Meal planning, squeezed simple.
        </p>
      </div>
    `,
    TextBody: `${inviterName} invited you to collaborate on the cookbook "${bookName}" on My Lemon Kitchen.\n\nCreate your account and accept: ${acceptUrl}\n\nAlready have an account? Open the link while signed in to accept.`,
    MessageStream: "outbound",
  });
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
