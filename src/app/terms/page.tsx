// DRAFT: pending John's review
import type { Metadata } from "next";
import Link from "next/link";
import { LegalDoc, LegalSection, PublicShell } from "@/components/shared/PublicShell";
import { LEGAL_LAST_UPDATED, SITE_NAME, SUPPORT_EMAIL } from "@/lib/site";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: `The rules for using ${SITE_NAME}.`,
  alternates: { canonical: "/terms" },
};

export default function TermsPage() {
  return (
    <PublicShell>
      <LegalDoc title="Terms of Service" lastUpdated={LEGAL_LAST_UPDATED}>
        <p>
          These terms cover your use of {SITE_NAME} (mylemonkitchen.com), a personal project run
          from the United States. By creating an account or using the site, you agree to them. If
          you don&apos;t agree, please don&apos;t use the site. Our{" "}
          <Link href="/privacy">Privacy Policy</Link> explains how we handle your data.
        </p>

        <LegalSection title="Your account">
          <ul>
            <li>You must be at least 13 years old to use {SITE_NAME}.</li>
            <li>Give accurate information and keep your password safe.</li>
            <li>You are responsible for what happens under your account.</li>
            <li>
              People you invite to your household can see and change the household&apos;s recipes,
              pantry, plans and lists. Only invite people you trust.
            </li>
          </ul>
        </LegalSection>

        <LegalSection title="Your content">
          <p>
            You own the recipes, photos, notes and other content you add. You give us a
            non-exclusive, worldwide, royalty-free license to store, copy, process, display and
            adapt that content only as needed to run and improve the service. This includes
            sending uploads to our providers, such as Google Gemini, to read recipes and receipts.
          </p>
          <p>
            When you publish a cookbook to the public blog or post a public comment, you also let
            us show it to anyone, include it in search results and feeds, and let visitors read,
            print and share links to it. You can unpublish or delete it at any time. Copies others
            already made, or that search engines cached, may take time to disappear or may not be
            under our control.
          </p>
          <p>
            Only add content you have the right to use. Many recipes, photos and cookbook pages are
            protected by copyright. Importing a recipe for your own private use is different from
            republishing someone else&apos;s text or photos on your public blog. You are responsible
            for what you publish.
          </p>
        </LegalSection>

        <LegalSection title="Acceptable use">
          <p>Don&apos;t use {SITE_NAME} to:</p>
          <ul>
            <li>Break the law or infringe anyone&apos;s rights, including copyright.</li>
            <li>Post content that is hateful, harassing, sexually explicit, violent or misleading.</li>
            <li>Send spam or post ads in comments or recipes.</li>
            <li>Upload malware, or try to access accounts or data that aren&apos;t yours.</li>
            <li>Scrape, overload or disrupt the site, or get around its limits and security checks.</li>
            <li>Pretend to be someone else.</li>
          </ul>
          <p>
            We may remove content or suspend or close accounts that break these rules, with or
            without notice.
          </p>
        </LegalSection>

        <LegalSection title="Food safety, allergens and nutrition">
          <p>
            Recipes on {SITE_NAME} come from users, websites and automated tools. We don&apos;t test
            or check them. Imported or photo-read recipes may contain mistakes in amounts,
            temperatures, times or ingredients.
          </p>
          <ul>
            <li>Use your own judgment and follow safe food handling and cooking temperatures.</li>
            <li>
              Always check ingredient labels for allergens. Don&apos;t rely on a recipe, tag or
              pantry match to tell you a dish is safe for an allergy or diet.
            </li>
            <li>
              Any nutrition or dietary information is an estimate, not medical advice. Talk to a
              doctor or registered dietitian about your health needs.
            </li>
          </ul>
          <p>Prices and product details from stores are estimates and may be out of date.</p>
        </LegalSection>

        <LegalSection title="The service">
          <p>
            {SITE_NAME} is provided &ldquo;as is&rdquo; and &ldquo;as available&rdquo;. We may change,
            pause or stop any feature, and we can&apos;t promise the site will always be available
            or free of errors. Keep your own copy of anything you can&apos;t afford to lose. To the
            fullest extent the law allows, we disclaim all warranties, including merchantability,
            fitness for a particular purpose and non-infringement.
          </p>
        </LegalSection>

        <LegalSection title="Limitation of liability">
          <p>
            To the fullest extent the law allows, {SITE_NAME} and the people who run it are not
            liable for any indirect, incidental, special, consequential or punitive damages, or
            for lost data, profits or goodwill, arising from your use of the site or any recipe or
            content on it. Our total liability for any claim is limited to the greater of the
            amount you paid us in the 12 months before the claim, or US $50. Some places don&apos;t
            allow these limits, so they may not fully apply to you.
          </p>
          <p>
            You agree to cover our reasonable losses and costs if a claim against us arises from
            content you post or your breach of these terms.
          </p>
        </LegalSection>

        <LegalSection title="Ending your account">
          <p>
            You can stop using {SITE_NAME} and delete your account at any time in{" "}
            <Link href="/settings">Settings</Link>. We may suspend or close your account if you
            break these terms or if we shut the service down. Sections that by their nature should
            last, such as content licenses for already-public posts, disclaimers and limits on
            liability, continue after your account ends.
          </p>
        </LegalSection>

        <LegalSection title="Changes to these terms">
          <p>
            We may update these terms. When we do, we will change the date at the top, and for
            significant changes we will let you know in the app or by email. If you keep using the
            site after changes take effect, you accept the new terms.
          </p>
        </LegalSection>

        <LegalSection title="Governing law">
          <p>
            These terms are governed by the laws of the State of [STATE], United States, without
            regard to its conflict of law rules. Any dispute will be handled in the state or federal
            courts located in [COUNTY], [STATE], unless the law where you live requires otherwise.
          </p>
        </LegalSection>

        <LegalSection title="Contact">
          <p>
            Questions about these terms? Email{" "}
            <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a> or see our{" "}
            <Link href="/contact">contact page</Link>.
          </p>
        </LegalSection>
      </LegalDoc>
    </PublicShell>
  );
}
