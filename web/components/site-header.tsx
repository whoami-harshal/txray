import Link from "next/link";
import { SITE } from "@/lib/site";

export function SiteHeader() {
  return (
    <header className="border-b bg-background">
      <div className="mx-auto flex h-14 max-w-4xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link href="/" className="flex shrink-0 items-center gap-2 font-semibold" aria-label={SITE.name}>
          <span aria-hidden className="text-lg">🩺</span>
          <span className="hidden sm:inline">{SITE.name}</span>
        </Link>
        <nav className="flex gap-4 whitespace-nowrap text-sm text-muted-foreground">
          <Link href="/checkup" className="hover:text-foreground">
            Free checkup
          </Link>
          <Link href="/dashboard" className="hover:text-foreground">
            Dashboard
          </Link>
        </nav>
      </div>
    </header>
  );
}
