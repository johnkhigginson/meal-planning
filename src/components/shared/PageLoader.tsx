import { Loader2 } from "lucide-react";

export function PageLoader() {
  return (
    <div role="status" className="flex flex-1 items-center justify-center py-32">
      <Loader2 className="h-6 w-6 animate-spin text-primary" aria-hidden="true" />
      <span className="sr-only">Loading</span>
    </div>
  );
}
