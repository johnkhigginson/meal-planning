import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

// The "nothing here yet" panel: an icon, a title, one sentence on what the
// page is for, and the action that gets someone started.
export function EmptyState({
  icon: Icon,
  title,
  description,
  children,
  className,
}: {
  icon: LucideIcon;
  title: string;
  description: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center gap-3 rounded-3xl border-[1.5px] border-dashed border-input px-6 py-12 text-center",
        className
      )}
    >
      <div className="flex size-12 items-center justify-center rounded-2xl bg-brand-soft text-primary">
        <Icon className="h-6 w-6" />
      </div>
      <p className="font-heading text-xl">{title}</p>
      <p className="max-w-md text-sm text-muted-foreground">{description}</p>
      {children && <div className="mt-1 flex flex-wrap justify-center gap-2">{children}</div>}
    </div>
  );
}
