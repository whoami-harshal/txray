import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { Activity, ArrowRight, Cpu, Gauge, Share2, ShieldCheck, Zap } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { CheckupForm } from "@/components/checkup/checkup-form";
import { ScoreGauge } from "@/components/score-gauge";
import { SDK_SNIPPET } from "@/components/dashboard/empty-state";
import { getLeaderboard, getSiteStats } from "@/lib/checkup/store";
import { displayName } from "@/lib/programs";
import { int, pct } from "@/lib/format";
import { SITE } from "@/lib/site";

export default function Home() {
  return (
    <>
      <SiteHeader />
      <main className="flex-1">
        <Hero />
        <Features />
        <HowItWorks />
        <Suspense fallback={null}>
          <LeaderboardPreview />
        </Suspense>
        <SdkSection />
        <FinalCta />
      </main>
      <SiteFooter />
    </>
  );
}

function Hero() {
  return (
    <section className="relative overflow-hidden border-b border-border/60">
      <div aria-hidden className="bg-grid absolute inset-0" />
      <div aria-hidden className="glow absolute inset-0" />
      <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-4 pt-16 pb-20 sm:px-6 sm:pt-24 lg:grid-cols-[1.15fr_1fr] lg:pb-28">
        <div>
          <span className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-card/60 px-3 py-1 text-xs text-muted-foreground backdrop-blur">
            <span className="size-1.5 rounded-full bg-good shadow-[0_0_8px_var(--good)]" />
            Free · No signup · Solana mainnet
          </span>
          <h1 className="mt-5 text-4xl font-semibold tracking-tight sm:text-6xl">
            <span className="text-gradient">X-ray</span> your Solana transactions.
          </h1>
          <p className="mt-5 max-w-xl text-lg text-muted-foreground">
            Paste any program or wallet. In seconds, see how many transactions fail on-chain, exactly why, how much
            compute is wasted, and what to fix.
          </p>
          <div className="mt-8 max-w-xl">
            <CheckupForm size="lg" />
          </div>
          <Suspense fallback={<div className="mt-6 h-5" />}>
            <Stats />
          </Suspense>
        </div>
        <ExampleReport />
      </div>
    </section>
  );
}

async function Stats() {
  await connection();
  let stats;
  try {
    stats = await getSiteStats();
  } catch {
    return null;
  }
  if (stats.transactions === 0) return null;
  return (
    <p className="mt-6 flex flex-wrap gap-x-5 gap-y-1 text-sm text-muted-foreground">
      <span>
        <span className="font-semibold text-foreground tabular-nums">{int(stats.transactions)}</span> transactions
        x-rayed
      </span>
      {stats.programs > 0 && (
        <span>
          <span className="font-semibold text-foreground tabular-nums">{int(stats.programs)}</span> programs checked
        </span>
      )}
    </p>
  );
}

/** Illustration of what a report looks like (not real data, and labelled as such). */
function ExampleReport() {
  const reasons = [
    { label: "Slippage exceeded", value: 58, tone: "bg-bad" },
    { label: "Program error", value: 27, tone: "bg-bad/70" },
    { label: "Out of compute", value: 15, tone: "bg-warn" },
  ];
  return (
    <div className="relative mx-auto w-full max-w-md">
      <div aria-hidden className="absolute -inset-6 rounded-[2rem] bg-gradient-to-br from-brand/20 to-brand-2/20 blur-2xl" />
      <div className="relative overflow-hidden rounded-2xl border border-border bg-card/90 p-6 shadow-2xl backdrop-blur">
        <div className="scanline" aria-hidden />
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span className="font-mono">Example report</span>
          <span className="rounded-full border border-border px-2 py-0.5">last 500 txs</span>
        </div>
        <div className="mt-4 flex items-center gap-6">
          <ScoreGauge score={64} size={128} label="score" />
          <div className="space-y-3 text-sm">
            <div>
              <div className="text-muted-foreground">Failed on-chain</div>
              <div className="text-2xl font-semibold text-warn tabular-nums">12.4%</div>
            </div>
            <div>
              <div className="text-muted-foreground">Unused compute</div>
              <div className="text-2xl font-semibold text-bad tabular-nums">71%</div>
            </div>
          </div>
        </div>
        <div className="mt-6 space-y-3">
          {reasons.map((r) => (
            <div key={r.label} className="text-xs">
              <div className="flex justify-between">
                <span>{r.label}</span>
                <span className="text-muted-foreground tabular-nums">{r.value}%</span>
              </div>
              <div className="mt-1 h-1.5 rounded-full bg-muted">
                <div className={`h-1.5 rounded-full ${r.tone}`} style={{ width: `${r.value}%` }} />
              </div>
            </div>
          ))}
        </div>
        <div className="mt-6 rounded-lg border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">Fix:</span> use dynamic slippage and re-quote right before
          signing. Suggested CU limit: <span className="font-mono text-foreground">220,000</span>
        </div>
      </div>
    </div>
  );
}

