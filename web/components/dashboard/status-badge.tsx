import { cn } from "@/lib/utils";
import type { TxStatus } from "@/lib/dashboard";

const STYLES: Record<TxStatus, string> = {
  success: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  failed: "bg-red-50 text-red-700 ring-red-600/20",
  expired: "bg-amber-50 text-amber-700 ring-amber-600/20",
  unknown: "bg-zinc-100 text-zinc-600 ring-zinc-500/20",
  pending: "bg-sky-50 text-sky-700 ring-sky-600/20",
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
