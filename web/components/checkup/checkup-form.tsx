"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const EXAMPLES = [
  { name: "Jupiter v6", address: "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4" },
  { name: "Raydium AMM", address: "675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8" },
];

export function CheckupForm() {
  const router = useRouter();
  const [address, setAddress] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(value: string) {
    const addr = value.trim();
    if (!addr) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/checkup", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ address: addr }),
      });
      const body = (await res.json().catch(() => ({}))) as { slug?: string; error?: string };
      if (!res.ok || !body.slug) throw new Error(body.error ?? "Something went wrong.");
      router.push(`/r/${body.slug}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
      setLoading(false);
    }
  }

  return (
    <div>
      <form
        className="flex flex-col gap-3 sm:flex-row"
        onSubmit={(e) => {
          e.preventDefault();
          void run(address);
        }}
      >
        <label htmlFor="address" className="sr-only">
          Program ID or wallet address
        </label>
        <input
          id="address"
          name="address"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          placeholder="Program ID or wallet address"
          autoComplete="off"
          spellCheck={false}
          disabled={loading}
          className="h-11 min-w-0 flex-1 rounded-lg border bg-background px-3 font-mono text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:opacity-60"
        />
        <button
          type="submit"
          disabled={loading || !address.trim()}
          className="h-11 rounded-lg bg-foreground px-5 text-sm font-medium text-background hover:bg-foreground/90 disabled:opacity-50"
        >
          {loading ? "Checking…" : "Run checkup"}
        </button>
      </form>

      {loading && (
        <p className="mt-3 text-sm text-muted-foreground" role="status">
          Reading the last 500 transactions on-chain. This takes 5–20 seconds.
        </p>
      )}
      {error && (
        <p className="mt-3 text-sm text-red-600" role="alert">
          {error}
        </p>
      )}

      {!loading && (
        <p className="mt-4 text-sm text-muted-foreground">
          Try:{" "}
          {EXAMPLES.map((ex, i) => (
            <span key={ex.address}>
              {i > 0 && " · "}
              <button
                type="button"
                className="underline underline-offset-2 hover:text-foreground"
                onClick={() => {
                  setAddress(ex.address);
                  void run(ex.address);
                }}
              >
                {ex.name}
              </button>
            </span>
          ))}
        </p>
      )}
    </div>
  );
}
