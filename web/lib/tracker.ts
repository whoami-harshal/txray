import { classifyError, rawError, type ErrorCategory } from "@/lib/classify";
import type { SignatureStatus, SolanaRpc, TransactionResult } from "@/lib/solana/rpc";
import { isValidSignature } from "@/lib/solana/signature";
import { readComputeBudget } from "@/lib/solana/compute-budget";

export interface PendingRow {
  id: string;
  project_id: string;
  signature: string;
  sent_at: string;
  last_valid_block_height: number | string | null;
  /** From the SDK; null when it couldn't read one (e.g. v1 transactions) */
  cu_limit?: number | null;
}

export type FinalStatus = "success" | "failed" | "expired" | "unknown";

/** Every update has the same keys, so a bulk upsert never nulls out other columns by accident. */
export interface RowUpdate {
  id: string;
  project_id: string;
  signature: string;
  sent_at: string;
  status: FinalStatus;
  landed_slot: number | null;
  block_time: string | null;
  confirm_ms: number | null;
  fee_lamports: number | null;
  cu_consumed: number | null;
  /** Explicit CU limit: on-chain value when known, else what the SDK sent */
  cu_limit: number | null;
  error_category: ErrorCategory | null;
  error_raw: unknown;
}

export interface TrackerStore {
  loadPending(limit: number): Promise<PendingRow[]>;
  saveUpdates(updates: RowUpdate[]): Promise<void>;
  /** Delete events created before `before`; returns how many. */
  cleanup(before: Date): Promise<number>;
}

export interface TrackerOptions {
  store: TrackerStore;
  rpc: SolanaRpc;
  now?: () => number;
  /** Stop starting new work after this many ms (Vercel Hobby cap is 60s). */
  budgetMs?: number;
  limit?: number;
  concurrency?: number;
  retentionDays?: number;
}

export interface TrackerSummary {
  loaded: number;
  success: number;
  failed: number;
  expired: number;
  unknown: number;
  stillPending: number;
  rpcRequests: number;
  rpcErrors: number;
  cleanedUp: number;
  timedOut: boolean;
  ms: number;
}

/** No block height to compare against: give up after this long. */
export const UNKNOWN_AFTER_MS = 3 * 60_000;
/** Safety net for anything still unresolved. */
export const GIVE_UP_AFTER_MS = 60 * 60_000;
/** Status says landed but getTransaction has no details yet: wait this long before saving status only. */
const DETAILS_GRACE_MS = 10 * 60_000;

function base(row: PendingRow): Omit<RowUpdate, "status"> {
  return {
    id: row.id,
    project_id: row.project_id,
    signature: row.signature,
    sent_at: row.sent_at,
    landed_slot: null,
    block_time: null,
    confirm_ms: null,
    fee_lamports: null,
    cu_consumed: null,
    cu_limit: row.cu_limit ?? null,
    error_category: null,
    error_raw: null,
  };
}

export function landedUpdate(row: PendingRow, status: SignatureStatus, tx: TransactionResult | null): RowUpdate {
  const meta = tx?.meta ?? null;
  const err = meta ? meta.err : status.err;
  const logs = meta?.logMessages ?? undefined;
  const blockTime = tx?.blockTime ?? null;
  const sentMs = Date.parse(row.sent_at);
  return {
    ...base(row),
    status: err ? "failed" : "success",
    landed_slot: tx?.slot ?? status.slot,
    block_time: blockTime !== null ? new Date(blockTime * 1000).toISOString() : null,
    // blockTime has 1-second resolution, so confirm_ms is approximate (±1s).
    confirm_ms: blockTime !== null && !Number.isNaN(sentMs) ? Math.max(0, blockTime * 1000 - sentMs) : null,
    fee_lamports: meta?.fee ?? null,
    cu_consumed: meta?.computeUnitsConsumed ?? null,
    // The landed tx is the source of truth (covers v1 transactionConfig, which the SDK can't parse)
    cu_limit: readComputeBudget(tx?.transaction?.message)?.cuLimit ?? row.cu_limit ?? null,
    error_category: err ? classifyError(err, logs) : null,
    error_raw: err ? rawError(err, logs) : null,
  };
}

