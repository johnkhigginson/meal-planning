import { getCurrentUser } from "@/lib/auth";
import { Dashboard } from "@/components/shared/Dashboard";
import { LandingPage } from "@/components/shared/LandingPage";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const user = await getCurrentUser();

  if (!user) {
    return <LandingPage />;
  }

  return <Dashboard userId={user.userId} householdId={user.householdId} name={user.name} />;
}
