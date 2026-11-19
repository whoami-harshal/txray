import Link from "next/link";
import { Logo } from "@/components/logo";

export function SiteHeader() {
  return (
    <header className="border-b bg-background">
      <div className="mx-auto flex h-14 max-w-4xl items-center justify-between gap-4 px-4 sm:px-6">
        <Logo />
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
