import { describe, expect, it, vi } from "vitest";
import { runTracker, type PendingRow, type RowUpdate, type TrackerStore } from "@/lib/tracker";
import { createRpc, type SignatureStatus, type SolanaRpc, type TransactionResult } from "@/lib/solana/rpc";
import { sig } from "./helpers";

const NOW = Date.parse("2026-11-19T12:00:00Z");
const ago = (ms: number) => new Date(NOW - ms).toISOString();

function row(signature: string, sentAgoMs: number, lvbh: number | null = 1000): PendingRow {
  return { id: signature, project_id: "p1", signature: sig(signature), sent_at: ago(sentAgoMs), last_valid_block_height: lvbh };
}

function memoryStore(rows: PendingRow[]) {
  const saved: RowUpdate[] = [];
  const store: TrackerStore = {
    loadPending: async (limit) => rows.slice(0, limit),
    saveUpdates: async (u) => void saved.push(...u),
    cleanup: async () => 3,
  };
  return { store, saved };
}

const names = new Map<string, string>();
for (const n of ["v1", "sdk", "ok", "fail", "expired", "waiting", "nolvbh-old", "nolvbh-new", "processed-only", "a", "b", "late", ...Array.from({ length: 10 }, (_, i) => `s${i}`)]) names.set(sig(n), n);

function fakeRpc(opts: {
  blockHeight: number;
  statuses: Record<string, SignatureStatus | null>;
  txs?: Record<string, TransactionResult | null>;
  txError?: boolean;
}): SolanaRpc {
  let requests = 0;
  const name = (s: string) => names.get(s) ?? s;
  return {
    get requests() {
      return requests;
    },
    getBlockHeight: async () => (requests++, opts.blockHeight),
    getSignatureStatuses: async (sigs) => (requests++, sigs.map((s) => opts.statuses[name(s)] ?? null)),
    getSignaturesForAddress: async () => [],
    getTransactionsForAddress: async () => [],
    getAccountInfo: async () => null,
    getTransaction: async (sig) => {
      requests++;
      if (opts.txError) throw new Error("boom");
      return opts.txs?.[name(sig)] ?? null;
    },
  };
}

const confirmed = (slot: number, err: unknown = null): SignatureStatus => ({
  slot,
  confirmations: 5,
  err,
  confirmationStatus: "confirmed",
});

