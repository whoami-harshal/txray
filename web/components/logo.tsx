import Link from "next/link";
import { ScanLine } from "lucide-react";
import { SITE } from "@/lib/site";

export function Logo() {
  return (
    <Link href="/" className="group flex shrink-0 items-center gap-2 font-semibold tracking-tight" aria-label={SITE.name}>
      <span
        aria-hidden
        className="relative flex size-7 items-center justify-center overflow-hidden rounded-lg bg-gradient-to-br from-brand to-brand-2 text-background shadow-[0_0_16px_-4px_var(--brand)]"
      >
        <ScanLine className="size-4" strokeWidth={2.5} />
      </span>
      <span className="hidden sm:inline">{SITE.name}</span>
    </Link>
  );
}
