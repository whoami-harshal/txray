import { describe, expect, it } from "vitest";
import { analyzeCheckup, readComputeBudget } from "@/lib/checkup/analyze";
import { fetchCheckupData, interleave, SAMPLE_FAILED, SAMPLE_SUCCEEDED } from "@/lib/checkup/fetch";
import type { JsonMessage, SignatureInfo, SolanaRpc, TransactionResult } from "@/lib/solana/rpc";
import { encodeBase58, sig } from "./helpers";
import { newSlug, SLUG_ALPHABET } from "@/lib/checkup/slug";

const CB = "ComputeBudget111111111111111111111111111111";
const SYS = "11111111111111111111111111111111";
const JUP = "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4";

function u32ix(kind: number, n: number) {
  const b = new Uint8Array(5);
  b[0] = kind;
  new DataView(b.buffer).setUint32(1, n, true);
  return encodeBase58(b);
}
function u64ix(kind: number, n: number) {
  const b = new Uint8Array(9);
  b[0] = kind;
  new DataView(b.buffer).setBigUint64(1, BigInt(n), true);
  return encodeBase58(b);
}

function message(opts: { limit?: number; price?: number; otherIxs?: number }): JsonMessage {
  const instructions: JsonMessage["instructions"] = [];
  if (opts.limit !== undefined) instructions.push({ programIdIndex: 1, accounts: [], data: u32ix(2, opts.limit) });
  if (opts.price !== undefined) instructions.push({ programIdIndex: 1, accounts: [], data: u64ix(3, opts.price) });
  for (let i = 0; i < (opts.otherIxs ?? 1); i++) instructions.push({ programIdIndex: 2, accounts: [0], data: "3Bxs4h24hBtQy9rw" });
  return { accountKeys: ["Payer1111111111111111111111111111111111111", CB, JUP], instructions };
}

function tx(n: number, opts: { err?: unknown; limit?: number; price?: number; used?: number; logs?: string[] }): TransactionResult {
  return {
    slot: 1000 + n,
    blockTime: 1_795_000_000 + n,
    transaction: { signatures: [sig(`t${n}`)], message: message({ limit: opts.limit, price: opts.price }) },
    meta: { err: opts.err ?? null, fee: 5000 + n, computeUnitsConsumed: opts.used ?? 100_000, logMessages: opts.logs ?? [] },
  };
}

describe("readComputeBudget", () => {
  it("reads explicit limit and price", () => {
    expect(readComputeBudget(message({ limit: 300_000, price: 12_345 }))).toEqual({
      cuLimit: 300_000,
      effectiveLimit: 300_000,
      cuPrice: 12_345,
      priorityFeeLamports: null,
    });
  });

  it("reads v1 transactionConfig (shape from a real mainnet Jupiter tx)", () => {
    const m: JsonMessage = {
      accountKeys: ["Payer1111111111111111111111111111111111111", JUP],
      instructions: [{ programIdIndex: 1, accounts: [0], data: "3Bxs4h24hBtQy9rw" }],
      transactionConfig: { computeUnitLimit: 145_656, heapSize: null, loadedAccountsDataSizeLimit: 67_108_864, priorityFee: 1457 },
    };
    expect(readComputeBudget(m)).toEqual({ cuLimit: 145_656, effectiveLimit: 145_656, cuPrice: null, priorityFeeLamports: 1457 });
  });

  it("treats null v1 config fields as not set", () => {
    const m: JsonMessage = {
      accountKeys: ["P", JUP],
      instructions: [{ programIdIndex: 1, accounts: [0], data: "3Bxs" }],
      transactionConfig: { computeUnitLimit: null, heapSize: null, loadedAccountsDataSizeLimit: null, priorityFee: null },
    };
    expect(readComputeBudget(m)).toMatchObject({ cuLimit: null, priorityFeeLamports: null });
  });

  it("falls back to 200k per non-budget instruction, capped at 1.4M", () => {
    expect(readComputeBudget(message({ otherIxs: 2 }))).toMatchObject({ cuLimit: null, effectiveLimit: 400_000 });
    expect(readComputeBudget(message({ otherIxs: 9 }))!.effectiveLimit).toBe(1_400_000);
    expect(readComputeBudget(undefined)).toBeNull();
  });

  it("ignores system program instructions", () => {
    const m: JsonMessage = { accountKeys: ["P", SYS], instructions: [{ programIdIndex: 1, accounts: [0], data: "3Bxs" }] };
    expect(readComputeBudget(m)).toMatchObject({ cuLimit: null, effectiveLimit: 200_000 });
  });
});

