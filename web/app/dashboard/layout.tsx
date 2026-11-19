import Link from "next/link";
import { Logo } from "@/components/logo";
import { isDemoMode } from "@/lib/scope";
import { DashboardNav } from "@/components/dashboard/nav";

export default function DashboardLayout({ children }: LayoutProps<"/dashboard">) {
  return (
    <div className="flex-1 bg-zinc-50/60">
      {isDemoMode() && (
        <div className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-center text-sm text-amber-900">
          <span className="font-medium">Demo data.</span> This dashboard shows sample transactions so you can see what
          you&apos;d get with the SDK.{" "}
          <Link href="/checkup" className="underline underline-offset-2">
            Run a real checkup on any program →
          </Link>
        </div>
      )}
      <header className="sticky top-0 z-10 border-b bg-background/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4 sm:gap-6 sm:px-6">
          <Logo />
          <DashboardNav />
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">{children}</main>
    </div>
  );
}
