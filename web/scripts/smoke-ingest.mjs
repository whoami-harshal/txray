// End-to-end check of POST /api/ingest against a running dev server.
// Usage: node --env-file=.env.local scripts/smoke-ingest.mjs [baseUrl]
// Needs TXDOCTOR_DEV_API_KEY (created by `pnpm dev:key`).
import { randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const base = process.argv[2] ?? "http://localhost:3000";
const key = process.env.TXDOCTOR_DEV_API_KEY;
if (!key) {
  console.error("Set TXDOCTOR_DEV_API_KEY in .env.local (run `pnpm dev:key`).");
  process.exit(1);
}

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

const label = `smoke-${Date.now()}`;
const now = new Date().toISOString();
const body = {
  events: [
    {
      signature: fakeSig(),
      sent_at: now,
      path: "sender",
      label,
      cu_limit: 200000,
      cu_price: "5000",
      tip_lamports: "1000000",
      last_valid_block_height: "300000000",
    },
    { signature: fakeSig(), sent_at: now, label },
  ],
};

async function post(apiKey) {
  const res = await fetch(`${base}/api/ingest`, {
    method: "POST",
    headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return `${res.status} ${await res.text()}`;
}

const results = {
  first: await post(key),
  duplicate: await post(key),
  wrongKey: await post("txd_wrongwrongwrongwrongwrongwrong12"),
};
for (const [name, r] of Object.entries(results)) console.log(name.padEnd(10), r);

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
const { data, error } = await sb
  .from("tx_events")
  .select("signature,status,path,label,cu_limit,cu_price,tip_lamports,last_valid_block_height")
  .eq("label", label);
if (error) throw error;
console.log(`rows with label ${label}: ${data.length} (expected 2)`);
for (const r of data) console.log({ ...r, signature: r.signature.slice(0, 10) + "…" });

const pass =
  results.first.startsWith("202") &&
  results.duplicate.startsWith("202") &&
  results.wrongKey.startsWith("401") &&
  data.length === 2 &&
  data.every((r) => r.status === "pending");
console.log(pass ? "PASS" : "FAIL");
process.exit(pass ? 0 : 1);