describe("analyzeCheckup", () => {
  const slippage = {
    err: { InstructionError: [2, { Custom: 6001 }] },
    logs: [`Program ${JUP} failed: custom program error: 0x1771`],
  };

  it("computes failure rate, reasons, compute waste and a score", () => {
    const details = [
      ...Array.from({ length: 8 }, (_, i) => tx(i, { limit: 400_000, price: 1000, used: 100_000 })),
      tx(8, { ...slippage, limit: 400_000 }),
      tx(9, { err: { InstructionError: [0, "ComputationalBudgetExceeded"] }, limit: 400_000 }),
    ];
    const statuses = details.map((d) => ({
      signature: d.transaction!.signatures[0]!,
      err: d.meta!.err,
      blockTime: d.blockTime,
    }));
    const r = analyzeCheckup({ address: JUP, kind: "program", statuses, details, source: "full", now: new Date("2026-11-19T00:00:00Z") });

    expect(r).toMatchObject({ total: 10, failed: 2, succeeded: 8, failureRate: 20, failuresInspected: 2 });
    expect(r.categories).toEqual(
      expect.arrayContaining([
        { category: "SLIPPAGE", count: 1 },
        { category: "COMPUTE_EXCEEDED", count: 1 },
      ]),
    );
    expect(r.compute).toMatchObject({ sample: 8, avgLimit: 400_000, avgConsumed: 100_000, wastePct: 75, setsCuLimitPct: 100, setsCuPricePct: 100, suggestedLimit: 110_000 });
    // 100 − 30 (20% failed × 1.5) − 22 ((75−20) × 0.4)
    expect(r.score).toBe(48);
    expect(r.scoreBreakdown.map((b) => b.points)).toEqual([-30, -22]);
    expect(r.window.from).toBe(new Date(1_795_000_000 * 1000).toISOString());
  });

  it("gives a healthy program a high score", () => {
    const details = Array.from({ length: 20 }, (_, i) => tx(i, { limit: 120_000, price: 1000, used: 100_000 }));
    const statuses = details.map((d) => ({ signature: d.transaction!.signatures[0]!, err: null, blockTime: d.blockTime }));
    const r = analyzeCheckup({ address: JUP, kind: "program", statuses, details, source: "full", now: new Date() });
    expect(r.score).toBe(100);
    expect(r.scoreBreakdown).toEqual([]);
  });

  it("penalizes missing CU limit and priority fee", () => {
    const details = Array.from({ length: 6 }, (_, i) => tx(i, { used: 190_000 }));
    const statuses = details.map((d) => ({ signature: d.transaction!.signatures[0]!, err: null, blockTime: d.blockTime }));
    const r = analyzeCheckup({ address: JUP, kind: "wallet", statuses, details, source: "sampled", now: new Date() });
    expect(r.compute.setsCuLimitPct).toBe(0);
    expect(r.scoreBreakdown.map((b) => b.points)).toEqual([-10, -5]);
    expect(r.score).toBe(85);
  });

  it("doesn't score compute from a tiny sample", () => {
    const details = Array.from({ length: 3 }, (_, i) => tx(i, { limit: 400_000, used: 10_000 }));
    const statuses = details.map((d) => ({ signature: d.transaction!.signatures[0]!, err: null, blockTime: d.blockTime }));
    const r = analyzeCheckup({ address: JUP, kind: "program", statuses, details, source: "sampled", now: new Date() });
    expect(r.compute.wastePct).toBeGreaterThan(90); // still reported
    expect(r.score).toBe(100); // but not penalized
  });

  it("handles an address with no transactions", () => {
    const r = analyzeCheckup({ address: JUP, kind: "unknown", statuses: [], details: [], source: "sampled", now: new Date() });
    expect(r).toMatchObject({ total: 0, failureRate: 0, score: 100, window: { from: null, to: null } });
  });
});

