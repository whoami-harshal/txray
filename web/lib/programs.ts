/** Well-known mainnet programs (each verified executable on-chain). Used for names and one-click examples. */
export const KNOWN_PROGRAMS: Record<string, { name: string; short: string }> = {
  JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4: { name: "Jupiter v6", short: "Jupiter" },
  "675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8": { name: "Raydium AMM v4", short: "Raydium" },
  CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C: { name: "Raydium CPMM", short: "Raydium CPMM" },
  CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK: { name: "Raydium CLMM", short: "Raydium CLMM" },
  whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc: { name: "Orca Whirlpools", short: "Orca" },
  LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo: { name: "Meteora DLMM", short: "Meteora" },
  "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P": { name: "Pump.fun", short: "Pump.fun" },
  pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA: { name: "PumpSwap", short: "PumpSwap" },
  PhoeNiXZ8ByJGLkxNfZRnkUfjvmuYqLR89jjFHGqdXY: { name: "Phoenix", short: "Phoenix" },
  dRiftyHA39MWEi3m9aunc5MzRF1JYuBsbn6VPcn33UH: { name: "Drift v2", short: "Drift" },
  MFv2hWf31Z9kbCa1snEPYctwafyhdvnV7FZnsebVacA: { name: "marginfi v2", short: "marginfi" },
  KLend2g3cP87fffoy8q1mQqGKjrxjC8boSyAYavgmjD: { name: "Kamino Lend", short: "Kamino" },
};

/** One-click examples shown under the checkup box. */
export const POPULAR = [
  "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4",
  "675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8",
  "whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc",
  "LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo",
  "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P",
  "dRiftyHA39MWEi3m9aunc5MzRF1JYuBsbn6VPcn33UH",
].map((address) => ({ address, label: KNOWN_PROGRAMS[address]!.short }));

export function programName(address: string): string | null {
  return KNOWN_PROGRAMS[address]?.name ?? null;
}

export function shortAddress(a: string, n = 4): string {
  return a.length > n * 2 + 1 ? `${a.slice(0, n)}…${a.slice(-n)}` : a;
}

/** "Jupiter v6" for known programs, else a shortened address. */
export function displayName(address: string): string {
  return programName(address) ?? shortAddress(address);
}

export function scoreTone(score: number): "good" | "warn" | "bad" {
  return score >= 80 ? "good" : score >= 60 ? "warn" : "bad";
}
