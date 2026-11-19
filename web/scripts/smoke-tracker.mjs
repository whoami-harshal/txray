// End-to-end check of the tracker: ingest real mainnet signatures, run the cron route, read results.
// Usage: node --env-file=.env.local scripts/smoke-tracker.mjs [baseUrl]
// Needs a running dev server, TXDOCTOR_DEV_API_KEY, CRON_SECRET and HELIUS_RPC_URL.
import { randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const base = process.argv[2] ?? "http://localhost:3000";
const { TXDOCTOR_DEV_API_KEY: key, CRON_SECRET: secret, HELIUS_RPC_URL: rpcUrl } = process.env;
if (!key || !secret || !rpcUrl) {
  console.error("Need TXDOCTOR_DEV_API_KEY, CRON_SECRET and HELIUS_RPC_URL in .env.local");
  process.exit(1);
}

const rpc = async (method, params) => {
  const res = await fetch(rpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const body = await res.json();
  if (body.error) throw new Error(`${method}: ${body.error.message}`);
  return body.result;
};

// Real recent Jupiter transactions: one that succeeded, one that failed.
const recent = await rpc("getSignaturesForAddress", ["JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4", { limit: 50 }]);
const ok = recent.find((s) => !s.err);
const failed = recent.find((s) => s.err);
const height = await rpc("getBlockHeight", [{ commitment: "finalized" }]);

const label = `tracker-smoke-${Date.now()}`;
function encodeBase58(bytes) {
  const A = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
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
  return "1".repeat(zeros) + digits.reverse().map((d) => A[d]).join("");
}
// A valid but never-sent signature: base58 of 64 random bytes.
const fakeSig = () => encodeBase58(randomBytes(64));
const sentAt = (s) => new Date(((s.blockTime ?? Date.now() / 1000) - 2) * 1000).toISOString();

const cases = [
  { name: "real success", expect: "success", event: { signature: ok.signature, sent_at: sentAt(ok) } },
  failed && { name: "real failure", expect: "failed", event: { signature: failed.signature, sent_at: sentAt(failed) } },
  {
    name: "never landed, blockhash expired",
    expect: "expired",
    event: { signature: fakeSig(), sent_at: new Date().toISOString(), last_valid_block_height: String(height - 10) },
  },
  {
    name: "never landed, still valid",
    expect: "pending",
    event: { signature: fakeSig(), sent_at: new Date().toISOString(), last_valid_block_height: String(height + 150) },
  },
].filter(Boolean);

const ingest = await fetch(`${base}/api/ingest`, {
  method: "POST",
  headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
  body: JSON.stringify({ events: cases.map((c) => ({ ...c.event, label })) }),
});
console.log("ingest:", ingest.status, await ingest.text());

const t0 = Date.now();
const track = await fetch(`${base}/api/cron/track?secret=${encodeURIComponent(secret)}`);
console.log(`cron/track: ${track.status} in ${Date.now() - t0}ms`, await track.text());

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
const { data, error } = await sb
  .from("tx_events")
  .select("signature,status,landed_slot,confirm_ms,fee_lamports,cu_consumed,error_category")
  .eq("label", label);
if (error) throw error;

let pass = true;
for (const c of cases) {
  const r = data.find((d) => d.signature === c.event.signature);
  const good = r?.status === c.expect;
  pass &&= good;
  console.log(`${good ? "OK  " : "FAIL"} ${c.name.padEnd(32)} expected ${c.expect.padEnd(8)} got ${r?.status}`, {
    slot: r?.landed_slot,
    confirm_ms: r?.confirm_ms,
    fee: r?.fee_lamports,
    cu: r?.cu_consumed,
    category: r?.error_category,
  });
}
console.log(pass ? "PASS" : "FAIL");
process.exit(pass ? 0 : 1);