/** Decide what to do with a signature the cluster doesn't know about. */
export function notFoundUpdate(row: PendingRow, blockHeight: number | null, nowMs: number): RowUpdate | null {
  const age = nowMs - Date.parse(row.sent_at);
  const lvbh = row.last_valid_block_height === null ? null : Number(row.last_valid_block_height);

  if (lvbh !== null && blockHeight !== null && blockHeight > lvbh) {
    return { ...base(row), status: "expired", error_category: "BLOCKHASH_EXPIRED" };
  }
  if ((lvbh === null && age > UNKNOWN_AFTER_MS) || age > GIVE_UP_AFTER_MS) {
    return { ...base(row), status: "unknown" };
  }
  return null; // keep waiting
}

export async function runTracker(opts: TrackerOptions): Promise<TrackerSummary> {
  const now = opts.now ?? Date.now;
  const start = now();
  const deadline = start + (opts.budgetMs ?? 45_000);
  const { store, rpc } = opts;

  const summary: TrackerSummary = {
    loaded: 0,
    success: 0,
    failed: 0,
    expired: 0,
    unknown: 0,
    stillPending: 0,
    rpcRequests: 0,
    rpcErrors: 0,
    cleanedUp: 0,
    timedOut: false,
    ms: 0,
  };

  const pending = await store.loadPending(opts.limit ?? 500);
  summary.loaded = pending.length;
  const updates: RowUpdate[] = [];

  // A malformed signature makes the RPC reject the whole batch, so settle those rows without asking.
  const valid: PendingRow[] = [];
  for (const row of pending) {
    if (isValidSignature(row.signature)) valid.push(row);
    else updates.push({ ...base(row), status: "unknown", error_raw: { reason: "invalid signature" } });
  }

  if (valid.length > 0) {
    const [blockHeight, statuses] = await Promise.all([
      rpc.getBlockHeight().catch(() => {
        summary.rpcErrors++;
        return null;
      }),
      rpc.getSignatureStatuses(valid.map((r) => r.signature)),
    ]);

    const landed: { row: PendingRow; status: SignatureStatus }[] = [];
    valid.forEach((row, i) => {
      const status = statuses[i] ?? null;
      if (!status) {
        const u = notFoundUpdate(row, blockHeight, now());
        if (u) updates.push(u);
      } else if (status.confirmationStatus === "confirmed" || status.confirmationStatus === "finalized") {
        landed.push({ row, status });
      }
      // "processed" only: wait for the next run so we don't record a tx that gets dropped by a fork.
    });

    // Fetch details for landed txs, a few at a time (the RPC client enforces the rate limit).
    let next = 0;
    const worker = async () => {
      while (next < landed.length) {
        if (now() >= deadline) {
          summary.timedOut = true;
          return;
        }
        const { row, status } = landed[next++]!;
        try {
          const tx = await rpc.getTransaction(row.signature);
          if (tx || now() - Date.parse(row.sent_at) > DETAILS_GRACE_MS) {
            updates.push(landedUpdate(row, status, tx));
          }
        } catch {
          summary.rpcErrors++;
        }
      }
    };
    await Promise.all(Array.from({ length: opts.concurrency ?? 4 }, worker));
  }

  for (let i = 0; i < updates.length; i += 500) await store.saveUpdates(updates.slice(i, i + 500));

  for (const u of updates) summary[u.status]++;
  summary.stillPending = pending.length - updates.length;

  // Free-tier housekeeping: keep the DB small.
  if (now() < deadline) {
    const days = opts.retentionDays ?? 7;
    summary.cleanedUp = await store.cleanup(new Date(now() - days * 86_400_000));
  }

  summary.rpcRequests = rpc.requests;
  summary.ms = now() - start;
  return summary;
}
