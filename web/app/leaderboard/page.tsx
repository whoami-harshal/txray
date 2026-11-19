import { Suspense } from "react";
import Link from "next/link";
import type { Metadata } from "next";
import { connection } from "next/server";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { ScoreGauge } from "@/components/score-gauge";
import { Skeleton } from "@/components/ui/skeleton";
import { getLeaderboard } from "@/lib/checkup/store";
import { displayName, programName } from "@/lib/programs";
import { failureTone, int, pct, TONE_TEXT } from "@/lib/format";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Leaderboard",
  description: "Solana programs ranked by transaction health score: failure rate, failure reasons and compute waste.",
};

export default function LeaderboardPage() {
  return (
    <>
      <SiteHeader />
      <main className="relative flex-1 overflow-hidden">
        <div aria-hidden className="bg-grid absolute inset-x-0 top-0 h-[360px]" />
        <div className="relative mx-auto w-full max-w-4xl px-4 py-14 sm:px-6 sm:py-20">
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Leaderboard</h1>
          <p className="mt-3 max-w-2xl text-muted-foreground">
            Every program someone has checked, ranked by health score. Scores use each program&apos;s last 500
            on-chain transactions, including bot traffic, so treat them as a signal, not a verdict.
          </p>
          <Suspense fallback={<Skeleton className="mt-10 h-[480px] rounded-2xl" />}>
            <Board />
          </Suspense>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}

async function Board() {
  await connection();
  const rows = await getLeaderboard(100);
  if (rows.length === 0) {
    return (
      <div className="mt-10 rounded-2xl border border-dashed border-border p-12 text-center">
        <p className="font-medium">No programs checked yet</p>
        <Link href="/checkup" className="mt-2 inline-block text-sm text-brand hover:underline">
          Be the first: run a checkup →
        </Link>
      </div>
    );
  }
  return (
    <div className="mt-10 overflow-hidden rounded-2xl border border-border bg-card/60 backdrop-blur">
      <div className="grid grid-cols-[2rem_1fr_auto] items-center gap-4 border-b border-border px-5 py-3 text-xs text-muted-foreground sm:grid-cols-[2rem_1fr_7rem_6rem_auto]">
        <span>#</span>
        <span>Program</span>
        <span className="hidden text-right sm:block">Failed</span>
        <span className="hidden text-right sm:block">Txs</span>
        <span className="text-right">Score</span>
      </div>
      <ol>
        {rows.map((r, i) => (
          <li key={r.slug} className="border-b border-border last:border-0">
            <Link
              href={`/r/${r.slug}`}
              className="grid grid-cols-[2rem_1fr_auto] items-center gap-4 px-5 py-3 transition hover:bg-muted/40 sm:grid-cols-[2rem_1fr_7rem_6rem_auto]"
            >
              <span className={cn("font-mono text-sm", i < 3 ? "text-brand" : "text-muted-foreground")}>{i + 1}</span>
              <span className="min-w-0">
                <span className="block truncate font-medium">{displayName(r.address)}</span>
                {programName(r.address) && (
                  <span className="block truncate font-mono text-xs text-muted-foreground">{r.address}</span>
                )}
              </span>
              <span className={cn("hidden text-right text-sm tabular-nums sm:block", TONE_TEXT[failureTone(r.failureRate)])}>
                {pct(r.failureRate)}
              </span>
              <span className="hidden text-right text-sm text-muted-foreground tabular-nums sm:block">{int(r.total)}</span>
              <ScoreGauge score={r.score} size={44} label="" />
            </Link>
          </li>
        ))}
      </ol>
    </div>
  );
}
