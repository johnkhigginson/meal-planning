import { Loader2 } from "lucide-react";

export function PageLoader() {
  return (
    <div className="flex flex-1 items-center justify-center py-32">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  );
}
