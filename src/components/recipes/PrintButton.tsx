"use client";

import { Button } from "@/components/ui/button";
import { Printer } from "lucide-react";
import { trackEvent } from "@/lib/analytics";

export function PrintButton({ label = "Print" }: { label?: string }) {
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="print:hidden"
      onClick={() => {
        trackEvent("recipe_print");
        window.print();
      }}
    >
      <Printer className="mr-1.5 h-4 w-4" />
      {label}
    </Button>
  );
}
