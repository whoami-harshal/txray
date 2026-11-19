import Link from "next/link";
import { Logo } from "@/components/logo";
import { SITE } from "@/lib/site";

export function SiteFooter() {
  return (
    <footer className="border-t border-border/60">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-10 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div className="flex items-center gap-3">
          <Logo />
          <span>{SITE.tagline} Free, read-only, built on Helius.</span>
        </div>
        <nav className="flex flex-wrap gap-x-5 gap-y-2">
          <Link href="/checkup" className="hover:text-foreground">
            Checkup
          </Link>
          <Link href="/leaderboard" className="hover:text-foreground">
            Leaderboard
          </Link>
          <Link href="/dashboard" className="hover:text-foreground">
            Demo dashboard
          </Link>
          {SITE.githubUrl && (
            <a href={SITE.githubUrl} target="_blank" rel="noopener noreferrer" className="hover:text-foreground">
              GitHub
            </a>
          )}
          {SITE.xUrl && (
            <a href={SITE.xUrl} target="_blank" rel="noopener noreferrer" className="hover:text-foreground">
              X
            </a>
          )}
        </nav>
      </div>
    </footer>
  );
}
