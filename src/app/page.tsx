import type { Metadata } from "next";
import { Suspense } from "react";
import { getCurrentUser } from "@/lib/auth";
import { Dashboard } from "@/components/shared/Dashboard";
import { LandingPage } from "@/components/shared/LandingPage";
import { PageLoader } from "@/components/shared/PageLoader";
import { SITE_DESCRIPTION, SITE_NAME } from "@/lib/site";

export const dynamic = "force-dynamic";

// og:url only belongs on the landing page, so it is set here, not in the
// layout. The image still comes from app/opengraph-image.tsx.
export const metadata: Metadata = {
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    title: SITE_NAME,
    description: SITE_DESCRIPTION,
    url: "/",
  },
};

export default async function HomePage() {
  const user = await getCurrentUser();

  if (!user) {
    return <LandingPage />;
  }

  // The dashboard's queries stream in behind a spinner. This page has its own
  // boundary because a root loading.tsx would also wrap the public routes and
  // turn their notFound() into a 200.
  return (
    <Suspense fallback={<PageLoader />}>
      <Dashboard userId={user.userId} householdId={user.householdId} name={user.name} />
    </Suspense>
  );
}
