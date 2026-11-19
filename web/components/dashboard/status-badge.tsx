import { cn } from "@/lib/utils";
import type { TxStatus } from "@/lib/dashboard";

const STYLES: Record<TxStatus, string> = {
  success: "bg-good/10 text-good ring-good/25",
  failed: "bg-bad/10 text-bad ring-bad/25",
  expired: "bg-warn/10 text-warn ring-warn/25",
  unknown: "bg-muted text-muted-foreground ring-border",
  pending: "bg-info/10 text-info ring-info/25",
};

export function StatusBadge({ status }: { status: TxStatus }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset",
        STYLES[status],
      )}
    >
      {status}
    </span>
  );
}
