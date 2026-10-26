import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

// The "optional" pill after an ingredient. It brings its own leading space so
// the text reads "(for serving) optional" when copied or read aloud, not
// "(for serving)optional". The margin alone only adds visual room.
export function OptionalBadge({ className }: { className?: string }) {
  return (
    <>
      {" "}
      <Badge variant="secondary" className={cn("ml-1 text-xs", className)}>
        optional
      </Badge>
    </>
  );
}