describe("runTracker", () => {
  it("resolves success, failed, expired, unknown and keeps the rest pending", async () => {
    const sentAgo = 20_000;
    const rows = [
      row("ok", sentAgo),
      row("fail", sentAgo),
      row("expired", sentAgo, 900), // block height 1000 > 900
      row("waiting", sentAgo, 1100), // still valid
      row("nolvbh-old", 5 * 60_000, null),
      row("nolvbh-new", 30_000, null),
      row("processed-only", sentAgo),
    ];
    const blockTime = Math.floor((NOW - sentAgo + 1500) / 1000); // landed ~1.5s after send
    const { store, saved } = memoryStore(rows);
    const rpc = fakeRpc({
      blockHeight: 1000,
      statuses: {
        ok: confirmed(500),
        fail: confirmed(501, { InstructionError: [0, "ComputationalBudgetExceeded"] }),
        "processed-only": { slot: 502, confirmations: 0, err: null, confirmationStatus: "processed" },
      },
      txs: {
        ok: { slot: 500, blockTime, meta: { err: null, fee: 5000, computeUnitsConsumed: 1234, logMessages: [] } },
        fail: {
          slot: 501,
          blockTime,
          meta: {
            err: { InstructionError: [0, "ComputationalBudgetExceeded"] },
            fee: 5000,
            computeUnitsConsumed: 200,
            logMessages: ["Program X failed: exceeded CUs meter at BPF instruction"],
          },
        },
      },
    });

    const summary = await runTracker({ store, rpc, now: () => NOW });
    const by = Object.fromEntries(saved.map((u) => [u.id, u]));

    expect(by.ok).toMatchObject({
      status: "success",
      landed_slot: 500,
      fee_lamports: 5000,
      cu_consumed: 1234,
      error_category: null,
    });
    expect(by.ok!.confirm_ms).toBeGreaterThanOrEqual(500);
    expect(by.ok!.confirm_ms).toBeLessThanOrEqual(2500);
    expect(by.fail).toMatchObject({ status: "failed", error_category: "COMPUTE_EXCEEDED" });
    expect((by.fail!.error_raw as { logs: string[] }).logs).toHaveLength(1);
    expect(by.expired).toMatchObject({ status: "expired", error_category: "BLOCKHASH_EXPIRED" });
    expect(by["nolvbh-old"]).toMatchObject({ status: "unknown" });
    expect(by.waiting).toBeUndefined();
    expect(by["nolvbh-new"]).toBeUndefined();
    expect(by["processed-only"]).toBeUndefined();

    expect(summary).toMatchObject({
      loaded: 7,
      success: 1,
      failed: 1,
      expired: 1,
      unknown: 1,
      stillPending: 3,
      cleanedUp: 3,
      timedOut: false,
    });
    // Every update carries the same keys (safe bulk upsert)
    const keys = Object.keys(saved[0]!).sort().join();
    expect(saved.every((u) => Object.keys(u).sort().join() === keys)).toBe(true);
  });

  it("fills cu_limit from the landed tx (v1 transactionConfig), keeping the SDK value otherwise", async () => {
    const { store, saved } = memoryStore([{ ...row("v1", 20_000), cu_limit: null }, { ...row("sdk", 20_000), cu_limit: 300_000 }]);
    const v1Tx: TransactionResult = {
      slot: 9,
      blockTime: null,
      transaction: {
        signatures: [sig("v1")],
        message: { accountKeys: ["P", "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4"], instructions: [], transactionConfig: { computeUnitLimit: 145_656, priorityFee: 1457 } },
      },
      meta: { err: null, fee: 6457, computeUnitsConsumed: 121_642 },
    };
    const rpc = fakeRpc({
      blockHeight: 1,
      statuses: { v1: confirmed(9), sdk: confirmed(10) },
      txs: { v1: v1Tx, sdk: { slot: 10, blockTime: null, meta: { err: null, fee: 5000 } } },
    });
    await runTracker({ store, rpc, now: () => NOW });
    const by = Object.fromEntries(saved.map((u) => [u.id, u]));
    expect(by.v1!.cu_limit).toBe(145_656);
    expect(by.sdk!.cu_limit).toBe(300_000);
  });

  it("leaves landed txs pending when getTransaction has no details yet or errors", async () => {
    const { store, saved } = memoryStore([row("a", 20_000), row("b", 20_000)]);
    const rpc = fakeRpc({ blockHeight: 1, statuses: { a: confirmed(1), b: confirmed(2) }, txError: true });
    const summary = await runTracker({ store, rpc, now: () => NOW });
    expect(saved).toHaveLength(0);
    expect(summary.rpcErrors).toBe(2);
    expect(summary.stillPending).toBe(2);
  });

  it("falls back to status-only after the details grace period", async () => {
    const { store, saved } = memoryStore([row("late", 15 * 60_000)]);
    const rpc = fakeRpc({ blockHeight: 1, statuses: { late: confirmed(77) }, txs: { late: null } });
    await runTracker({ store, rpc, now: () => NOW });
    expect(saved[0]).toMatchObject({ status: "success", landed_slot: 77, fee_lamports: null });
  });

  it("stops fetching details when the time budget runs out", async () => {
    const rows = Array.from({ length: 10 }, (_, i) => row(`s${i}`, 20_000));
    const { store, saved } = memoryStore(rows);
    let t = NOW;
    const rpc = fakeRpc({
      blockHeight: 1,
      statuses: Object.fromEntries(rows.map((r) => [r.id, confirmed(1)])),
      txs: Object.fromEntries(
        rows.map((r) => [r.id, { slot: 1, blockTime: null, meta: { err: null, fee: 5000 } }]),
      ),
    });
    const slowRpc: SolanaRpc = {
      ...rpc,
      get requests() {
        return rpc.requests;
      },
      getTransaction: async (s) => {
        t += 10_000; // each call "takes" 10s
        return rpc.getTransaction(s);
      },
    };
    const summary = await runTracker({ store, rpc: slowRpc, now: () => t, budgetMs: 45_000, concurrency: 1 });
    expect(summary.timedOut).toBe(true);
    expect(saved.length).toBeLessThan(10);
    expect(summary.cleanedUp).toBe(0); // skipped: out of time
  });

  it("settles malformed signatures as unknown without sending them to the RPC", async () => {
    const bad: PendingRow = { id: "bad", project_id: "p1", signature: "z".repeat(88), sent_at: ago(1000), last_valid_block_height: null };
    const { store, saved } = memoryStore([bad, row("ok", 20_000)]);
    const sent: string[] = [];
    const rpc = fakeRpc({ blockHeight: 1, statuses: {} });
    const spy: SolanaRpc = {
      ...rpc,
      get requests() {
        return rpc.requests;
      },
      getSignatureStatuses: async (sigs) => (sent.push(...sigs), rpc.getSignatureStatuses(sigs)),
    };
    const summary = await runTracker({ store, rpc: spy, now: () => NOW });
    expect(sent).toEqual([sig("ok")]);
    expect(saved).toEqual([expect.objectContaining({ id: "bad", status: "unknown", error_raw: { reason: "invalid signature" } })]);
    expect(summary.unknown).toBe(1);
  });

  it("does nothing when nothing is pending", async () => {
    const { store } = memoryStore([]);
    const rpc = fakeRpc({ blockHeight: 1, statuses: {} });
    const summary = await runTracker({ store, rpc, now: () => NOW });
    expect(summary.loaded).toBe(0);
    expect(rpc.requests).toBe(0);
  });
});

