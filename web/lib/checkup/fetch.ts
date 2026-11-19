import type { SignatureInfo, SolanaRpc, TransactionResult } from "@/lib/solana/rpc";
import type { CheckupInput } from "@/lib/checkup/analyze";

export const CHECKUP_TX_LIMIT = 500;
/** Free-plan fallback: how many transactions get a full getTransaction (10 credits each). */
export const SAMPLE_FAILED = 50;
export const SAMPLE_SUCCEEDED = 25;

type Fetched = Omit<CheckupInput, "address" | "now">;

async function detectKind(rpc: SolanaRpc, address: string): Promise<CheckupInput["kind"]> {
  try {
    const info = await rpc.getAccountInfo(address);
    if (!info) return "unknown";
    return info.executable ? "program" : "wallet";
  } catch {
    return "unknown";
  }
}

/** Spread a sample evenly across the list instead of only taking the newest. */
function spread<T>(items: T[], n: number): T[] {
  if (items.length <= n) return items;
  const step = items.length / n;
  return Array.from({ length: n }, (_, i) => items[Math.floor(i * step)]!);
}

/** Merge two lists keeping their relative sizes, e.g. 50 + 25 → F F S F F S … */
export function interleave<T>(a: T[], b: T[]): T[] {
  const out: T[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length || j < b.length) {
    // Take from whichever list is further behind its share.
    if (j >= b.length || (i < a.length && i * b.length <= j * a.length)) out.push(a[i++]!);
    else out.push(b[j++]!);
  }
  return out;
}

async function fetchDetails(rpc: SolanaRpc, sigs: SignatureInfo[], deadline: number): Promise<TransactionResult[]> {
  const out: TransactionResult[] = [];
  let next = 0;
  const worker = async () => {
    while (next < sigs.length && Date.now() < deadline) {
      const s = sigs[next++]!;
      try {
        const tx = await rpc.getTransaction(s.signature);
        if (tx) out.push(tx);
      } catch {
        /* skip this one */
      }
    }
  };
  await Promise.all(Array.from({ length: 4 }, worker));
  return out;
}

/**
 * Get the last ~500 transactions for an address.
 * Uses Helius getTransactionsForAddress when the plan allows it (one call, full details);
 * otherwise falls back to getSignaturesForAddress + a sampled getTransaction (works on the Free plan).
 */
export async function fetchCheckupData(
  rpc: SolanaRpc,
  address: string,
  opts: { budgetMs?: number } = {},
): Promise<Fetched> {
  const deadline = Date.now() + (opts.budgetMs ?? 25_000);
  const kindPromise = detectKind(rpc, address);

  try {
    const txs = await rpc.getTransactionsForAddress(address, CHECKUP_TX_LIMIT);
    const statuses = txs
      .filter((t) => t.transaction?.signatures?.[0])
      .map((t) => ({ signature: t.transaction!.signatures[0]!, err: t.meta?.err ?? null, blockTime: t.blockTime }));
    return { kind: await kindPromise, statuses, details: txs, source: "full" };
  } catch {
    // Not on this plan (or not supported by this RPC): use standard methods.
  }

  const sigs = await rpc.getSignaturesForAddress(address, CHECKUP_TX_LIMIT);
  const failed = spread(
    sigs.filter((s) => s.err),
    SAMPLE_FAILED,
  );
  const succeeded = spread(
    sigs.filter((s) => !s.err),
    SAMPLE_SUCCEEDED,
  );
  // Interleave so a run cut short by the time budget still has both kinds.
  const details = await fetchDetails(rpc, interleave(failed, succeeded), deadline);
  return {
    kind: await kindPromise,
    statuses: sigs.map((s) => ({ signature: s.signature, err: s.err, blockTime: s.blockTime })),
    details,
    source: "sampled",
  };
}
