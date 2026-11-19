import { Suspense } from "react";
import Link from "next/link";
import type { Metadata } from "next";
import { connection } from "next/server";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { CheckupForm } from "@/components/checkup/checkup-form";
import { ScoreGauge } from "@/components/score-gauge";
import { getRecentCheckups } from "@/lib/checkup/store";
import { displayName } from "@/lib/programs";
import { pct } from "@/lib/format";

export const metadata: Metadata = {
  title: "Free Solana transaction checkup",
  description:
    "Paste any Solana program or wallet and get an instant health report: failure rate, why transactions fail, fees and compute waste.",
};

export default function CheckupPage() {
  return (
    <>
      <SiteHeader />
      <main className="relative flex-1 overflow-hidden">
        <div aria-hidden className="bg-grid absolute inset-x-0 top-0 h-[480px]" />
        <div aria-hidden className="glow absolute inset-x-0 top-0 h-[480px]" />
        <div className="relative mx-auto w-full max-w-2xl px-4 py-16 sm:px-6 sm:py-24">
          <h1 className="text-3xl font-semibold tracking-tight sm:text-5xl">
            Free transaction <span className="text-gradient">checkup</span>
          </h1>
          <p className="mt-4 text-muted-foreground">
            Paste any Solana program ID or wallet. We read its last 500 transactions and tell you how many failed, why,
            and how much compute and fees are being wasted.
          </p>
          <div className="mt-8">
            <CheckupForm size="lg" />
          </div>
          <Suspense fallback={null}>
            <RecentCheckups />
          </Suspense>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}

async function RecentCheckups() {
  await connection(); // always fresh
  let recent;
  try {
    recent = await getRecentCheckups(6);
  } catch {
    return null; // nice-to-have: never break the page over it
  }
  if (recent.length === 0) return null;
  return (
    <section className="mt-14">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-muted-foreground">Recently checked programs</h2>
        <Link href="/leaderboard" className="text-sm text-brand hover:underline">
          Leaderboard →
        </Link>
      </div>
      <ul className="mt-3 divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card/60 backdrop-blur">
        {recent.map((r) => (
          <li key={r.slug}>
            <Link href={`/r/${r.slug}`} className="flex items-center gap-4 px-4 py-3 transition hover:bg-muted/40">
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{displayName(r.address)}</div>
                <div className="truncate font-mono text-xs text-muted-foreground">{r.address}</div>
              </div>
              <span className="hidden text-sm text-muted-foreground tabular-nums sm:inline">{pct(r.failureRate)} failed</span>
              <ScoreGauge score={r.score} size={44} label="" />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
