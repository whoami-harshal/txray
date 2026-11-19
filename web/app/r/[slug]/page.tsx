import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ArrowRight, ExternalLink } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { Skeleton } from "@/components/ui/skeleton";
import { ShareLink } from "@/components/checkup/share-link";
import { LocalTime } from "@/components/dashboard/local-time";
import { ScoreGauge } from "@/components/score-gauge";
import { getCheckup } from "@/lib/checkup/store";
import { MIN_COMPUTE_SAMPLE, type CheckupReport } from "@/lib/checkup/analyze";
import { CATEGORY_LABEL, FIX_TIPS } from "@/lib/tips";
import { failureTone, int, pct, sol, TONE_TEXT, type Tone } from "@/lib/format";
import { displayName, programName, shortAddress } from "@/lib/programs";
import { SITE, siteUrl } from "@/lib/site";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Transaction health report",
  description: "Failure rate, failure reasons, fees and compute waste for a Solana program or wallet.",
};

export default function ReportPage({ params }: PageProps<"/r/[slug]">) {
  return (
    <>
      <SiteHeader />
      <main className="relative flex-1 overflow-hidden">
        <div aria-hidden className="bg-grid absolute inset-x-0 top-0 h-[420px]" />
        <div aria-hidden className="glow absolute inset-x-0 top-0 h-[420px] opacity-60" />
        <div className="relative mx-auto w-full max-w-5xl px-4 py-10 sm:px-6 sm:py-14">
          <Suspense fallback={<ReportSkeleton />}>
            <Report params={params} />
          </Suspense>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}

/** Neutral, factual post text: the report link carries the preview card. */
function shareOnXUrl(r: CheckupReport, slug: string): string {
  const name = programName(r.address) ?? (r.kind === "wallet" ? "This wallet" : shortAddress(r.address));
  const top = r.categories[0];
  const reason = top ? `, mostly ${CATEGORY_LABEL[top.category].toLowerCase()}` : "";
  const text = `${name} scored ${r.score}/100 on a ${SITE.name} transaction checkup: ${r.failureRate}% of its last ${r.total} transactions failed on-chain${reason}.\n\nCheck any Solana program 👇`;
  const qs = new URLSearchParams({ text, url: `${siteUrl()}/r/${slug}` });
  return `https://x.com/intent/post?${qs.toString()}`;
}

function Card({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn("rounded-2xl border border-border bg-card/70 p-5 backdrop-blur", className)}>{children}</div>;
}

async function Report({ params }: { params: PageProps<"/r/[slug]">["params"] }) {
  const { slug } = await params;
  const row = await getCheckup(slug);
  if (!row) notFound();
  const r = row.report;
  const name = programName(r.address);
  const smallSample = r.compute.sample > 0 && r.compute.sample < MIN_COMPUTE_SAMPLE;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm text-muted-foreground">
            Health report · {r.kind === "program" ? "Program" : r.kind === "wallet" ? "Wallet" : "Address"}
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">{name ?? displayName(r.address)}</h1>
          <a
            href={`https://solscan.io/account/${r.address}`}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-1 inline-flex max-w-full items-center gap-1.5 font-mono text-xs text-muted-foreground hover:text-foreground"
          >
            <span className="truncate">{r.address}</span>
            <ExternalLink className="size-3 shrink-0" />
          </a>
          <p className="mt-2 text-xs text-muted-foreground">
            Last {int(r.total)} transactions
            {r.window.from && r.window.to && (
              <>
                {" "}
                · <LocalTime iso={r.window.from} /> → <LocalTime iso={r.window.to} />
              </>
            )}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a
            href={shareOnXUrl(r, slug)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-9 items-center gap-2 rounded-lg bg-foreground px-3 text-sm font-medium text-background hover:opacity-90"
          >
            <svg viewBox="0 0 24 24" className="size-3.5" fill="currentColor" aria-hidden>
              <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
            </svg>
            Share on X
          </a>
          <ShareLink />
        </div>
      </div>

      {/* Score */}
      <div className="grid gap-4 md:grid-cols-[auto_1fr]">
        <Card className="flex items-center justify-center px-10">
          <ScoreGauge score={r.score} size={180} />
        </Card>
        <Card>
          <h2 className="font-medium">What&apos;s costing points</h2>
          {r.scoreBreakdown.length === 0 ? (
            <p className="mt-3 text-sm text-good">Nothing. This looks healthy.</p>
          ) : (
            <ul className="mt-3 space-y-2.5 text-sm">
              {r.scoreBreakdown.map((b) => (
                <li key={b.label} className="flex items-center justify-between gap-4">
                  <span>{b.label}</span>
                  <span className="shrink-0 rounded-md bg-bad/10 px-2 py-0.5 font-mono text-xs font-medium text-bad tabular-nums">
                    {b.points}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-4 border-t border-border pt-3 text-xs text-muted-foreground">
            Starts at 100. Points come off for on-chain failures, unused compute, and not setting a compute limit or
            priority fee.
          </p>
        </Card>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Failed on-chain" value={pct(r.failureRate)} tone={failureTone(r.failureRate)} hint={`${int(r.failed)} of ${int(r.total)}`} />
        <Stat
          label="Avg fee"
          value={r.fees.avgLamports === null ? "–" : sol(r.fees.avgLamports, 6)}
          hint={r.fees.sample ? `from ${int(r.fees.sample)} txs` : "not enough data"}
        />
        <Stat
          label="Unused compute"
          value={pct(r.compute.wastePct, 0)}
          tone={r.compute.wastePct === null ? "neutral" : r.compute.wastePct > 50 ? "bad" : r.compute.wastePct > 25 ? "warn" : "good"}
          hint={
            r.compute.sample
              ? `avg ${int(r.compute.avgConsumed)} used of ${int(r.compute.avgLimit)}${smallSample ? ` · only ${r.compute.sample} txs, not scored` : ""}`
              : "not enough successful txs sampled"
          }
        />
        <Stat
          label="Set a CU limit"
          value={pct(r.compute.setsCuLimitPct, 0)}
          tone={r.compute.setsCuLimitPct === null ? "neutral" : r.compute.setsCuLimitPct >= 80 ? "good" : r.compute.setsCuLimitPct >= 50 ? "warn" : "bad"}
          hint={r.compute.setsCuPricePct === null ? "not enough successful txs sampled" : `priority fee: ${pct(r.compute.setsCuPricePct, 0)}`}
        />
      </div>

      {/* Reasons + fixes */}
      <div className="grid gap-4 lg:grid-cols-2">
        <FailureReasons r={r} />
        <Card>
          <h2 className="font-medium">How to fix it</h2>
          <div className="mt-4 space-y-5 text-sm">
            {r.categories.slice(0, 2).map((c) => (
              <div key={c.category} className="border-l-2 border-brand/60 pl-3">
                <div className="font-medium">{FIX_TIPS[c.category].title}</div>
                <p className="mt-1 text-muted-foreground">{FIX_TIPS[c.category].tip}</p>
              </div>
            ))}
            {r.compute.suggestedLimit && (r.compute.wastePct ?? 0) > 25 && (
              <div className="border-l-2 border-brand/60 pl-3">
                <div className="font-medium">Right-size your compute unit limit</div>
                <p className="mt-1 text-muted-foreground">
                  Successful transactions use at most ~
                  <span className="font-mono text-foreground">{int(r.compute.suggestedLimit)}</span> CU (p95 × 1.1) but
                  request {int(r.compute.avgLimit)} on average. A tighter limit lowers the priority fee you pay.
                </p>
              </div>
            )}
            {r.categories.length === 0 && !((r.compute.wastePct ?? 0) > 25) && (
              <p className="text-muted-foreground">No obvious fixes. Nice work.</p>
            )}
          </div>
        </Card>
      </div>

      {/* SDK note (required honesty) */}
      <div className="relative overflow-hidden rounded-2xl border border-info/25 bg-info/10 p-5 text-sm">
        <p className="font-medium text-info">
          On-chain data can&apos;t show dropped transactions. Install the SDK to see your real landing rate.
        </p>
        <p className="mt-1 text-muted-foreground">
          This report only sees transactions that made it into a block. Transactions that expired or were dropped
          before landing are invisible here, and they&apos;re often the biggest problem.
        </p>
        <Link href="/dashboard" className="mt-3 inline-flex items-center gap-1 font-medium text-info hover:underline">
          See what the live dashboard shows <ArrowRight className="size-4" />
        </Link>
      </div>

      {/* Next action */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-border bg-card/70 p-5">
        <div>
          <div className="font-medium">Check another program</div>
          <p className="text-sm text-muted-foreground">Compare your program with others on the leaderboard.</p>
        </div>
        <div className="flex gap-2">
          <Link href="/leaderboard" className="rounded-lg border border-border px-3 py-2 text-sm hover:bg-muted">
            Leaderboard
          </Link>
          <Link href="/checkup" className="rounded-lg bg-foreground px-3 py-2 text-sm font-medium text-background hover:opacity-90">
            New checkup
          </Link>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        {r.source === "sampled" ? (
          <>
            Failure rate covers all {int(r.total)} transactions. Failure reasons come from {int(r.failuresInspected)}{" "}
            failed transactions we inspected, and fees and compute from a sample of {int(r.fees.sample)}.{" "}
          </>
        ) : null}
        Checked <LocalTime iso={r.generatedAt} />. Busy programs include bot traffic that fails on purpose.
      </p>
    </div>
  );
}

function FailureReasons({ r }: { r: CheckupReport }) {
  const max = Math.max(1, ...r.categories.map((c) => c.count));
  return (
    <Card>
      <h2 className="font-medium">Why transactions fail</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        {r.failuresInspected > 0 ? `From ${int(r.failuresInspected)} failed transactions.` : "No failed transactions."}
      </p>
      {r.categories.length === 0 ? (
        <p className="py-8 text-center text-sm text-good">No on-chain failures found 🎉</p>
      ) : (
        <ul className="mt-5 space-y-4 text-sm">
          {r.categories.map((c) => (
            <li key={c.category}>
              <div className="flex justify-between">
                <span>{CATEGORY_LABEL[c.category]}</span>
                <span className="text-muted-foreground tabular-nums">
                  {int(c.count)} · {pct((c.count / r.failuresInspected) * 100, 0)}
                </span>
              </div>
              <div className="mt-1.5 h-2 rounded-full bg-muted">
                <div
                  className="h-2 rounded-full bg-gradient-to-r from-bad/70 to-bad"
                  style={{ width: `${(c.count / max) * 100}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function Stat({ label, value, hint, tone = "neutral" }: { label: string; value: string; hint: string; tone?: Tone }) {
  return (
    <Card className="p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={cn("mt-1 text-2xl font-semibold tabular-nums", TONE_TEXT[tone])}>{value}</div>
      <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
    </Card>
  );
}

function ReportSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-20 w-2/3" />
      <Skeleton className="h-52 rounded-2xl" />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-24 rounded-2xl" />
        ))}
      </div>
      <Skeleton className="h-64 rounded-2xl" />
    </div>
  );
}