describe("createRpc", () => {
  it("chunks getSignatureStatuses into 256s with searchTransactionHistory", async () => {
    const bodies: { method: string; params: unknown[] }[] = [];
    const fetchMock = vi.fn<typeof fetch>(async (_url, init) => {
      const body = JSON.parse(init!.body as string);
      bodies.push(body);
      const sigs = body.params[0] as string[];
      return Response.json({ jsonrpc: "2.0", id: body.id, result: { value: sigs.map(() => null) } });
    });
    const rpc = createRpc({ url: "http://rpc.test", rps: 1000, fetch: fetchMock });
    const sigs = Array.from({ length: 600 }, (_, i) => `sig${i}`);
    const out = await rpc.getSignatureStatuses(sigs);
    expect(out).toHaveLength(600);
    expect(bodies.map((b) => (b.params[0] as string[]).length)).toEqual([256, 256, 88]);
    expect(bodies[0]!.params[1]).toEqual({ searchTransactionHistory: true });
    expect(rpc.requests).toBe(3);
  });

  it("asks getTransaction for v1 support and surfaces RPC errors", async () => {
    let seen: unknown[] = [];
    const fetchMock = vi.fn<typeof fetch>(async (_url, init) => {
      const body = JSON.parse(init!.body as string);
      seen = body.params;
      return Response.json({ jsonrpc: "2.0", id: body.id, error: { code: -32015, message: "nope" } });
    });
    const rpc = createRpc({ url: "http://rpc.test", rps: 1000, fetch: fetchMock });
    await expect(rpc.getTransaction("abc")).rejects.toThrow("getTransaction: nope");
    expect(seen[1]).toMatchObject({ maxSupportedTransactionVersion: 1, commitment: "confirmed" });
  });

  it("spaces requests to respect the rate limit", async () => {
    const times: number[] = [];
    const fetchMock = vi.fn<typeof fetch>(async () => {
      times.push(Date.now());
      return Response.json({ jsonrpc: "2.0", id: 1, result: 1 });
    });
    const rpc = createRpc({ url: "http://rpc.test", rps: 20, fetch: fetchMock }); // 50ms gap
    await Promise.all([rpc.getBlockHeight(), rpc.getBlockHeight(), rpc.getBlockHeight()]);
    expect(times[2]! - times[0]!).toBeGreaterThanOrEqual(90);
  });
});
