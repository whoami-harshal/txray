import { Suspense } from "react";
import Link from "next/link";
import type { Metadata } from "next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { FailuresChart, LandingRateChart } from "@/components/dashboard/charts";
import { EmptyState, SdkSnippet } from "@/components/dashboard/empty-state";
import { getDashboardStats, parseRange, RANGES, type DashboardStats, type Range } from "@/lib/dashboard";
import { getViewerProjectIds } from "@/lib/scope";
import { CATEGORY_LABEL, FIX_TIPS } from "@/lib/tips";
import {
  failureTone,
  int,
  landingTone,
  ms,
  pct,
  share,
  sol,
  suggestCuLimit,
  TONE_TEXT,
  type Tone,
} from "@/lib/format";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Overview" };

export default function OverviewPage({ searchParams }: PageProps<"/dashboard">) {
  return (
    <Suspense fallback={<OverviewSkeleton />}>
      <Overview searchParams={searchParams} />
    </Suspense>
  );
}

async function Overview({ searchParams }: { searchParams: PageProps<"/dashboard">["searchParams"] }) {
  const range = parseRange((await searchParams).range);
  const projectIds = await getViewerProjectIds();

  if (projectIds.length === 0) {
    return (
      <EmptyState title="No projects yet">
        Create a project and an API key to start tracking transactions.
      </EmptyState>
    );
  }

  const stats = await getDashboardStats(projectIds, range);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Overview</h1>
          <p className="text-sm text-muted-foreground">
            {int(stats.totals.total)} transactions in the last {range === "24h" ? "24 hours" : "7 days"}
            {stats.totals.pending > 0 && <> · {int(stats.totals.pending)} still pending</>}
          </p>
        </div>
        <RangeToggle range={range} />
      </div>

      {stats.totals.total === 0 ? (
        <EmptyState title={`No transactions in the last ${range === "24h" ? "24 hours" : "7 days"}`}>
          Wrap your send call with the SDK and they&apos;ll show up here within a minute.
          <SdkSnippet />
        </EmptyState>
      ) : (
        <OverviewContent stats={stats} range={range} />
      )}
    </div>
  );
}

function OverviewContent({ stats, range }: { stats: DashboardStats; range: Range }) {
  const { totals, resolved } = stats;
  const landing = share(totals.success, resolved);
  const failed = share(totals.failed, resolved);
  const expired = share(totals.expired + totals.unknown, resolved);

  return (
    <>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <StatCard label="Landing rate" value={pct(landing)} tone={landingTone(landing)} hint={`${int(totals.success)} of ${int(resolved)} landed OK`} />
        <StatCard label="Failed on-chain" value={pct(failed)} tone={failureTone(failed)} hint={`${int(totals.failed)} paid a fee and failed`} />
        <StatCard
          label="Expired / dropped"
          value={pct(expired)}
          tone={failureTone(expired)}
          hint={`${int(totals.expired)} expired · ${int(totals.unknown)} unknown`}
        />
        <StatCard
          label="Confirm time"
          value={ms(totals.confirm_p50_ms)}
          tone="neutral"
          hint={`median · p95 ${ms(totals.confirm_p95_ms)}`}
        />
        <StatCard label="Fees paid" value={sol(totals.fees_lamports)} tone="neutral" hint="incl. failed txs, excl. tips" />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Landing rate {range === "24h" ? "per hour" : "per 4 hours"}</CardTitle>
          <CardDescription>Share of resolved transactions that landed successfully. Dashed lines: 95% and 85%.</CardDescription>
        </CardHeader>
        <CardContent>
          <LandingRateChart data={stats.hourly} range={range} />
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <FailuresCard stats={stats} />
        <FixTipsCard stats={stats} />
      </div>

      <ComputeWasteCard stats={stats} />
    </>
  );
}

