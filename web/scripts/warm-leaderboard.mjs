// Admin helper: runs fresh checkups on well-known programs so the leaderboard isn't empty at launch.
// Uses a running server (local dev by default); results land in the same Supabase as production.
// Clears its own rate-limit rows as it goes so the per-IP limit doesn't block it.
// Usage: node --env-file=.env.local scripts/warm-leaderboard.mjs [baseUrl]
import { createClient } from "@supabase/supabase-js";

const base = process.argv[2] ?? "http://localhost:3000";
const PROGRAMS = {
  "Jupiter v6": "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4",
  "Raydium AMM v4": "675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8",
  "Raydium CPMM": "CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C",
  "Raydium CLMM": "CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK",
  "Orca Whirlpools": "whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc",
  "Meteora DLMM": "LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo",
  "Pump.fun": "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P",
  PumpSwap: "pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA",
  Phoenix: "PhoeNiXZ8ByJGLkxNfZRnkUfjvmuYqLR89jjFHGqdXY",
  "Drift v2": "dRiftyHA39MWEi3m9aunc5MzRF1JYuBsbn6VPcn33UH",
  "marginfi v2": "MFv2hWf31Z9kbCa1snEPYctwafyhdvnV7FZnsebVacA",
  "Kamino Lend": "KLend2g3cP87fffoy8q1mQqGKjrxjC8boSyAYavgmjD",
};

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
const started = new Date(Date.now() - 5_000).toISOString();

for (const [name, address] of Object.entries(PROGRAMS)) {
  const t = Date.now();
  const res = await fetch(`${base}/api/checkup`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ address }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.log(`FAIL ${name.padEnd(16)} HTTP ${res.status} ${body.error ?? ""}`);
  } else {
    const { data } = await sb.from("checkups").select("report").eq("slug", body.slug).single();
    const r = data?.report;
    const top = r?.categories?.[0]?.category ?? "-";
    console.log(
      `OK   ${name.padEnd(16)} score ${String(r?.score).padStart(3)}  failed ${String(r?.failureRate).padStart(5)}%  top: ${top.padEnd(18)} ${body.cached ? "(cached)" : ""} /r/${body.slug}  ${Date.now() - t}ms`,
    );
  }
  // Remove only the rate-limit rows this run created, so it doesn't block itself or count toward the daily cap.
  await sb.from("checkup_requests").delete().gte("created_at", started);
}
