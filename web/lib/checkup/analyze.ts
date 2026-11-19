import { classifyError, type ErrorCategory } from "@/lib/classify";
import { hasPriorityFee, MAX_CU, readComputeBudget } from "@/lib/solana/compute-budget";
import type { SignatureInfo, TransactionResult } from "@/lib/solana/rpc";

export { readComputeBudget };

/** Below this many successful transactions with details, compute stats are shown but not scored. */
export const MIN_COMPUTE_SAMPLE = 5;

export interface CheckupReport {
  version: 1;
  address: string;
  kind: "program" | "wallet" | "unknown";
  generatedAt: string;
  /** "full": every tx had details; "sampled": statuses for all, details for a sample (free plan) */
  source: "full" | "sampled";
  window: { from: string | null; to: string | null };
  total: number;
  succeeded: number;
  failed: number;
  failureRate: number;
  /** Failure reasons among the failed transactions we could inspect */
  categories: { category: ErrorCategory; count: number }[];
  failuresInspected: number;
  fees: { avgLamports: number | null; totalLamports: number; sample: number };
  compute: {
    sample: number;
    avgLimit: number | null;
    avgConsumed: number | null;
    wastePct: number | null;
    setsCuLimitPct: number | null;
    setsCuPricePct: number | null;
    suggestedLimit: number | null;
  };
  score: number;
  scoreBreakdown: { label: string; points: number }[];
}

export interface CheckupInput {
  address: string;
  kind: CheckupReport["kind"];
  /** Status of every transaction (signature, err, blockTime) */
  statuses: Pick<SignatureInfo, "signature" | "err" | "blockTime">[];
  /** Full details for all or some of them */
  details: TransactionResult[];
  source: CheckupReport["source"];
  now: Date;
}

function avg(xs: number[]): number | null {
  return xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null;
}

function percentile(xs: number[], p: number): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.ceil(p * s.length) - 1)]!;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

export function analyzeCheckup(input: CheckupInput): CheckupReport {
  const { statuses, details } = input;
  const total = statuses.length;
  const failed = statuses.filter((s) => s.err).length;
  const succeeded = total - failed;
  const failureRate = total ? round1((failed / total) * 100) : 0;

  const times = statuses.map((s) => s.blockTime).filter((t): t is number => typeof t === "number");
  const window = {
    from: times.length ? new Date(Math.min(...times) * 1000).toISOString() : null,
    to: times.length ? new Date(Math.max(...times) * 1000).toISOString() : null,
  };

  // Failure reasons (needs logs, so only from details)
  const counts = new Map<ErrorCategory, number>();
  let failuresInspected = 0;
  for (const tx of details) {
    if (!tx.meta?.err) continue;
    failuresInspected++;
    const cat = classifyError(tx.meta.err, tx.meta.logMessages) ?? "UNKNOWN";
    counts.set(cat, (counts.get(cat) ?? 0) + 1);
  }
  const categories = [...counts.entries()]
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => b.count - a.count);

  // Fees from every detailed tx
  const fees = details.map((t) => t.meta?.fee).filter((f): f is number => typeof f === "number");

  // Compute: successful txs only (a failed tx stops early and would look "efficient")
  const limits: number[] = [];
  const consumed: number[] = [];
  let withLimit = 0;
  let withPrice = 0;
  let budgeted = 0;
  for (const tx of details) {
    if (tx.meta?.err) continue;
    const cb = readComputeBudget(tx.transaction?.message);
    if (!cb) continue;
    budgeted++;
    if (cb.cuLimit !== null) withLimit++;
    if (hasPriorityFee(cb)) withPrice++;
    const used = tx.meta?.computeUnitsConsumed;
    if (typeof used === "number") {
      limits.push(cb.effectiveLimit);
      consumed.push(used);
    }
  }
  const avgLimit = avg(limits);
  const avgConsumed = avg(consumed);
  const wastePct = avgLimit && avgConsumed !== null ? round1(((avgLimit - avgConsumed) / avgLimit) * 100) : null;
  const p95 = percentile(consumed, 0.95);
  const setsCuLimitPct = budgeted ? round1((withLimit / budgeted) * 100) : null;
  const setsCuPricePct = budgeted ? round1((withPrice / budgeted) * 100) : null;

  // Health score: start at 100, subtract explainable penalties.
  const breakdown: { label: string; points: number }[] = [];
  const failPenalty = Math.round(Math.min(60, failureRate * 1.5));
  if (failPenalty) breakdown.push({ label: `${failureRate}% of transactions failed on-chain`, points: -failPenalty });
  const enoughCompute = consumed.length >= MIN_COMPUTE_SAMPLE;
  if (wastePct !== null && enoughCompute) {
    const wastePenalty = Math.round(Math.min(25, Math.max(0, wastePct - 20) * 0.4));
    if (wastePenalty) breakdown.push({ label: `${wastePct}% of requested compute goes unused`, points: -wastePenalty });
  }
  if (enoughCompute && setsCuLimitPct !== null && setsCuLimitPct < 50) {
    breakdown.push({ label: "Most transactions don't set a compute unit limit", points: -10 });
  }
  if (enoughCompute && setsCuPricePct !== null && setsCuPricePct < 50) {
    breakdown.push({ label: "Most transactions don't set a priority fee", points: -5 });
  }
  const score = Math.max(0, Math.min(100, 100 + breakdown.reduce((s, b) => s + b.points, 0)));

  return {
    version: 1,
    address: input.address,
    kind: input.kind,
    generatedAt: input.now.toISOString(),
    source: input.source,
    window,
    total,
    succeeded,
    failed,
    failureRate,
    categories,
    failuresInspected,
    fees: {
      avgLamports: avg(fees),
      totalLamports: fees.reduce((s, f) => s + f, 0),
      sample: fees.length,
    },
    compute: {
      sample: consumed.length,
      avgLimit,
      avgConsumed,
      wastePct,
      setsCuLimitPct,
      setsCuPricePct,
      suggestedLimit: p95 ? Math.min(MAX_CU, Math.ceil(Math.round(p95 * 1.1) / 1000) * 1000) : null,
    },
    score,
    scoreBreakdown: breakdown,
  };
}
