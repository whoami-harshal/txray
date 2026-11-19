import Link from "next/link";
import { ScanLine } from "lucide-react";
import { SITE } from "@/lib/site";

export function Logo() {
  return (
    <Link href="/" className="flex shrink-0 items-center gap-2 font-semibold" aria-label={SITE.name}>
      <span aria-hidden className="flex size-7 items-center justify-center rounded-md bg-foreground text-background">
        <ScanLine className="size-4" />
      </span>
      <span className="hidden sm:inline">{SITE.name}</span>
    </Link>
  );
}
