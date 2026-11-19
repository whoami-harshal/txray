import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ExternalLink } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ShareLink } from "@/components/checkup/share-link";
import { LocalTime } from "@/components/dashboard/local-time";
import { getCheckup } from "@/lib/checkup/store";
import { MIN_COMPUTE_SAMPLE, type CheckupReport } from "@/lib/checkup/analyze";
import { CATEGORY_LABEL, FIX_TIPS } from "@/lib/tips";
import { failureTone, int, pct, sol, TONE_TEXT, type Tone } from "@/lib/format";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Transaction health report · Transaction Doctor",
  description: "Failure rate, failure reasons, fees and compute waste for a Solana program or wallet.",
};

export default function ReportPage({ params }: PageProps<"/r/[slug]">) {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-10 sm:px-6">
        <Suspense fallback={<ReportSkeleton />}>
          <Report params={params} />
        </Suspense>
      </main>
    </>
  );
}

function scoreTone(score: number): Tone {
  return score >= 80 ? "good" : score >= 60 ? "warn" : "bad";
}

const SCORE_RING: Record<Tone, string> = {
  good: "ring-emerald-200 bg-emerald-50",
  warn: "ring-amber-200 bg-amber-50",
  bad: "ring-red-200 bg-red-50",
  neutral: "ring-zinc-200 bg-zinc-50",
};

function shortAddr(a: string) {
  return `${a.slice(0, 6)}…${a.slice(-6)}`;
}

