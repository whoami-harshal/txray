import { encodeBase58 } from "./base58";
import {
  COMPUTE_BUDGET_PROGRAM,
  JITO_TIP_ACCOUNTS,
  SENDER_TIP_ACCOUNTS,
  SYSTEM_PROGRAM,
} from "./constants";

/** What we read from a transaction. Never contains keys or the signed tx itself. */
export interface TxInfo {
  signature?: string;
  cuLimit?: number;
  /** micro-lamports per compute unit */
  cuPrice?: bigint;
  tipLamports?: bigint;
  tipKind?: "sender" | "jito";
  lastValidBlockHeight?: bigint;
}

interface Ix {
  programId: string | undefined;
  /** account addresses; undefined when it lives in an address lookup table */
  accounts: (string | undefined)[];
  data: Uint8Array;
}

// ─── wire format ─────────────────────────────────────────────────────────────

class Reader {
  constructor(
    private bytes: Uint8Array,
    public pos = 0,
  ) {}
  u8(): number {
    if (this.pos >= this.bytes.length) throw new Error("eof");
    return this.bytes[this.pos++]!;
  }
  peek(): number {
    if (this.pos >= this.bytes.length) throw new Error("eof");
    return this.bytes[this.pos]!;
  }
  take(n: number): Uint8Array {
    if (this.pos + n > this.bytes.length) throw new Error("eof");
    const out = this.bytes.subarray(this.pos, this.pos + n);
    this.pos += n;
    return out;
  }
  /** Solana "compact-u16" (shortvec) */
  shortVec(): number {
    let len = 0;
    for (let size = 0; size < 3; size++) {
      const b = this.u8();
      len |= (b & 0x7f) << (size * 7);
      if ((b & 0x80) === 0) return len;
    }
    throw new Error("bad shortvec");
  }
}

function parseMessage(r: Reader): { accountKeys: string[]; ixs: Ix[] } {
  // Versioned messages set the high bit of the first byte.
  if (r.peek() & 0x80) r.u8();
  r.take(3); // header
  const numKeys = r.shortVec();
  const accountKeys: string[] = [];
  for (let i = 0; i < numKeys; i++) accountKeys.push(encodeBase58(r.take(32)));
  r.take(32); // recent blockhash
  const numIxs = r.shortVec();
  const ixs: Ix[] = [];
  for (let i = 0; i < numIxs; i++) {
    const programIdIndex = r.u8();
    const numAccounts = r.shortVec();
    const accounts: (string | undefined)[] = [];
    for (let j = 0; j < numAccounts; j++) accounts.push(accountKeys[r.u8()]);
    const dataLen = r.shortVec();
    const data = r.take(dataLen);
    ixs.push({ programId: accountKeys[programIdIndex], accounts, data });
  }
  // v0 address table lookups follow; tips/compute budget never need them.
  return { accountKeys, ixs };
}

