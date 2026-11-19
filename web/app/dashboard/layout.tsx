import Link from "next/link";
import { Logo } from "@/components/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { isDemoMode } from "@/lib/scope";
import { DashboardNav } from "@/components/dashboard/nav";

export default function DashboardLayout({ children }: LayoutProps<"/dashboard">) {
  return (
    <div className="flex-1 bg-surface">
      {isDemoMode() && (
        <div className="border-b border-warn/25 bg-warn/10 px-4 py-2 text-center text-sm text-warn">
          <span className="font-medium">Demo data.</span> This dashboard shows sample transactions so you can see what
          you&apos;d get with the SDK.{" "}
          <Link href="/checkup" className="underline underline-offset-2">
            Run a real checkup on any program →
          </Link>
        </div>
      )}
      <header className="sticky top-0 z-10 border-b border-border/60 bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4 sm:gap-6 sm:px-6">
          <Logo />
          <DashboardNav />
          <div className="ml-auto flex items-center gap-2">
            <Link href="/checkup" className="hidden rounded-lg px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground sm:inline">
              Free checkup
            </Link>
            <ThemeToggle />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">{children}</main>
    </div>
  );
}
