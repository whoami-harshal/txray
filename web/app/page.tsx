import Link from "next/link";

export default function Home() {
  return (
    <main className="mx-auto flex min-h-full max-w-2xl flex-1 flex-col justify-center px-6 py-24">
      <div className="text-3xl" aria-hidden>
        🩺
      </div>
      <h1 className="mt-4 text-4xl font-semibold tracking-tight">Transaction Doctor</h1>
      <p className="mt-4 text-lg text-muted-foreground">
        See which of your Solana transactions land, fail, or expire, and exactly why. One line of SDK, a dashboard
        with fixes in plain English.
      </p>
      <div className="mt-8 flex flex-wrap gap-3">
        <Link href="/checkup" className="rounded-lg border bg-background px-4 py-2 text-sm font-medium hover:bg-muted">
          Run a free checkup
        </Link>
        <Link href="/dashboard" className="rounded-lg bg-foreground px-4 py-2 text-sm font-medium text-background hover:bg-foreground/90">
          Open dashboard
        </Link>
      </div>
    </main>
  );
}
