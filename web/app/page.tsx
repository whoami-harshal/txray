import Link from "next/link";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { SDK_SNIPPET } from "@/components/dashboard/empty-state";
import { SITE } from "@/lib/site";

const FEATURES = [
  {
    title: "Free checkup",
    text: "Paste any program or wallet. Get its failure rate, why transactions fail, fees, compute waste and a health score, with a link you can share.",
  },
  {
    title: "Landing-rate tracking",
    text: "Wrap your send call with the SDK. Every transaction is followed until it lands, fails, or expires, with confirm time and fees.",
  },
  {
    title: "Fixes in plain English",
    text: "Slippage, compute limits, expired blockhashes: each failure type comes with what to change, plus suggested compute unit limits.",
  },
];

export default function Home() {
  return (
    <>
      <SiteHeader />
      <main className="flex-1">
        <section className="mx-auto max-w-4xl px-4 pt-20 pb-16 sm:px-6 sm:pt-28">
          <p className="text-sm font-medium text-muted-foreground">{SITE.tagline}</p>
          <h1 className="mt-3 max-w-2xl text-4xl font-semibold tracking-tight sm:text-5xl">
            Find out why your Solana transactions don&apos;t land.
          </h1>
          <p className="mt-5 max-w-xl text-lg text-muted-foreground">
            A &quot;sent&quot; transaction can still fail on-chain, expire before it lands, or quietly vanish. {SITE.name}{" "}
            shows you which, why, and what to fix.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href="/checkup"
              className="rounded-lg bg-foreground px-5 py-2.5 text-sm font-medium text-background hover:bg-foreground/90"
            >
              Run a free checkup
            </Link>
            <Link href="/dashboard" className="rounded-lg border bg-background px-5 py-2.5 text-sm font-medium hover:bg-muted">
              See the demo dashboard
            </Link>
          </div>
          <p className="mt-3 text-sm text-muted-foreground">No signup. Paste an address, get a report in seconds.</p>
        </section>

        <section className="mx-auto grid max-w-4xl gap-4 px-4 pb-16 sm:grid-cols-3 sm:px-6">
          {FEATURES.map((f) => (
            <div key={f.title} className="rounded-xl border bg-background p-5">
              <h2 className="font-medium">{f.title}</h2>
              <p className="mt-2 text-sm text-muted-foreground">{f.text}</p>
            </div>
          ))}
        </section>

        <section className="mx-auto max-w-4xl px-4 pb-24 sm:px-6">
          <h2 className="text-xl font-semibold tracking-tight">Track your own transactions</h2>
          <p className="mt-2 max-w-xl text-sm text-muted-foreground">
            The checkup only sees transactions that reached a block. To catch the ones that expire or get dropped, wrap
            your send call. The SDK never throws, never slows your app down, and never sends keys or signed transactions.
            Public release coming soon.
          </p>
          <pre className="mt-4 overflow-x-auto rounded-xl bg-zinc-950 p-5 text-xs leading-relaxed text-zinc-100">
            <code>{SDK_SNIPPET}</code>
          </pre>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
