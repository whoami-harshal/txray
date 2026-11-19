export const ERROR_CATEGORIES = [
  "INSUFFICIENT_FUNDS",
  "COMPUTE_EXCEEDED",
  "SLIPPAGE",
  "PROGRAM_ERROR",
  "BLOCKHASH_EXPIRED",
  "UNKNOWN",
] as const;

export type ErrorCategory = (typeof ERROR_CATEGORIES)[number];

/** Programs whose custom error codes mean "slippage exceeded" (the program that logged the failure). */
const SLIPPAGE_CODES: Record<string, number[]> = {
  // Jupiter Aggregator v6: 6001 SlippageToleranceExceeded
  JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4: [6001],
  // Raydium AMM v4: 30 ExceededSlippage
  "675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8": [30],
  // Raydium CPMM: 6005 ExceededSlippage
  CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C: [6005],
};

/** Log fragments that mean slippage, across Jupiter / Raydium / Orca / Meteora and Anchor error names. */
const SLIPPAGE_LOG =
  /slippage|AmountOutBelowMinimum|TooLittleOutputReceived|TooMuchInputPaid|MinimumAmountOut|exceeds desired slippage|InvalidAmountOut|output amount.*less than|amount out.*below/i;

const COMPUTE_LOG = /exceeded CUs meter|Computational budget exceeded|compute units? (?:limit )?exceeded/i;

const INSUFFICIENT_LOG =
  /insufficient lamports|Error: insufficient funds|insufficient funds|InsufficientFunds|Attempt to debit an account but found no record of a prior credit/i;

const CUSTOM_ERROR_LOG = /^Program (\w+) failed: custom program error: (0x[0-9a-fA-F]+)$/;

type Logs = readonly string[] | null | undefined;

/** The innermost program that failed with a custom error code, from the logs. */
function failingCustomError(logs: Logs): { program: string; code: number } | undefined {
  for (const line of logs ?? []) {
    const m = CUSTOM_ERROR_LOG.exec(line.trim());
    if (m) return { program: m[1]!, code: parseInt(m[2]!, 16) };
  }
  return undefined;
}

function anyLog(logs: Logs, re: RegExp): boolean {
  return (logs ?? []).some((l) => re.test(l));
}

/**
 * Turn a Solana transaction error (meta.err / status.err) plus log lines into a
 * coarse category for the dashboard. Pure function; never throws.
 */
export function classifyError(err: unknown, logs?: Logs): ErrorCategory | null {
  if (err === null || err === undefined) return null;
  try {
    // Transaction-level errors are plain strings or single-key objects.
    const key = typeof err === "string" ? err : typeof err === "object" ? Object.keys(err as object)[0] : undefined;

    switch (key) {
      case "InsufficientFundsForFee":
      case "InsufficientFundsForRent":
      case "AccountNotFound": // fee payer has no SOL at all
        return "INSUFFICIENT_FUNDS";
      case "BlockhashNotFound":
        return "BLOCKHASH_EXPIRED";
      case "InstructionError":
        break;
      default:
        if (anyLog(logs, COMPUTE_LOG)) return "COMPUTE_EXCEEDED";
        return "UNKNOWN";
    }

    const ixErr = (err as { InstructionError: unknown }).InstructionError;
    if (!Array.isArray(ixErr)) return "UNKNOWN";
    const inner: unknown = ixErr[1];

    if (inner === "ComputationalBudgetExceeded" || anyLog(logs, COMPUTE_LOG)) return "COMPUTE_EXCEEDED";

    const custom = failingCustomError(logs);
    if (custom && SLIPPAGE_CODES[custom.program]?.includes(custom.code)) return "SLIPPAGE";
    if (anyLog(logs, SLIPPAGE_LOG)) return "SLIPPAGE";

    if (inner === "InsufficientFunds" || anyLog(logs, INSUFFICIENT_LOG)) return "INSUFFICIENT_FUNDS";

    if (inner && typeof inner === "object" && "Custom" in inner) return "PROGRAM_ERROR";
    if (typeof inner === "string") return "PROGRAM_ERROR"; // e.g. InvalidAccountData, ProgramFailedToComplete
    return "UNKNOWN";
  } catch {
    return "UNKNOWN";
  }
}

/** Short raw error to store in tx_events.error_raw (keeps the DB small). */
export function rawError(err: unknown, logs?: Logs) {
  const tail = (logs ?? []).slice(-15);
  return { err, logs: tail.length ? tail : undefined };
}
