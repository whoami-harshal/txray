/**
 * Minimal Solana JSON-RPC client for Helius, throttled for the free plan (10 req/s).
 * Method params follow https://www.helius.dev/docs/api-reference/rpc/http-methods
 *
 * Credit costs (Helius): getSignatureStatuses 1 (10 with searchTransactionHistory),
 * getTransaction 10, getBlockHeight 1, getSignaturesForAddress 10,
 * getTransactionsForAddress 10 per 100 full txs (Developer plan+), getAccountInfo 1.
 */

export const MAX_SIGNATURES_PER_STATUS_CALL = 256;

export interface SignatureStatus {
  slot: number;
  confirmations: number | null;
  err: unknown;
  confirmationStatus: "processed" | "confirmed" | "finalized" | null;
}

/** Message as returned with encoding "json": static keys + compiled instructions (data is base58). */
export interface JsonMessage {
  accountKeys: string[];
  instructions: { programIdIndex: number; accounts: number[]; data: string }[];
  /** v1 transactions only. A null field means the sender didn't set it. priorityFee is total lamports. */
  transactionConfig?: {
    computeUnitLimit?: number | null;
    heapSize?: number | null;
    loadedAccountsDataSizeLimit?: number | null;
    priorityFee?: number | null;
  };
}

export interface TransactionResult {
  slot: number;
  blockTime: number | null;
  transaction?: { signatures: string[]; message: JsonMessage };
  meta: {
    err: unknown;
    fee: number;
    computeUnitsConsumed?: number;
    logMessages?: string[] | null;
  } | null;
}

export interface SignatureInfo {
  signature: string;
  slot: number;
  err: unknown;
  blockTime: number | null;
}

export interface SolanaRpc {
  getBlockHeight(): Promise<number>;
  getSignatureStatuses(signatures: string[]): Promise<(SignatureStatus | null)[]>;
  getTransaction(signature: string): Promise<TransactionResult | null>;
  /** Standard method, available on every plan. Newest first, max 1000. */
  getSignaturesForAddress(address: string, limit: number): Promise<SignatureInfo[]>;
  /** Helius-only; needs the Developer plan or higher. Newest first, full transactions, max 1000. */
  getTransactionsForAddress(address: string, limit: number): Promise<TransactionResult[]>;
  /** null when the account doesn't exist. */
  getAccountInfo(address: string): Promise<{ executable: boolean; owner: string } | null>;
  /** Number of HTTP requests made so far (for logging). */
  readonly requests: number;
}

export class RpcError extends Error {
  constructor(
    message: string,
    public code?: number,
  ) {
    super(message);
  }
}

interface Options {
  url: string;
  /** Max requests per second (default 8, leaving headroom under Helius free's 10). */
  rps?: number;
  fetch?: typeof fetch;
  timeoutMs?: number;
}

export function createRpc({ url, rps = 8, fetch: fetchFn = fetch, timeoutMs = 10_000 }: Options): SolanaRpc {
  const gapMs = Math.ceil(1000 / rps);
  let nextSlot = 0;
  let requests = 0;
  let id = 0;

  /** Space request *starts* at least gapMs apart, while allowing several in flight. */
  async function throttle() {
    const now = Date.now();
    const at = Math.max(now, nextSlot);
    nextSlot = at + gapMs;
    if (at > now) await new Promise((r) => setTimeout(r, at - now));
  }

  async function call<T>(method: string, params: unknown[]): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      await throttle();
      requests++;
      const res = await fetchFn(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: ++id, method, params }),
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (res.status === 429 && attempt < 2) {
        // Rate limited: back off and retry
        await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
        continue;
      }
      if (!res.ok) throw new RpcError(`${method}: HTTP ${res.status}`, res.status);
      const body = (await res.json()) as { result?: T; error?: { code: number; message: string } };
      if (body.error) throw new RpcError(`${method}: ${body.error.message}`, body.error.code);
      return body.result as T;
    }
  }

  return {
    get requests() {
      return requests;
    },

    // Finalized height: if it's past a tx's lastValidBlockHeight, the tx can never land.
    getBlockHeight: () => call<number>("getBlockHeight", [{ commitment: "finalized" }]),

    async getSignatureStatuses(signatures) {
      const out: (SignatureStatus | null)[] = [];
      for (let i = 0; i < signatures.length; i += MAX_SIGNATURES_PER_STATUS_CALL) {
        const chunk = signatures.slice(i, i + MAX_SIGNATURES_PER_STATUS_CALL);
        const result = await call<{ value: (SignatureStatus | null)[] }>("getSignatureStatuses", [
          chunk,
          { searchTransactionHistory: true },
        ]);
        out.push(...result.value);
      }
      return out;
    },

    getTransaction: (signature) =>
      call<TransactionResult | null>("getTransaction", [
        signature,
        // Version 1 is needed: with 0, newer v1 transactions are rejected (checked against mainnet).
        { encoding: "json", commitment: "confirmed", maxSupportedTransactionVersion: 1 },
      ]),

    // 10 credits flat (Helius)
    getSignaturesForAddress: (address, limit) =>
      call<SignatureInfo[]>("getSignaturesForAddress", [address, { limit: Math.min(limit, 1000), commitment: "confirmed" }]),

    // 10 credits per 100 full transactions (Helius). Params per
    // https://www.helius.dev/docs/rpc/gettransactionsforaddress
    async getTransactionsForAddress(address, limit) {
      const result = await call<{ data: TransactionResult[] }>("getTransactionsForAddress", [
        address,
        {
          transactionDetails: "full",
          sortOrder: "desc",
          limit: Math.min(limit, 1000),
          commitment: "confirmed",
          encoding: "json",
          maxSupportedTransactionVersion: 1,
        },
      ]);
      return result.data;
    },

    async getAccountInfo(address) {
      const result = await call<{ value: { executable: boolean; owner: string } | null }>("getAccountInfo", [
        address,
        { encoding: "base64", dataSlice: { offset: 0, length: 0 } },
      ]);
      return result.value ? { executable: result.value.executable, owner: result.value.owner } : null;
    },
  };
}
