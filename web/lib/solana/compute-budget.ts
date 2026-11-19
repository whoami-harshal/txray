import { decodeBase58 } from "@/lib/solana/signature";
import type { JsonMessage } from "@/lib/solana/rpc";

const COMPUTE_BUDGET = "ComputeBudget111111111111111111111111111111";
const DEFAULT_CU_PER_IX = 200_000;
export const MAX_CU = 1_400_000;

export interface ComputeBudget {
  /** Explicitly requested CU limit, if any */
  cuLimit: number | null;
  /** Limit the runtime applied (explicit, or the legacy 200k-per-instruction default) */
  effectiveLimit: number;
  /** Legacy/v0: SetComputeUnitPrice, micro-lamports per CU */
  cuPrice: number | null;
  /** v1: transactionConfig.priorityFee, total lamports */
  priorityFeeLamports: number | null;
}

/**
 * Read compute settings from a json-encoded message.
 * - legacy / v0: ComputeBudget program instructions
 * - v1: message.transactionConfig (computeUnitLimit; priorityFee is TOTAL lamports, not per CU)
 *   https://www.helius.dev/docs/rpc/transaction-v1
 */
export function readComputeBudget(message: JsonMessage | undefined): ComputeBudget | null {
  if (!message?.accountKeys || !message.instructions) return null;

  let cuLimit: number | null = null;
  let cuPrice: number | null = null;
  let otherIxs = 0;
  for (const ix of message.instructions) {
    if (message.accountKeys[ix.programIdIndex] !== COMPUTE_BUDGET) {
      otherIxs++;
      continue;
    }
    const data = decodeBase58(ix.data);
    if (!data || data.length === 0) continue;
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    if (data[0] === 2 && data.length >= 5) cuLimit = view.getUint32(1, true);
    else if (data[0] === 3 && data.length >= 9) cuPrice = Number(view.getBigUint64(1, true));
  }

  let priorityFeeLamports: number | null = null;
  const cfg = message.transactionConfig;
  if (cfg) {
    if (typeof cfg.computeUnitLimit === "number") cuLimit = cfg.computeUnitLimit;
    if (typeof cfg.priorityFee === "number") priorityFeeLamports = cfg.priorityFee;
  }

  return {
    cuLimit,
    effectiveLimit: cuLimit ?? Math.min(MAX_CU, Math.max(1, otherIxs) * DEFAULT_CU_PER_IX),
    cuPrice,
    priorityFeeLamports,
  };
}

export function hasPriorityFee(cb: ComputeBudget): boolean {
  return (cb.cuPrice ?? 0) > 0 || (cb.priorityFeeLamports ?? 0) > 0;
}
