"use client";

import { useId, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Loader2, ScanLine } from "lucide-react";
import { POPULAR } from "@/lib/programs";
import { cn } from "@/lib/utils";

const STEPS = [
  "Fetching the last 500 transactions…",
  "Reading program logs…",
  "Classifying failures…",
  "Measuring compute waste…",
  "Scoring…",
];

export function CheckupForm({ size = "default" }: { size?: "default" | "lg" }) {
  const router = useRouter();
  const [address, setAddress] = useState("");
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const inputId = useId();
  // Navigation to the report runs as a transition: the form shows "busy" until the report page
  // commits, and the reset lands with it. (Next keeps the previous page's state alive when you
  // navigate back, so without the reset the landing page would still say "Scoring…".)
  const [navigating, startNavigation] = useTransition();

  async function run(value: string) {
    const addr = value.trim();
    if (!addr || loading || navigating) return;
    setLoading(true);
    setError(null);
    setStep(0);
    timer.current = setInterval(() => setStep((s) => Math.min(s + 1, STEPS.length - 1)), 1400);
    try {
      const res = await fetch("/api/checkup", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ address: addr }),
      });
      const body = (await res.json().catch(() => ({}))) as { slug?: string; error?: string };
      if (!res.ok || !body.slug) throw new Error(body.error ?? "Something went wrong.");
      if (timer.current) clearInterval(timer.current);
      startNavigation(() => {
        setLoading(false);
        setStep(0);
        setAddress("");
        router.push(`/r/${body.slug}`);
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
      setLoading(false);
      if (timer.current) clearInterval(timer.current);
    }
  }

  const lg = size === "lg";
  const busy = loading || navigating;

  return (
    <div className="w-full">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void run(address);
        }}
        className={cn(
          "group relative flex items-center gap-2 rounded-2xl border border-border bg-card/80 p-1.5 shadow-lg shadow-black/5 backdrop-blur transition focus-within:border-brand/60 focus-within:shadow-[0_0_0_4px_color-mix(in_oklch,var(--brand)_15%,transparent)]",
          lg && "p-2",
        )}
      >
        <ScanLine className={cn("ml-2 shrink-0 text-muted-foreground", lg ? "size-5" : "size-4")} aria-hidden />
        <label htmlFor={inputId} className="sr-only">
          Program ID or wallet address
        </label>
        <input
          id={inputId}
          name="address"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          placeholder="Paste a program ID or wallet address"
          autoComplete="off"
          spellCheck={false}
          disabled={busy}
          className={cn(
            "min-w-0 flex-1 bg-transparent font-mono outline-none placeholder:font-sans placeholder:text-muted-foreground/70 disabled:opacity-60",
            lg ? "h-12 text-sm sm:text-base" : "h-10 text-sm",
          )}
        />
        <button
          type="submit"
          disabled={busy || !address.trim()}
          className={cn(
            "inline-flex shrink-0 items-center gap-2 rounded-xl bg-foreground px-4 font-medium text-background transition hover:opacity-90 disabled:opacity-40",
            lg ? "h-12 text-sm sm:px-5" : "h-10 text-sm",
          )}
        >
          {busy ? <Loader2 className="size-4 animate-spin" /> : <span className="hidden sm:inline">X-ray it</span>}
          {!busy && <ArrowRight className="size-4" />}
        </button>
      </form>

      <div className="mt-3 min-h-6 text-sm" aria-live="polite">
        {busy ? (
          <p className="flex items-center gap-2 text-muted-foreground">
            <span className="relative flex size-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand opacity-75" />
              <span className="relative inline-flex size-2 rounded-full bg-brand" />
            </span>
            {STEPS[step]}
          </p>
        ) : error ? (
          <p className="text-bad" role="alert">
            {error}
          </p>
        ) : (
          <div className="flex flex-wrap items-center gap-2 text-muted-foreground">
            <span>Try:</span>
            {POPULAR.map((p) => (
              <button
                key={p.address}
                type="button"
                onClick={() => {
                  setAddress(p.address);
                  void run(p.address);
                }}
                className="rounded-full border border-border/70 bg-card/60 px-3 py-1 text-xs text-foreground/80 transition hover:border-brand/50 hover:text-foreground"
              >
                {p.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
