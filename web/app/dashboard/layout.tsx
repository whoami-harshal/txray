import Link from "next/link";
import { DashboardNav } from "@/components/dashboard/nav";

export default function DashboardLayout({ children }: LayoutProps<"/dashboard">) {
  return (
    <div className="flex-1 bg-zinc-50/60">
      <header className="sticky top-0 z-10 border-b bg-background/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4 sm:gap-6 sm:px-6">
          <Link href="/dashboard" className="flex shrink-0 items-center gap-2 font-semibold" aria-label="Transaction Doctor">
            <span aria-hidden className="text-lg">🩺</span>
            <span className="hidden sm:inline">Transaction Doctor</span>
          </Link>
          <DashboardNav />
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">{children}</main>
    </div>
  );
}
