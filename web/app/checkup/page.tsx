import type { Metadata } from "next";
import { SiteHeader } from "@/components/site-header";
import { CheckupForm } from "@/components/checkup/checkup-form";

export const metadata: Metadata = {
  title: "Free Solana transaction checkup · Transaction Doctor",
  description: "Paste any Solana program or wallet and get an instant health report: failure rate, why transactions fail, fees and compute waste.",
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
      </main>
    </>
  );
}