function fakeRpc(opts: { gtfa?: TransactionResult[]; sigs?: SignatureInfo[]; txs?: Map<string, TransactionResult> }) {
  const calls: string[] = [];
  const rpc: SolanaRpc = {
    requests: 0,
    getBlockHeight: async () => 0,
    getSignatureStatuses: async () => [],
    getAccountInfo: async () => (calls.push("getAccountInfo"), { executable: true, owner: "BPFLoaderUpgradeab1e11111111111111111111111" }),
    getTransactionsForAddress: async () => {
      calls.push("getTransactionsForAddress");
      if (!opts.gtfa) throw new Error("method requires a Developer plan");
      return opts.gtfa;
    },
    getSignaturesForAddress: async () => (calls.push("getSignaturesForAddress"), opts.sigs ?? []),
    getTransaction: async (s) => (calls.push("getTransaction"), opts.txs?.get(s) ?? null),
  };
  return { rpc, calls };
}

describe("fetchCheckupData", () => {
  it("uses getTransactionsForAddress when the plan allows it", async () => {
    const txs = [tx(1, {}), tx(2, { err: { InstructionError: [0, { Custom: 1 }] } })];
    const { rpc, calls } = fakeRpc({ gtfa: txs });
    const data = await fetchCheckupData(rpc, JUP);
    expect(data.source).toBe("full");
    expect(data.kind).toBe("program");
    expect(data.statuses).toHaveLength(2);
    expect(data.statuses[1]!.err).toBeTruthy();
    expect(calls).not.toContain("getSignaturesForAddress");
  });

  it("falls back to signatures + a sampled getTransaction on the free plan", async () => {
    const sigs: SignatureInfo[] = Array.from({ length: 500 }, (_, i) => ({
      signature: sig(`s${i}`),
      slot: i,
      err: i % 5 === 0 ? { InstructionError: [0, { Custom: 1 }] } : null,
      blockTime: 1_795_000_000 + i,
    }));
    const txs = new Map(sigs.map((s, i) => [s.signature, tx(i, { err: s.err ?? undefined })]));
    const { rpc, calls } = fakeRpc({ sigs, txs });
    const data = await fetchCheckupData(rpc, JUP);
    expect(data.source).toBe("sampled");
    expect(data.statuses).toHaveLength(500);
    expect(calls.filter((c) => c === "getTransaction")).toHaveLength(SAMPLE_FAILED + SAMPLE_SUCCEEDED);
    expect(data.details.filter((d) => d.meta?.err)).toHaveLength(SAMPLE_FAILED);
  });
});

describe("interleave", () => {
  it("mixes two lists in proportion so an early stop still gets both", () => {
    const out = interleave(["F1", "F2", "F3", "F4"], ["S1", "S2"]);
    expect(out).toEqual(["F1", "S1", "F2", "F3", "S2", "F4"]);
    expect(out.slice(0, 3)).toContain("S1");
    expect(interleave([1, 2], [])).toEqual([1, 2]);
    expect(interleave([], ["a"])).toEqual(["a"]);
  });
});

describe("newSlug", () => {
  it("only ever uses alphabet characters (regression: 'undefined' in slugs)", () => {
    const allowed = new Set(SLUG_ALPHABET);
    for (let i = 0; i < 2000; i++) {
      const s = newSlug();
      expect(s).toHaveLength(10);
      expect([...s].every((c) => allowed.has(c))).toBe(true);
    }
  });
});