async function Report({ params }: { params: PageProps<"/r/[slug]">["params"] }) {
  const { slug } = await params;
  const row = await getCheckup(slug);
  if (!row) notFound();
  const r = row.report;
  const tone = scoreTone(r.score);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm text-muted-foreground">
            Health report · {r.kind === "program" ? "Program" : r.kind === "wallet" ? "Wallet" : "Address"}
          </p>
          <h1 className="mt-1 flex items-center gap-2 font-mono text-xl font-semibold sm:text-2xl">
            <span className="sm:hidden">{shortAddr(r.address)}</span>
            <span className="hidden truncate sm:inline">{r.address}</span>
            <a
              href={`https://solscan.io/account/${r.address}`}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="View on Solscan"
              className="text-muted-foreground hover:text-foreground"
            >
              <ExternalLink className="size-4" />
            </a>
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Last {int(r.total)} transactions
            {r.window.from && r.window.to && (
              <>
                {" "}
                · <LocalTime iso={r.window.from} /> → <LocalTime iso={r.window.to} />
              </>
            )}
            {" · "}checked <LocalTime iso={r.generatedAt} />
          </p>
        </div>
        <ShareLink />
      </div>

      <div className="grid gap-4 sm:grid-cols-[auto_1fr]">
        <div className={cn("flex flex-col items-center justify-center rounded-2xl px-10 py-6 ring-1", SCORE_RING[tone])}>
          <div className={cn("text-6xl font-semibold tabular-nums", TONE_TEXT[tone])}>{r.score}</div>
          <div className="mt-1 text-sm text-muted-foreground">health score / 100</div>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>What&apos;s costing points</CardTitle>
          </CardHeader>
          <CardContent>
            {r.scoreBreakdown.length === 0 ? (
              <p className="text-sm text-emerald-700">Nothing. This looks healthy.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {r.scoreBreakdown.map((b) => (
                  <li key={b.label} className="flex justify-between gap-4">
                    <span>{b.label}</span>
                    <span className="shrink-0 font-medium tabular-nums text-red-600">{b.points}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Failed on-chain" value={pct(r.failureRate)} tone={failureTone(r.failureRate)} hint={`${int(r.failed)} of ${int(r.total)}`} />
        <Stat label="Avg fee" value={r.fees.avgLamports === null ? "–" : sol(r.fees.avgLamports, 6)} hint={r.fees.sample ? `from ${int(r.fees.sample)} txs` : "not enough data"} />
        <Stat
          label="Unused compute"
          value={pct(r.compute.wastePct, 0)}
          tone={r.compute.wastePct === null ? "neutral" : r.compute.wastePct > 50 ? "bad" : r.compute.wastePct > 25 ? "warn" : "good"}
          hint={r.compute.sample ? `avg ${int(r.compute.avgConsumed)} used of ${int(r.compute.avgLimit)}${r.compute.sample < MIN_COMPUTE_SAMPLE ? ` · only ${r.compute.sample} txs, not scored` : ""}` : "not enough successful txs sampled"}
        />
        <Stat
          label="Set a CU limit"
          value={pct(r.compute.setsCuLimitPct, 0)}
          tone={r.compute.setsCuLimitPct === null ? "neutral" : r.compute.setsCuLimitPct >= 80 ? "good" : r.compute.setsCuLimitPct >= 50 ? "warn" : "bad"}
          hint={r.compute.setsCuPricePct === null ? "not enough successful txs sampled" : `priority fee: ${pct(r.compute.setsCuPricePct, 0)}`}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <FailureReasons r={r} />
        <Card>
          <CardHeader>
            <CardTitle>How to fix it</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            {r.categories.slice(0, 2).map((c) => (
              <div key={c.category}>
                <div className="font-medium">{FIX_TIPS[c.category].title}</div>
                <p className="mt-1 text-muted-foreground">{FIX_TIPS[c.category].tip}</p>
              </div>
            ))}
            {r.compute.suggestedLimit && (r.compute.wastePct ?? 0) > 25 && (
              <div>
                <div className="font-medium">Right-size your compute unit limit</div>
                <p className="mt-1 text-muted-foreground">
                  Successful transactions use at most ~{int(r.compute.suggestedLimit)} CU (p95 × 1.1) but request{" "}
                  {int(r.compute.avgLimit)} on average. A tighter limit lowers the priority fee you pay.
                </p>
              </div>
            )}
            {r.categories.length === 0 && !((r.compute.wastePct ?? 0) > 25) && (
              <p className="text-muted-foreground">No obvious fixes. Nice work.</p>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="rounded-xl border border-sky-200 bg-sky-50 p-5 text-sm">
        <p className="font-medium text-sky-900">
          On-chain data can&apos;t show dropped transactions. Install the SDK to see your real landing rate.
        </p>
        <p className="mt-1 text-sky-800">
          This report only sees transactions that made it into a block. Transactions that expired or were dropped
          before landing are invisible here, and they&apos;re often the biggest problem.
        </p>
        <Link
          href="/dashboard"
          className="mt-3 inline-block rounded-lg bg-sky-900 px-3 py-1.5 font-medium text-white hover:bg-sky-800"
        >
          Track your real landing rate →
        </Link>
      </div>

      {r.source === "sampled" && (
        <p className="text-xs text-muted-foreground">
          Failure rate covers all {int(r.total)} transactions. Failure reasons come from {int(r.failuresInspected)} failed
          transactions we inspected, and fees and compute from a sample of {int(r.fees.sample)}.
        </p>
      )}
    </div>
  );
}

function FailureReasons({ r }: { r: CheckupReport }) {
  const max = Math.max(1, ...r.categories.map((c) => c.count));
  return (
    <Card>
      <CardHeader>
        <CardTitle>Why transactions fail</CardTitle>
        <CardDescription>
          {r.failuresInspected > 0 ? `From ${int(r.failuresInspected)} failed transactions.` : "No failed transactions."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {r.categories.length === 0 ? (
          <p className="py-6 text-center text-sm text-emerald-600">No on-chain failures found 🎉</p>
        ) : (
          <ul className="space-y-3 text-sm">
            {r.categories.map((c) => (
              <li key={c.category}>
                <div className="flex justify-between">
                  <span>{CATEGORY_LABEL[c.category]}</span>
                  <span className="tabular-nums text-muted-foreground">
                    {int(c.count)} · {pct((c.count / r.failuresInspected) * 100, 0)}
                  </span>
                </div>
                <div className="mt-1 h-2 rounded-full bg-muted">
                  <div className="h-2 rounded-full bg-red-500" style={{ width: `${(c.count / max) * 100}%` }} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function Stat({ label, value, hint, tone = "neutral" }: { label: string; value: string; hint: string; tone?: Tone }) {
  return (
    <Card size="sm" className="gap-1">
      <CardHeader>
        <CardDescription>{label}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className={cn("text-2xl font-semibold tabular-nums", TONE_TEXT[tone])}>{value}</div>
        <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
      </CardContent>
    </Card>
  );
}

function ReportSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-16 w-2/3" />
      <Skeleton className="h-40" />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
      <Skeleton className="h-64" />
    </div>
  );
}
