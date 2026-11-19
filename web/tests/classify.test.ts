import { describe, expect, it } from "vitest";
import { classifyError, rawError } from "@/lib/classify";

// Shapes taken from real mainnet getTransaction responses (meta.err + meta.logMessages).
const samples = {
  jupiterSlippage: {
    err: { InstructionError: [2, { Custom: 6001 }] },
    logs: [
      "Program ComputeBudget111111111111111111111111111111 invoke [1]",
      "Program JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4 invoke [1]",
      "Program log: Instruction: Route",
      "Program log: AnchorError occurred. Error Code: SlippageToleranceExceeded. Error Number: 6001. Error Message: Slippage tolerance exceeded.",
      "Program JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4 consumed 120000 of 1399700 compute units",
      "Program JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4 failed: custom program error: 0x1771",
    ],
  },
  raydiumSlippage: {
    err: { InstructionError: [3, { Custom: 30 }] },
    logs: [
      "Program 675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8 invoke [1]",
      "Program 675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8 failed: custom program error: 0x1e",
    ],
  },
  orcaSlippageByLog: {
    err: { InstructionError: [1, { Custom: 6036 }] },
    logs: [
      "Program whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc invoke [2]",
      "Program log: AnchorError thrown in programs/whirlpool/src/util/swap_utils.rs:41. Error Code: AmountOutBelowMinimum. Error Number: 6036.",
      "Program whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc failed: custom program error: 0x1794",
    ],
  },
  computeExceeded: {
    err: { InstructionError: [1, "ProgramFailedToComplete"] },
    logs: [
      "Program 11111111111111111111111111111111 invoke [1]",
      "Program 11111111111111111111111111111111 consumed 150 of 200 compute units",
      "Program 11111111111111111111111111111111 failed: exceeded CUs meter at BPF instruction",
    ],
  },
  computeBudgetExceededError: {
    err: { InstructionError: [0, "ComputationalBudgetExceeded"] },
    logs: [],
  },
  systemTransferInsufficient: {
    err: { InstructionError: [0, { Custom: 1 }] },
    logs: [
      "Program 11111111111111111111111111111111 invoke [1]",
      "Transfer: insufficient lamports 890880, need 5000000000",
      "Program 11111111111111111111111111111111 failed: custom program error: 0x1",
    ],
  },
  tokenInsufficient: {
    err: { InstructionError: [2, { Custom: 1 }] },
    logs: [
      "Program TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA invoke [1]",
      "Program log: Instruction: Transfer",
      "Program log: Error: insufficient funds",
      "Program TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA failed: custom program error: 0x1",
    ],
  },
  genericCustom: {
    err: { InstructionError: [1, { Custom: 6012 }] },
    logs: ["Program SomeProgram1111111111111111111111111111111 failed: custom program error: 0x177c"],
  },
};

describe("classifyError", () => {
  it("returns null for success", () => {
    expect(classifyError(null)).toBeNull();
    expect(classifyError(undefined)).toBeNull();
  });

  it("detects slippage by program error code and by log line", () => {
    expect(classifyError(samples.jupiterSlippage.err, samples.jupiterSlippage.logs)).toBe("SLIPPAGE");
    expect(classifyError(samples.raydiumSlippage.err, samples.raydiumSlippage.logs)).toBe("SLIPPAGE");
    expect(classifyError(samples.orcaSlippageByLog.err, samples.orcaSlippageByLog.logs)).toBe("SLIPPAGE");
  });

  it("detects compute exceeded", () => {
    expect(classifyError(samples.computeExceeded.err, samples.computeExceeded.logs)).toBe("COMPUTE_EXCEEDED");
    expect(classifyError(samples.computeBudgetExceededError.err, [])).toBe("COMPUTE_EXCEEDED");
  });

  it("detects insufficient funds", () => {
    expect(classifyError(samples.systemTransferInsufficient.err, samples.systemTransferInsufficient.logs)).toBe(
      "INSUFFICIENT_FUNDS",
    );
    expect(classifyError(samples.tokenInsufficient.err, samples.tokenInsufficient.logs)).toBe("INSUFFICIENT_FUNDS");
    expect(classifyError("InsufficientFundsForFee")).toBe("INSUFFICIENT_FUNDS");
    expect(classifyError({ InsufficientFundsForRent: { account_index: 0 } })).toBe("INSUFFICIENT_FUNDS");
  });

  it("maps other custom errors to PROGRAM_ERROR", () => {
    expect(classifyError(samples.genericCustom.err, samples.genericCustom.logs)).toBe("PROGRAM_ERROR");
    expect(classifyError({ InstructionError: [0, "InvalidAccountData"] }, [])).toBe("PROGRAM_ERROR");
  });

  it("handles blockhash and unknown errors", () => {
    expect(classifyError("BlockhashNotFound")).toBe("BLOCKHASH_EXPIRED");
    expect(classifyError("SomethingNew")).toBe("UNKNOWN");
    expect(classifyError({ InstructionError: "malformed" })).toBe("UNKNOWN");
    expect(classifyError(42)).toBe("UNKNOWN");
  });

  it("rawError keeps only the log tail", () => {
    const logs = Array.from({ length: 40 }, (_, i) => `line ${i}`);
    const raw = rawError({ InstructionError: [0, { Custom: 1 }] }, logs);
    expect(raw.logs).toHaveLength(15);
    expect(raw.logs![14]).toBe("line 39");
  });
});