/** Parse a raw serialized (wire-format) transaction. */
function parseWireTransaction(bytes: Uint8Array): { signature?: string; ixs: Ix[] } {
  const r = new Reader(bytes);
  const numSigs = r.shortVec();
  const sigs: Uint8Array[] = [];
  for (let i = 0; i < numSigs; i++) sigs.push(r.take(64));
  const { ixs } = parseMessage(r);
  return { signature: sigToString(sigs[0]), ixs };
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function isBytes(v: unknown): v is Uint8Array {
  return v instanceof Uint8Array;
}

function sigToString(sig: unknown): string | undefined {
  if (typeof sig === "string") return sig || undefined;
  if (!isBytes(sig) || sig.length !== 64) return undefined;
  // An all-zero signature means "not signed yet".
  if (sig.every((b) => b === 0)) return undefined;
  return encodeBase58(sig);
}

function keyToString(k: unknown): string | undefined {
  if (typeof k === "string") return k;
  if (k && typeof (k as { toBase58?: unknown }).toBase58 === "function") {
    return (k as { toBase58(): string }).toBase58();
  }
  return undefined;
}

function toBigInt(v: unknown): bigint | undefined {
  if (typeof v === "bigint") return v;
  if (typeof v === "number" && Number.isFinite(v)) return BigInt(Math.trunc(v));
  return undefined;
}

function readU32(data: Uint8Array, offset: number): number {
  return new DataView(data.buffer, data.byteOffset, data.byteLength).getUint32(offset, true);
}

function readU64(data: Uint8Array, offset: number): bigint {
  return new DataView(data.buffer, data.byteOffset, data.byteLength).getBigUint64(offset, true);
}

/** Pull CU limit / price and tips out of decoded instructions. */
function analyzeInstructions(ixs: Ix[], info: TxInfo): void {
  for (const ix of ixs) {
    if (ix.programId === COMPUTE_BUDGET_PROGRAM) {
      const kind = ix.data[0];
      if (kind === 2 && ix.data.length >= 5) info.cuLimit = readU32(ix.data, 1);
      else if (kind === 3 && ix.data.length >= 9) info.cuPrice = readU64(ix.data, 1);
    } else if (ix.programId === SYSTEM_PROGRAM) {
      // SystemInstruction::Transfer = u32 index 2, then u64 lamports
      if (ix.data.length >= 12 && readU32(ix.data, 0) === 2) {
        const to = ix.accounts[1];
        if (!to) continue;
        const kind = SENDER_TIP_ACCOUNTS.has(to) ? "sender" : JITO_TIP_ACCOUNTS.has(to) ? "jito" : undefined;
        if (kind) {
          info.tipLamports = (info.tipLamports ?? 0n) + readU64(ix.data, 4);
          info.tipKind ??= kind;
        }
      }
    }
  }
}

// ─── public ──────────────────────────────────────────────────────────────────

/**
 * Read signature, compute budget, tip and lifetime from a transaction.
 * Supports: @solana/web3.js v1 `Transaction` and `VersionedTransaction`,
 * @solana/kit signed transactions (`{ messageBytes, signatures }`) and
 * transaction messages (`{ instructions: [{ programAddress, ... }] }`),
 * and raw wire-format bytes. Never throws; returns what it could read.
 */
export function extractTxInfo(tx: unknown): TxInfo {
  const info: TxInfo = {};
  try {
    if (!tx) return info;

    // Raw serialized transaction
    if (isBytes(tx)) {
      const parsed = parseWireTransaction(tx);
      info.signature = parsed.signature;
      analyzeInstructions(parsed.ixs, info);
      return info;
    }

    const t = tx as Record<string, unknown>;

    // Lifetime (web3 legacy: lastValidBlockHeight; kit: lifetimeConstraint.lastValidBlockHeight)
    info.lastValidBlockHeight =
      toBigInt(t.lastValidBlockHeight) ??
      toBigInt((t.lifetimeConstraint as Record<string, unknown> | undefined)?.lastValidBlockHeight);

    // @solana/kit signed transaction
    if (isBytes(t.messageBytes)) {
      const { accountKeys, ixs } = parseMessage(new Reader(t.messageBytes));
      const sigs = (t.signatures ?? {}) as Record<string, unknown>;
      const feePayer = accountKeys[0];
      info.signature = sigToString(feePayer ? sigs[feePayer] : undefined);
      analyzeInstructions(ixs, info);
      return info;
    }

    // @solana/web3.js VersionedTransaction
    const message = t.message as { serialize?: () => Uint8Array } | undefined;
    if (message && typeof message.serialize === "function" && Array.isArray(t.signatures)) {
      info.signature = sigToString(t.signatures[0]);
      analyzeInstructions(parseMessage(new Reader(message.serialize())).ixs, info);
      return info;
    }

    if (Array.isArray(t.instructions)) {
      const ixs: Ix[] = [];
      for (const raw of t.instructions as Record<string, unknown>[]) {
        // web3 legacy TransactionInstruction
        if (raw.programId !== undefined) {
          ixs.push({
            programId: keyToString(raw.programId),
            accounts: ((raw.keys as { pubkey: unknown }[]) ?? []).map((k) => keyToString(k.pubkey)),
            data: isBytes(raw.data) ? raw.data : new Uint8Array(0),
          });
        } else if (typeof raw.programAddress === "string") {
          // @solana/kit instruction
          ixs.push({
            programId: raw.programAddress,
            accounts: ((raw.accounts as { address?: string }[]) ?? []).map((a) => a.address),
            data: isBytes(raw.data) ? raw.data : new Uint8Array(0),
          });
        }
      }
      // web3 legacy Transaction exposes `.signature` (fee payer's sig) once signed
      info.signature = sigToString(t.signature);
      analyzeInstructions(ixs, info);
    }
  } catch {
    // Unknown shape or malformed bytes: return what we have.
  }
  return info;
}
