// DRAFT: pending John's review
import type { Metadata } from "next";
import Link from "next/link";
import { LegalDoc, LegalSection, PublicShell } from "@/components/shared/PublicShell";
import { LEGAL_LAST_UPDATED, SITE_NAME, SUPPORT_EMAIL } from "@/lib/site";

export const metadata: Metadata = {
  title: "Contact",
  description: `How to reach ${SITE_NAME} for help, feedback or privacy questions.`,
  alternates: { canonical: "/contact" },
};

export default function ContactPage() {
  return (
    <PublicShell>
      <LegalDoc title="Contact us" lastUpdated={LEGAL_LAST_UPDATED}>
        <p>
          {SITE_NAME} is a small personal project. The best way to reach us is by email at{" "}
          <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>. Looking for how-to steps first?
          Try the <Link href="/help">Help page</Link>.
        </p>

        <LegalSection title="What to include">
          <ul>
            <li>The email address on your account.</li>
            <li>What you were trying to do, and what happened instead.</li>
            <li>The page or recipe link, if there is one.</li>
            <li>Your device and browser, for example &ldquo;iPhone, Safari&rdquo;.</li>
            <li>A screenshot, if it helps show the problem.</li>
          </ul>
          <p>Never send your password. We will never ask for it.</p>
        </LegalSection>

        <LegalSection title="When to expect a reply">
          <p>
            We usually reply within a few business days. Replies can take longer on weekends and
            holidays. We can&apos;t offer phone or live chat support.
          </p>
        </LegalSection>

        <LegalSection title="Privacy, data and account requests">
          <p>
            To ask for a copy of your data, report a privacy concern, or report a child under 13
            using the site, email us from the address on your account so we can confirm it&apos;s
            you. You can delete your account yourself in <Link href="/settings">Settings</Link>.
            See the <Link href="/privacy">Privacy Policy</Link> and{" "}
            <Link href="/terms">Terms of Service</Link> for details.
          </p>
        </LegalSection>

        <LegalSection title="Reporting content">
          <p>
            If a public recipe or comment breaks our <Link href="/terms">Terms</Link> or uses your
            copyrighted work without permission, email us the link and a short explanation. For
            copyright claims, say what work you own and how to contact you.
          </p>
        </LegalSection>
      </LegalDoc>
    </PublicShell>
  );
}
