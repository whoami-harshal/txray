import type { ErrorCategory } from "@/lib/classify";

export const CATEGORY_LABEL: Record<ErrorCategory, string> = {
  SLIPPAGE: "Slippage exceeded",
  COMPUTE_EXCEEDED: "Out of compute units",
  INSUFFICIENT_FUNDS: "Insufficient funds",
  PROGRAM_ERROR: "Program error",
  BLOCKHASH_EXPIRED: "Expired (never landed)",
  UNKNOWN: "Dropped / unknown",
};

/** Plain-English fix per failure category. Templates, no AI. */
export const FIX_TIPS: Record<ErrorCategory, { title: string; tip: string }> = {
  SLIPPAGE: {
    title: "Swaps are failing on slippage",
    tip: "Prices moved between quote and execution. Use dynamic slippage (e.g. Jupiter's dynamicSlippage), re-quote right before signing, and land faster with Helius Sender so quotes go stale less often.",
  },
  COMPUTE_EXCEEDED: {
    title: "Transactions run out of compute units",
    tip: "Your CU limit is lower than the work needed. Simulate the transaction, then set setComputeUnitLimit to the simulated units × 1.1. See the suggested limits in Compute waste below.",
  },
  INSUFFICIENT_FUNDS: {
    title: "Wallets don't have enough SOL or tokens",
    tip: "Check balances (SOL for fees + rent, and the token amount) before building the transaction, and show the user a clear message instead of sending a transaction that will fail.",
  },
  PROGRAM_ERROR: {
    title: "A program rejected the transaction",
    tip: "Open a failed transaction on Solscan and read the program logs for the custom error code. Simulating with skipPreflight off catches most of these before they cost a fee.",
  },
  BLOCKHASH_EXPIRED: {
    title: "Transactions expire before landing",
    tip: "They never reached a leader in time. Raise your priority fee during congestion, send through Helius Sender (staked connections + Jito), rebroadcast every ~2s until lastValidBlockHeight, and fetch the blockhash with 'confirmed' commitment.",
  },
  UNKNOWN: {
    title: "Transactions vanished without a trace",
    tip: "Pass lastValidBlockHeight to the SDK so we can tell expired from dropped. Then check that your RPC actually forwards transactions; Helius Sender avoids most silent drops.",
  },
};
