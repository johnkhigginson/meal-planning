"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Share2, Check, Copy, Loader2 } from "lucide-react";

export function ShareRecipeButton({ recipeId }: { recipeId: number }) {
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);
  const [copied, setCopied] = useState(false);

  async function share() {
    setSharing(true);
    const res = await fetch("/api/recipes/share", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ recipeId }),
    });
    if (res.ok) {
      const data = await res.json();
      setShareUrl(data.url);
      navigator.clipboard.writeText(data.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
    setSharing(false);
  }

  if (shareUrl) {
    return (
      <Button variant="outline" size="sm" onClick={() => { navigator.clipboard.writeText(shareUrl); setCopied(true); setTimeout(() => setCopied(false), 2000); }}>
        {copied ? <Check className="mr-1 h-4 w-4" /> : <Copy className="mr-1 h-4 w-4" />}
        {copied ? "Copied!" : "Copy Link"}
      </Button>
    );
  }

  return (
    <Button variant="outline" size="sm" onClick={share} disabled={sharing}>
      {sharing ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Share2 className="mr-1 h-4 w-4" />}
      Share
    </Button>
  );
}