function StatCard({ label, value, hint, tone }: { label: string; value: string; hint: string; tone: Tone }) {
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

function RangeToggle({ range }: { range: Range }) {
  return (
    <div className="inline-flex rounded-lg border bg-background p-0.5 text-sm">
      {RANGES.map((r) => (
        <Link
          key={r}
          href={r === "24h" ? "/dashboard" : `/dashboard?range=${r}`}
          className={cn(
            "rounded-md px-3 py-1",
            r === range ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {r === "24h" ? "Last 24h" : "Last 7 days"}
        </Link>
      ))}
    </div>
  );
}

function FailuresCard({ stats }: { stats: DashboardStats }) {
  const data = stats.categories.map((c) => ({
    name: CATEGORY_LABEL[c.category],
    count: c.count,
    expired: c.category === "BLOCKHASH_EXPIRED" || c.category === "UNKNOWN",
  }));
  return (
    <Card>
      <CardHeader>
        <CardTitle>Failures by reason</CardTitle>
        <CardDescription>Red: failed on-chain (fee paid). Amber: never landed.</CardDescription>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <p className="py-8 text-center text-sm text-emerald-600">No failures in this period 🎉</p>
        ) : (
          <FailuresChart data={data} />
        )}
      </CardContent>
    </Card>
  );
}

function FixTipsCard({ stats }: { stats: DashboardStats }) {
  const top = stats.categories.slice(0, 3);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Fix tips</CardTitle>
        <CardDescription>What to change for your most common failures.</CardDescription>
      </CardHeader>
      <CardContent>
        {top.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Nothing to fix right now.</p>
        ) : (
          <ol className="space-y-4">
            {top.map((c) => {
              const t = FIX_TIPS[c.category];
              return (
                <li key={c.category} className="text-sm">
                  <div className="font-medium">
                    {t.title}{" "}
                    <span className="font-normal text-muted-foreground">
                      ({int(c.count)} · {pct(share(c.count, stats.resolved))})
                    </span>
                  </div>
                  <p className="mt-1 text-muted-foreground">{t.tip}</p>
                </li>
              );
            })}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}

function ComputeWasteCard({ stats }: { stats: DashboardStats }) {
  const { avg_cu_limit, avg_cu_consumed, p95_cu_consumed, success_without_cu_limit } = stats.totals;
  const unused = avg_cu_limit && avg_cu_consumed ? share(avg_cu_limit - avg_cu_consumed, avg_cu_limit) : null;
  const suggested = suggestCuLimit(p95_cu_consumed);
  const labels = stats.labels.filter((l) => l.p95_cu_consumed);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Compute waste</CardTitle>
        <CardDescription>
          Requesting more compute units than you use makes the priority fee you pay per CU cost more, and can
          lower your inclusion odds. Suggested limit = p95 used × 1.1.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Metric label="Avg CU limit" value={int(avg_cu_limit)} />
          <Metric label="Avg CU used" value={int(avg_cu_consumed)} />
          <Metric
            label="Unused"
            value={pct(unused, 0)}
            className={unused === null ? "" : TONE_TEXT[unused > 50 ? "bad" : unused > 25 ? "warn" : "good"]}
          />
          <Metric label="Suggested limit (all)" value={int(suggested)} />
        </div>

        {labels.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="py-2 pr-4 font-medium">Label</th>
                  <th className="py-2 pr-4 text-right font-medium">Transactions</th>
                  <th className="py-2 pr-4 text-right font-medium">Landing rate</th>
                  <th className="py-2 pr-4 text-right font-medium">Avg limit</th>
                  <th className="py-2 pr-4 text-right font-medium">p95 used</th>
                  <th className="py-2 text-right font-medium">Suggested limit</th>
                </tr>
              </thead>
              <tbody className="tabular-nums">
                {labels.map((l) => {
                  const rate = share(l.success, l.resolved);
                  return (
                    <tr key={l.label} className="border-b last:border-0">
                      <td className="py-2 pr-4 font-medium">{l.label}</td>
                      <td className="py-2 pr-4 text-right">{int(l.total)}</td>
                      <td className={cn("py-2 pr-4 text-right", TONE_TEXT[landingTone(rate)])}>{pct(rate)}</td>
                      <td className="py-2 pr-4 text-right">{int(l.avg_cu_limit)}</td>
                      <td className="py-2 pr-4 text-right">{int(l.p95_cu_consumed)}</td>
                      <td className="py-2 text-right font-medium">{int(suggestCuLimit(l.p95_cu_consumed))}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {success_without_cu_limit > 0 && (
          <p className="text-xs text-amber-700">
            {int(success_without_cu_limit)} successful transactions set no CU limit (default 200,000 per
            instruction). Setting one is the easiest fee saving.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function Metric({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={cn("text-lg font-semibold tabular-nums", className)}>{value}</div>
    </div>
  );
}

function OverviewSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-9 w-48" />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        {Array.from({ length: 5 }, (_, i) => (
          <Skeleton key={i} className="h-28" />
        ))}
      </div>
      <Skeleton className="h-80" />
      <div className="grid gap-6 lg:grid-cols-2">
        <Skeleton className="h-64" />
        <Skeleton className="h-64" />
      </div>
    </div>
  );
}
