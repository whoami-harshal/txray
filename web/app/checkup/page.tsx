import { Suspense } from "react";
import Link from "next/link";
import type { Metadata } from "next";
import { connection } from "next/server";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { CheckupForm } from "@/components/checkup/checkup-form";
import { getRecentCheckups } from "@/lib/checkup/store";
import { pct, TONE_TEXT } from "@/lib/format";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Free Solana transaction checkup",
  description:
    "Paste any Solana program or wallet and get an instant health report: failure rate, why transactions fail, fees and compute waste.",
};

export default function CheckupPage() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-16 sm:px-6">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Free transaction checkup</h1>
        <p className="mt-3 text-muted-foreground">
          Paste any Solana program ID or wallet. We read its last 500 transactions and tell you how many failed, why,
          and how much compute and fees are being wasted. No signup.
        </p>
        <div className="mt-8">
          <CheckupForm />
        </div>
        <ul className="mt-12 grid gap-4 text-sm sm:grid-cols-3">
          {[
            ["Failure rate", "How many transactions paid a fee and still failed."],
            ["Why they fail", "Slippage, compute limits, insufficient funds, program errors."],
            ["Health score", "One number, with exactly what's costing you points."],
          ].map(([title, text]) => (
            <li key={title} className="rounded-xl border bg-background p-4">
              <div className="font-medium">{title}</div>
              <p className="mt-1 text-muted-foreground">{text}</p>
            </li>
          ))}
        </ul>
        <Suspense fallback={null}>
          <RecentCheckups />
        </Suspense>
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
    return null; // the list is a nice-to-have; never break the page over it
  }
  if (recent.length === 0) return null;
  return (
    <section className="mt-12">
      <h2 className="text-sm font-medium text-muted-foreground">Recent checkups</h2>
      <ul className="mt-3 divide-y rounded-xl border bg-background">
        {recent.map((r) => {
          const tone = r.score >= 80 ? "good" : r.score >= 60 ? "warn" : "bad";
          return (
            <li key={r.slug}>
              <Link href={`/r/${r.slug}`} className="flex items-center justify-between gap-4 px-4 py-3 text-sm hover:bg-muted/50">
                <span className="min-w-0 truncate font-mono">{r.address}</span>
                <span className="flex shrink-0 items-center gap-3 tabular-nums">
                  <span className="text-muted-foreground">{pct(r.failureRate)} failed</span>
                  <span className={cn("w-8 text-right font-semibold", TONE_TEXT[tone])}>{r.score}</span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