const FEATURES = [
  { icon: Activity, title: "Failure rate", text: "How many transactions paid a fee and still failed on-chain." },
  { icon: Zap, title: "Why they fail", text: "Slippage, compute limits, insufficient funds, program errors, from the program logs." },
  { icon: Cpu, title: "Compute waste", text: "Requested vs. used compute units, plus a suggested limit that lowers your priority fees." },
  { icon: Gauge, title: "Health score", text: "One number from 0 to 100, with exactly what's costing you points." },
  { icon: Share2, title: "Shareable report", text: "Every checkup gets a link with a preview card, ready to post." },
  { icon: ShieldCheck, title: "Read-only", text: "Public on-chain data only. No wallet connect, no signup, nothing to install." },
];

function Features() {
  return (
    <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
      <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">Everything a checkup shows you</h2>
      <p className="mt-2 max-w-2xl text-muted-foreground">
        Built on Helius RPC. We read up to 500 recent transactions and turn raw errors and logs into answers.
      </p>
      <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map((f) => (
          <div
            key={f.title}
            className="group rounded-2xl border border-border bg-card/50 p-5 transition hover:border-brand/40 hover:bg-card"
          >
            <div className="flex size-9 items-center justify-center rounded-lg bg-brand/10 text-brand ring-1 ring-brand/20">
              <f.icon className="size-4" />
            </div>
            <h3 className="mt-4 font-medium">{f.title}</h3>
            <p className="mt-1 text-sm text-muted-foreground">{f.text}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function HowItWorks() {
  const steps = [
    ["Paste an address", "Any program ID (Jupiter, your own program) or a wallet."],
    ["We read the chain", "The last 500 transactions with logs and compute usage, via Helius."],
    ["Get the diagnosis", "Score, failure reasons, fixes, and a link to share."],
  ];
  return (
    <section className="border-y border-border/60 bg-surface">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-16 sm:grid-cols-3 sm:px-6">
        {steps.map(([title, text], i) => (
          <div key={title} className="flex gap-4">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full border border-brand/40 font-mono text-sm text-brand">
              {i + 1}
            </span>
            <div>
              <h3 className="font-medium">{title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{text}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

async function LeaderboardPreview() {
  await connection();
  let rows;
  try {
    rows = await getLeaderboard(5);
  } catch {
    return null;
  }
  if (rows.length < 2) return null;
  return (
    <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">Leaderboard</h2>
          <p className="mt-2 text-muted-foreground">How the programs people checked score right now.</p>
        </div>
        <Link href="/leaderboard" className="inline-flex items-center gap-1 text-sm text-brand hover:underline">
          Full leaderboard <ArrowRight className="size-4" />
        </Link>
      </div>
      <ol className="mt-8 divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card/50">
        {rows.map((r, i) => (
          <li key={r.slug}>
            <Link href={`/r/${r.slug}`} className="flex items-center gap-4 px-5 py-4 transition hover:bg-muted/40">
              <span className="w-6 font-mono text-sm text-muted-foreground">{i + 1}</span>
              <span className="min-w-0 flex-1 truncate font-medium">{displayName(r.address)}</span>
              <span className="hidden text-sm text-muted-foreground tabular-nums sm:inline">
                {pct(r.failureRate)} failed
              </span>
              <ScoreGauge score={r.score} size={44} label="" />
            </Link>
          </li>
        ))}
      </ol>
    </section>
  );
}

function SdkSection() {
  return (
    <section className="mx-auto grid max-w-6xl gap-10 px-4 pb-20 sm:px-6 lg:grid-cols-2 lg:items-center">
      <div>
        <span className="rounded-full border border-brand/30 bg-brand/10 px-2.5 py-0.5 text-xs text-brand">
          SDK · coming soon
        </span>
        <h2 className="mt-4 text-2xl font-semibold tracking-tight sm:text-3xl">See the transactions that never land</h2>
        <p className="mt-3 text-muted-foreground">
          A checkup only sees what reached a block. Dropped and expired transactions are invisible on-chain, and
          they&apos;re often the real problem. Wrap your send call and {SITE.name} follows every transaction until it
          lands, fails, or expires.
        </p>
        <ul className="mt-5 space-y-2 text-sm text-muted-foreground">
          <li>• Live landing rate, confirm times and fees per hour</li>
          <li>• Zero dependencies, never throws, never slows your app</li>
          <li>• Never sends keys or signed transactions</li>
        </ul>
        <Link href="/dashboard" className="mt-6 inline-flex items-center gap-1 text-sm text-brand hover:underline">
          Explore the demo dashboard <ArrowRight className="size-4" />
        </Link>
      </div>
      <pre className="overflow-x-auto rounded-2xl bg-zinc-950 p-5 text-xs leading-relaxed text-zinc-100 ring-1 ring-border sm:text-sm">
        <code>{SDK_SNIPPET}</code>
      </pre>
    </section>
  );
}

function FinalCta() {
  return (
    <section className="relative overflow-hidden border-t border-border/60">
      <div aria-hidden className="glow absolute inset-0 opacity-70" />
      <div className="relative mx-auto max-w-3xl px-4 py-20 text-center sm:px-6">
        <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">What&apos;s your program&apos;s score?</h2>
        <p className="mt-3 text-muted-foreground">Takes about five seconds. Free, no signup.</p>
        <div className="mx-auto mt-8 max-w-xl text-left">
          <CheckupForm />
        </div>
      </div>
    </section>
  );
}
