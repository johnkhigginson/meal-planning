import { getCurrentUserId } from "@/lib/auth";
import { Dashboard } from "@/components/shared/Dashboard";
import { LandingPage } from "@/components/shared/LandingPage";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const userId = await getCurrentUserId();

  if (!userId) {
    return <LandingPage />;
  }

  return <Dashboard userId={userId} />;
}
