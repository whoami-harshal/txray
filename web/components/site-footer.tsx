import Link from "next/link";
import { SITE } from "@/lib/site";

export function SiteFooter() {
  return (
    <footer className="border-t">
      <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-3 px-4 py-6 text-sm text-muted-foreground sm:px-6">
        <span>
          {SITE.name} · built on Helius + Supabase · free to use
        </span>
        <nav className="flex gap-4">
          <Link href="/checkup" className="hover:text-foreground">
            Checkup
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
