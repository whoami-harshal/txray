import {
  DEFAULT_ENDPOINT,
  FLUSH_INTERVAL_MS,
  MAX_BATCH,
  MAX_QUEUE,
  MAX_RETRIES,
} from "./constants";
import { decodeBase58 } from "./base58";
import { extractTxInfo } from "./parse";

export type SendPath = "sender" | "rpc" | "other";

export interface TxRayOptions {
  /** Project API key, starts with "txd_" */
  apiKey: string;
  /** Defaults to the hosted TxRay */
  endpoint?: string;
  /** Log SDK activity with console.debug */
  debug?: boolean;
  /** Batch interval in ms (default 2000) */
  flushIntervalMs?: number;
  /** Custom fetch (defaults to globalThis.fetch) */
  fetch?: typeof fetch;
}

export interface TrackOptions {
  /** The signed transaction (web3.js v1, @solana/kit, or raw bytes). Only metadata is read. */
  transaction?: unknown;
  /** How it was sent. Auto-detected as "sender" when a Helius Sender tip is present. */
  path?: SendPath;
  /** Your own tag, e.g. "swap" or "mint" */
  label?: string;
  lastValidBlockHeight?: number | bigint;
}

export interface TrackInput extends TrackOptions {
  signature?: string;
  /** Defaults to now */
  sentAt?: Date;
}

/** Wire format sent to {endpoint}/api/ingest */
export interface TxEvent {
  signature: string;
  sent_at: string;
  path: SendPath;
  label?: string;
  cu_limit?: number;
  cu_price?: string;
  tip_lamports?: string;
  last_valid_block_height?: string;
}

export interface TxRay {
  /**
   * Wrap your send call. Returns exactly what `sendFn` returns and rethrows
   * exactly what it throws. Tracking never throws or blocks.
   */
  trackSend<T>(sendFn: () => T | Promise<T>, opts?: TrackOptions): Promise<T>;
  /** Record a transaction you already sent. */
  track(input: TrackInput): void;
  /** Send everything queued now. Never rejects. */
  flush(): Promise<void>;
  /** Stop the background timer (flushes first). */
  close(): Promise<void>;
}

const VALID_PATHS = new Set<SendPath>(["sender", "rpc", "other"]);
/** A signature is base58 that decodes to exactly 64 bytes. */
function isValidSignature(sig: string): boolean {
  return sig.length >= 64 && sig.length <= 90 && decodeBase58(sig)?.length === 64;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export function createTxRay(options: TxRayOptions): TxRay {
  const apiKey = options?.apiKey ?? "";
  const endpoint = (options?.endpoint ?? DEFAULT_ENDPOINT).replace(/\/+$/, "");
  const debug = !!options?.debug;
  const interval = options?.flushIntervalMs ?? FLUSH_INTERVAL_MS;
  const fetchFn: typeof fetch | undefined =
    options?.fetch ?? (typeof fetch === "function" ? fetch.bind(globalThis) : undefined);

  const queue: TxEvent[] = [];
  let timer: ReturnType<typeof setInterval> | undefined;
  let flushing: Promise<void> | undefined;

  const log = (...args: unknown[]) => {
    if (debug) {
      try {
        console.debug("[txray]", ...args);
      } catch {
        /* ignore */
      }
    }
  };

  if (!apiKey) log("no apiKey given; events will be dropped");

  function ensureTimer() {
    if (timer || interval <= 0) return;
    timer = setInterval(() => void flush(), interval);
    // Don't keep Node processes alive just for us.
    (timer as { unref?: () => void }).unref?.();
  }

  function enqueue(event: TxEvent) {
    if (queue.length >= MAX_QUEUE) {
      queue.shift(); // drop oldest
      log("queue full, dropped oldest event");
    }
    queue.push(event);
    ensureTimer();
  }

  function buildEvent(input: TrackInput, fallbackSig?: unknown): TxEvent | undefined {
    const info = extractTxInfo(input.transaction);
    const signature =
      input.signature ?? info.signature ?? (typeof fallbackSig === "string" ? fallbackSig : undefined);
    if (!signature || !isValidSignature(signature)) {
      log("could not determine a valid signature; skipping");
      return undefined;
    }
    const lvbh =
      input.lastValidBlockHeight !== undefined
        ? BigInt(input.lastValidBlockHeight)
        : info.lastValidBlockHeight;
    const path: SendPath =
      input.path && VALID_PATHS.has(input.path)
        ? input.path
        : info.tipKind === "sender"
          ? "sender"
          : "other";

    const event: TxEvent = {
      signature,
      sent_at: (input.sentAt ?? new Date()).toISOString(),
      path,
    };
    if (input.label) event.label = String(input.label).slice(0, 100);
    if (info.cuLimit !== undefined) event.cu_limit = info.cuLimit;
    if (info.cuPrice !== undefined) event.cu_price = info.cuPrice.toString();
    if (info.tipLamports !== undefined) event.tip_lamports = info.tipLamports.toString();
    if (lvbh !== undefined) event.last_valid_block_height = lvbh.toString();
    return event;
  }

  async function postBatch(batch: TxEvent[]): Promise<void> {
    if (!fetchFn || !apiKey) return;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const res = await fetchFn(`${endpoint}/api/ingest`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({ events: batch }),
          keepalive: true,
        });
        if (res.ok) {
          log(`sent ${batch.length} event(s)`);
          return;
        }
        // 4xx (bad key / bad payload) won't succeed on retry
        if (res.status >= 400 && res.status < 500 && res.status !== 429) {
          log(`ingest rejected batch: HTTP ${res.status}`);
          return;
        }
        log(`ingest HTTP ${res.status} (attempt ${attempt + 1})`);
      } catch (err) {
        log(`ingest network error (attempt ${attempt + 1})`, err);
      }
      if (attempt < MAX_RETRIES) await sleep(250 * 2 ** attempt);
    }
    log(`dropped ${batch.length} event(s) after retries`);
  }

  async function drain(): Promise<void> {
    while (queue.length > 0) {
      const batch = queue.splice(0, MAX_BATCH);
      await postBatch(batch);
    }
  }

  function flush(): Promise<void> {
    try {
      if (!flushing) {
        flushing = drain()
          .catch(() => undefined)
          .finally(() => {
            flushing = undefined;
          });
        return flushing;
      }
      // A flush is running; chain another pass so newly queued events go out too.
      return flushing.then(() => flush());
    } catch {
      return Promise.resolve();
    }
  }

  function track(input: TrackInput): void {
    try {
      const event = buildEvent(input ?? {});
      if (event) enqueue(event);
    } catch (err) {
      log("track failed", err);
    }
  }

  async function trackSend<T>(sendFn: () => T | Promise<T>, opts: TrackOptions = {}): Promise<T> {
    let result: T;
    const sentAt = new Date(); // recorded right before the send
    try {
      result = await sendFn();
    } catch (sendError) {
      // Still record it if we know the signature: it will resolve to expired/failed.
      try {
        const event = buildEvent({ ...opts, sentAt });
        if (event) enqueue(event);
      } catch {
        /* ignore */
      }
      throw sendError;
    }
    try {
      const event = buildEvent({ ...opts, sentAt }, result);
      if (event) enqueue(event);
    } catch (err) {
      log("trackSend failed", err);
    }
    return result;
  }

  async function close(): Promise<void> {
    try {
      if (timer) clearInterval(timer);
      timer = undefined;
      await flush();
    } catch {
      /* ignore */
    }
  }

  return { trackSend, track, flush, close };
}
