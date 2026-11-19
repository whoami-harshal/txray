# TxRay

**X-ray your Solana transactions.** Find out which of them land, fail, or expire, and why.

A "sent" Solana transaction can still fail on-chain, expire before it lands, or quietly vanish. Most apps never find out which, or why. TxRay shows you.

## What it does

- **Free Checkup.** Paste any program ID or wallet and get its last 500 transactions analysed:
  - failure rate
  - why transactions fail (slippage, compute limits, insufficient funds, program errors)
  - average fee and unused compute
  - a 0–100 health score that lists what each lost point is for

  Each report gets a link you can share. No signup.
- **Dashboard.** Landing rate per hour, failures by reason, median and p95 confirm time, fees, and suggested compute unit limits per transaction type. Each common failure type gets a plain-English fix. The public site shows it with demo data.
- **SDK** (`sdk/`). Wrap your send call to track every transaction until it lands, fails, or expires, including the ones that never reach a block. It has zero runtime dependencies, never throws, and never sends keys or signed transactions.

```ts
import { createTxRay } from "@txray/sdk";

const txray = createTxRay({ apiKey: process.env.TXRAY_API_KEY });

await txray.trackSend(() => connection.sendRawTransaction(tx.serialize()), {
  transaction: tx,
  label: "swap",
});
```

## How it works

```
SDK ──POST /api/ingest──▶ Supabase (tx_events: pending)
                                │
cron ──GET /api/cron/track──▶ Helius: getSignatureStatuses (256 per call)
                                │      getTransaction (fee, compute used, logs)
                                ▼
            success / failed (+ reason) / expired / unknown ──▶ dashboard

Checkup ──▶ Helius getTransactionsForAddress (500 full transactions, 1 call)
            └─ fallback: getSignaturesForAddress + sampled getTransaction
```

- **Failure reasons** come from `meta.err` plus program logs. Slippage is recognised by Jupiter, Raydium and Orca error codes and log lines.
- **Expired** means the finalized block height has passed the transaction's `lastValidBlockHeight`, so it can never land.
- **Transaction v1.** Compute settings are read from `transactionConfig`, which replaces ComputeBudget instructions in v1. `priorityFee` there is total lamports, not a price per compute unit.
- **Free tiers only.** RPC calls are throttled to 8/s (Helius free allows 10/s). Each address's checkup is cached for 1 hour, each IP gets 3 fresh checkups per hour, and there's a daily cap across the whole site.

## Stack

Next.js 16 (App Router, Cache Components) · Tailwind v4 + shadcn/ui · Recharts · Supabase (Postgres) · Helius RPC · Vercel. The SDK is TypeScript built with tsup (ESM + CJS).

## Run it locally

Needs Node 22+, pnpm, a free [Supabase](https://supabase.com) project and a free [Helius](https://dashboard.helius.dev) API key.

1. Copy `web/.env.example` to `web/.env.local` and fill it in.
2. In the Supabase SQL editor, run the files in `web/supabase/migrations/` in order (001 → 004).
3. Install, create a demo project and fill it with sample data. Put the project id it prints into `DEMO_PROJECT_ID`.
4. Start the dev server and open http://localhost:3000.

```bash
cd web
pnpm install
pnpm dev:key           # creates a dev user, project and API key
pnpm db:seed --reset   # ~2,000 realistic sample transactions over 7 days
pnpm dev
```

| Command | What it does |
|---|---|
| `pnpm test` | unit tests (web) |
| `pnpm db:check` | checks the database tables are reachable |
| `pnpm smoke:ingest` | end-to-end test of `/api/ingest` |
| `pnpm smoke:tracker` | end-to-end test of the tracker on real mainnet transactions |
| `cd sdk && pnpm test` | SDK tests |

## Limitations

- On-chain data can't show transactions that were dropped before landing. The Checkup only sees what reached a block, so tracking your real landing rate needs the SDK.
- Failure rates on busy programs include bot traffic (arbitrage bots fail on purpose a lot), so read them as "of all on-chain transactions", not "of user swaps".
- The public dashboard runs on demo data. Sign-up and API keys aren't public yet.
