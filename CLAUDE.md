# Transaction Doctor (txdoctor)

Solo-dev Solana transaction monitoring: SDK wraps a send call -> backend tracks
whether each tx landed/failed/expired and why -> dashboard + free "Checkup" page.

## Layout
- `web/` — Next.js 16 (App Router, TS, Tailwind v4, shadcn/ui) + Supabase. Dashboard, API routes, tracker cron.
  Next 16 has breaking changes: read `web/node_modules/next/dist/docs/` before using a Next API.
- `sdk/` — `@txdoctor/sdk`, TypeScript, built with tsup (ESM + CJS), zero runtime deps.
- `scripts/` — devnet test scripts.

## Rules
1. Before using any Helius/Solana API, check the live docs (Helius MCP or
   https://www.helius.dev/docs/llms.txt). Don't guess method names or params.
2. Keep it simple: solo dev, free tiers only (Helius free, Supabase free, Vercel Hobby), no extra services.
3. The SDK must never throw or slow down the user's app. Never send private keys or full signed txs.
4. Batch RPC calls and stay under 10 requests/second (Helius free plan).

## Commands
- `cd web && pnpm dev` / `pnpm test` / `pnpm build`
- `cd sdk && pnpm test` / `pnpm build`
