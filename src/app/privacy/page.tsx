// DRAFT: pending John's review
import type { Metadata } from "next";
import Link from "next/link";
import { LegalDoc, LegalSection, PublicShell } from "@/components/shared/PublicShell";
import { LEGAL_LAST_UPDATED, SITE_NAME, SUPPORT_EMAIL } from "@/lib/site";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: `How ${SITE_NAME} collects, uses and protects your information.`,
  alternates: { canonical: "/privacy" },
};

export default function PrivacyPage() {
  return (
    <PublicShell>
      <LegalDoc title="Privacy Policy" lastUpdated={LEGAL_LAST_UPDATED}>
        <p>
          {SITE_NAME} (mylemonkitchen.com) is a personal project run from the United States. This
          policy explains what we collect when you use the site, why, who helps us run it, and the
          choices you have.{" "}
          {SUPPORT_EMAIL ? (
            <>
              If you have questions, email <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>.
            </>
          ) : (
            <>
              If you have questions, contact us through the <Link href="/contact">Contact page</Link>.
            </>
          )}
        </p>

        <LegalSection title="What we collect">
          <ul>
            <li>
              <strong>Account info.</strong> Your name, email address and a hashed copy of your
              password. We never store your password in plain text.
            </li>
            <li>
              <strong>Your kitchen data.</strong> Recipes, cookbooks, notes, comments, pantry
              items, meal plans, grocery lists, stores and household members you add.
            </li>
            <li>
              <strong>Uploads.</strong> Photos of recipes or cookbook pages, receipts, documents
              and recipe images you upload.
            </li>
            <li>
              <strong>Links you import.</strong> When you import a recipe from a website, we fetch
              that page and keep the recipe details we read from it.
            </li>
            <li>
              <strong>Usage and device data.</strong> Pages viewed, basic device and browser info,
              and approximate location from your IP address, collected by Google Analytics and our
              hosting logs.
            </li>
          </ul>
        </LegalSection>

        <LegalSection title="How we use it">
          <ul>
            <li>To run the app: store your recipes, match them to your pantry, build plans and lists.</li>
            <li>To share what you choose to share with your household, private links or your public blog.</li>
            <li>To send account emails, such as verification, password resets and comment notices.</li>
            <li>To keep the service secure, prevent spam and abuse, and fix problems.</li>
            <li>To understand which features people use so we can improve them.</li>
          </ul>
          <p>We do not sell your personal information, and we do not use it for targeted advertising.</p>
        </LegalSection>

        <LegalSection title="Services that help us run the site">
          <p>We share data with these providers only as needed for them to do their job:</p>
          <ul>
            <li>
              <strong>Google Gemini.</strong>{" "}When you upload a photo, receipt or document, or ask
              the app to read a recipe, the image or text is sent to Google&apos;s Gemini API to
              pull out recipes, ingredients or items. Don&apos;t upload anything you wouldn&apos;t
              want processed this way, such as photos showing personal details.
            </li>
            <li>
              <strong>Postmark.</strong> Sends our emails. It receives your email address and the
              message content.
            </li>
            <li>
              <strong>Google Analytics.</strong>{" "}Measures site traffic using cookies and similar
              technology. See Google&apos;s privacy policy for how it handles data.
            </li>
            <li>
              <strong>Cloudflare Turnstile.</strong> Checks that sign-ups come from people, not
              bots. It may collect device and browser signals to do this.
            </li>
            <li>
              <strong>Hosting and store price lookups.</strong>{" "}Our hosting and database providers
              store the data above. If you use store pricing, ingredient names and a store location
              are sent to the store&apos;s API, not your account details.
            </li>
          </ul>
          <p>We may also share information if the law requires it, or to protect the safety of our users or the service.</p>
        </LegalSection>

        <LegalSection title="Cookies">
          <p>
            We use a sign-in cookie to keep you logged in. It is required for the app to work.
            Google Analytics and Cloudflare Turnstile also set cookies or use similar storage. You
            can block or clear cookies in your browser, but you will need to sign in again and some
            features may not work.
          </p>
        </LegalSection>

        <LegalSection title="Public content">
          <p>
            Cookbooks you publish appear on the public recipe blog, and anyone can read them.
            Comments you post on a public recipe show your name. Private share links work for
            anyone who has the link. Unpublish a cookbook or turn off a share link to stop sharing.
          </p>
        </LegalSection>

        <LegalSection title="How long we keep it, and deleting your account">
          <p>
            We keep your data while your account is open. You can delete your account at any time
            in <Link href="/settings">Settings</Link>. When you do, we delete your account
            information. If you are the last member of your household, we also delete the
            household and everything in it. If others remain, the shared household data stays
            with them, and recipes you wrote in their cookbooks stay without your name.
          </p>
          <p>
            Copies may remain in backups and logs for a limited time before they are overwritten.
            We may keep some records longer if the law requires it. To ask for deletion or a copy
            of your data,{" "}
            {SUPPORT_EMAIL ? (
              <>
                email <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>.
              </>
            ) : (
              <>
                contact us through the <Link href="/contact">Contact page</Link>.
              </>
            )}
          </p>
        </LegalSection>

        <LegalSection title="Security">
          <p>
            We use reasonable safeguards such as encrypted connections and hashed passwords. No
            system is perfectly secure, so use a strong password you don&apos;t use elsewhere.
          </p>
        </LegalSection>

        <LegalSection title="Children">
          <p>
            {SITE_NAME} is not for children under 13, and we do not knowingly collect their
            information. If you believe a child under 13 has created an account, contact us and we
            will delete it.
          </p>
        </LegalSection>

        <LegalSection title="Your choices">
          <p>
            You can view and edit most of your data in the app, delete your account in Settings, and
            ask us about anything else by email. Depending on where you live, you may have extra
            rights to access, correct or delete your data. We will honor those requests as the law
            requires.
          </p>
        </LegalSection>

        <LegalSection title="Changes to this policy">
          <p>
            We may update this policy. When we do, we will change the date at the top, and for
            significant changes we will let you know in the app or by email.
          </p>
        </LegalSection>

        <LegalSection title="Contact">
          <p>
            {SUPPORT_EMAIL ? (
              <>
                Questions about privacy? Email{" "}
                <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a> or see our{" "}
                <Link href="/contact">contact page</Link>.
              </>
            ) : (
              <>
                Questions about privacy? Contact us through the{" "}
                <Link href="/contact">Contact page</Link>.
              </>
            )}
          </p>
        </LegalSection>
      </LegalDoc>
    </PublicShell>
  );
}
