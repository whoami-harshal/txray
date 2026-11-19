// Seeds ~2000 realistic fake tx_events over the last 7 days so the dashboard has something to show.
// Usage: node --env-file=.env.local scripts/seed.mjs [--count 2000] [--project <uuid>] [--reset]
//   --reset deletes all existing events of that project first.
// Default project: the first project of dev@txdoctor.local (created by `pnpm dev:key`).
import { randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const args = process.argv.slice(2);
const arg = (name, def) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : def;
};
const COUNT = Number(arg("count", 2000));
const RESET = args.includes("--reset");

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

async function devProjectId() {
  const { data: users, error } = await sb.auth.admin.listUsers({ perPage: 1000 });
  if (error) throw error;
  const dev = users.users.find((u) => u.email === "dev@txdoctor.local");
  if (!dev) throw new Error("No dev user; run `pnpm dev:key` first or pass --project");
  const { data, error: pErr } = await sb.from("projects").select("id").eq("user_id", dev.id).order("created_at").limit(1);
  if (pErr) throw pErr;
  if (!data.length) throw new Error("Dev user has no project; run `pnpm dev:key`");
  return data[0].id;
}

const projectId = arg("project") ?? (await devProjectId());

// ─── random helpers ──────────────────────────────────────────────────────────
const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
function encodeBase58(bytes) {
  let zeros = 0;
  while (zeros < bytes.length && bytes[zeros] === 0) zeros++;
  const digits = [];
  for (let i = zeros; i < bytes.length; i++) {
    let carry = bytes[i];
    for (let j = 0; j < digits.length; j++) {
      carry += digits[j] << 8;
      digits[j] = carry % 58;
      carry = (carry / 58) | 0;
    }
    while (carry > 0) {
      digits.push(carry % 58);
      carry = (carry / 58) | 0;
    }
  }
  return "1".repeat(zeros) + digits.reverse().map((d) => B58[d]).join("");
}
const sig = () => encodeBase58(randomBytes(64));
const rand = (a, b) => a + Math.random() * (b - a);
const randInt = (a, b) => Math.floor(rand(a, b + 1));
function pick(weights) {
  const total = Object.values(weights).reduce((s, w) => s + w, 0);
  let r = Math.random() * total;
  for (const [k, w] of Object.entries(weights)) if ((r -= w) <= 0) return k;
  return Object.keys(weights)[0];
}
// log-normal around a median
const lognormal = (median, spread) => median * Math.exp(spread * Math.sqrt(-2 * Math.log(Math.random())) * Math.cos(2 * Math.PI * Math.random()));

// ─── shape of the fake traffic ───────────────────────────────────────────────
const LABELS = {
  swap: { weight: 60, cuLimit: 400_000, cuUsed: 180_000, failure: { SLIPPAGE: 70, COMPUTE_EXCEEDED: 12, INSUFFICIENT_FUNDS: 10, PROGRAM_ERROR: 8 } },
  transfer: { weight: 20, cuLimit: 200_000, cuUsed: 450, failure: { INSUFFICIENT_FUNDS: 80, PROGRAM_ERROR: 20 } },
  mint: { weight: 15, cuLimit: 250_000, cuUsed: 90_000, failure: { COMPUTE_EXCEEDED: 45, PROGRAM_ERROR: 40, INSUFFICIENT_FUNDS: 15 } },
  claim: { weight: 5, cuLimit: 300_000, cuUsed: 60_000, failure: { PROGRAM_ERROR: 80, INSUFFICIENT_FUNDS: 20 } },
};
const PATHS = { sender: 50, rpc: 40, other: 10 };
// Base outcome odds per path (an "incident" window makes things worse)
const OUTCOMES = {
  sender: { success: 88, failed: 8, expired: 3, unknown: 1 },
  rpc: { success: 74, failed: 9, expired: 14, unknown: 3 },
  other: { success: 80, failed: 9, expired: 8, unknown: 3 },
};

const now = Date.now();
const WEEK = 7 * 86_400_000;
const incidentStart = now - 30 * 3_600_000; // 30h ago, lasting 2h: congestion → many expiries
const incidentEnd = incidentStart + 2 * 3_600_000;

function makeEvent() {
  // More traffic recently and during the day (UTC)
  const sentAt = now - WEEK * Math.pow(Math.random(), 1.3);
  const label = pick(Object.fromEntries(Object.entries(LABELS).map(([k, v]) => [k, v.weight])));
  const path = pick(PATHS);
  const L = LABELS[label];

  const odds = { ...OUTCOMES[path] };
  if (sentAt > incidentStart && sentAt < incidentEnd) {
    odds.success *= 0.6;
    odds.expired *= 6;
  }
  let status = now - sentAt < 60_000 ? "pending" : pick(odds);

  const hasCuLimit = label === "transfer" ? Math.random() < 0.4 : Math.random() < 0.95;
  const cuLimit = hasCuLimit ? L.cuLimit : null;
  const cuPrice = Math.random() < 0.9 ? randInt(1_000, 250_000) : null;
  const tip = path === "sender" ? (Math.random() < 0.5 ? 1_000_000 : randInt(5_000, 200_000)) : null;

  const e = {
    project_id: projectId,
    signature: sig(),
    sent_at: new Date(sentAt).toISOString(),
    path,
    label,
    cu_limit: cuLimit,
    cu_price: cuPrice,
    tip_lamports: tip,
    last_valid_block_height: 300_000_000 + Math.floor((sentAt - (now - WEEK)) / 400) + 150,
    status,
    created_at: new Date(sentAt + 500).toISOString(),
  };

  if (status === "success" || status === "failed") {
    const confirmMs = Math.max(350, Math.round(lognormal(path === "sender" ? 900 : 2400, 0.55)));
    let category = status === "failed" ? pick(L.failure) : null;
    let used = Math.max(150, Math.round(lognormal(L.cuUsed, 0.25)));
    if (category === "COMPUTE_EXCEEDED") used = cuLimit ?? 200_000;
    const effectiveLimit = cuLimit ?? 200_000;
    Object.assign(e, {
      landed_slot: 380_000_000 + Math.floor((sentAt - (now - WEEK)) / 400),
      block_time: new Date(Math.floor((sentAt + confirmMs) / 1000) * 1000).toISOString(),
      confirm_ms: confirmMs,
      fee_lamports: 5000 + Math.ceil(((cuPrice ?? 0) * effectiveLimit) / 1_000_000),
      cu_consumed: Math.min(used, effectiveLimit),
      error_category: category,
      error_raw: category ? { err: { InstructionError: [2, { Custom: 6001 }] }, seeded: true } : null,
    });
  } else if (status === "expired") {
    e.error_category = "BLOCKHASH_EXPIRED";
  }
  return e;
}

if (RESET) {
  const { error, count } = await sb.from("tx_events").delete({ count: "exact" }).eq("project_id", projectId);
  if (error) throw error;
  console.log(`deleted ${count} existing events`);
}

const rows = Array.from({ length: COUNT }, makeEvent);
for (let i = 0; i < rows.length; i += 500) {
  const { error } = await sb.from("tx_events").insert(rows.slice(i, i + 500));
  if (error) throw error;
  process.stdout.write(`\rinserted ${Math.min(i + 500, rows.length)}/${rows.length}`);
}
console.log(`\nseeded project ${projectId}`);
