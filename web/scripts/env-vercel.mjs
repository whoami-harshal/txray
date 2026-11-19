// Builds web/.env.vercel from .env.local with only what production needs, ready to paste into
// Vercel → Project → Settings → Environment Variables (paste the whole file into the first "Key" box).
// The output is git-ignored. Usage: pnpm env:vercel
import { readFileSync, writeFileSync } from "node:fs";

const NEEDED = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "HELIUS_RPC_URL",
  "RPC_MAX_RPS",
  "CRON_SECRET",
  "DEMO_PROJECT_ID",
  "CHECKUP_DAILY_LIMIT",
  "NEXT_PUBLIC_GITHUB_URL",
  "NEXT_PUBLIC_X_URL",
];

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .filter((l) => /^[A-Z0-9_]+=/.test(l))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]),
);

const lines = [];
const missing = [];
for (const k of NEEDED) {
  if (env[k]) lines.push(`${k}=${env[k]}`);
  else missing.push(k);
}
writeFileSync(".env.vercel", lines.join("\n") + "\n");
console.log(`wrote .env.vercel with ${lines.length} variables`);
if (missing.length) console.log(`not set (optional unless listed in README): ${missing.join(", ")}`);
