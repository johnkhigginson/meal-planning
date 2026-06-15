"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Heart, Loader2 } from "lucide-react";
import { trackEvent } from "@/lib/analytics";

// Subtle "Follow this blog" control for a published cookbook. Logged-out
// visitors are nudged to sign in (returning to the blog afterwards); signed-in
// visitors toggle their subscription. Followers are emailed on new recipes.
export function FollowButton({ bookId, slug }: { bookId: number; slug: string }) {
  const { status } = useSession();
  const router = useRouter();
  const loggedIn = status === "authenticated";

  const [following, setFollowing] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch(`/api/blog/follow?bookId=${bookId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setFollowing(!!d.following))
      .catch(() => {});
  }, [bookId, status]);

  async function toggle() {
    if (!loggedIn) {
      router.push(`/login?callbackUrl=${encodeURIComponent(`/blog/${slug}`)}`);
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/blog/follow${following ? `?bookId=${bookId}` : ""}`, {
        method: following ? "DELETE" : "POST",
        headers: following ? undefined : { "Content-Type": "application/json" },
        body: following ? undefined : JSON.stringify({ bookId }),
      });
      if (res.ok) {
        const d = await res.json();
        setFollowing(!!d.following);
        trackEvent(d.following ? "blog_follow" : "blog_unfollow", { book_id: bookId });
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button
      variant={following ? "secondary" : "outline"}
      size="sm"
      onClick={toggle}
      disabled={busy}
      title={loggedIn ? (following ? "Unfollow this blog" : "Follow for new-recipe emails") : "Sign in to follow"}
    >
      {busy ? (
        <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
      ) : (
        <Heart className={`mr-1.5 h-3.5 w-3.5 ${following ? "fill-current" : ""}`} />
      )}
      {loggedIn ? (following ? "Following" : "Follow") : "Sign in to follow"}
    </Button>
  );
}
