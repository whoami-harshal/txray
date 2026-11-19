import { describe, expect, it, vi } from "vitest";
import { Keypair, SystemProgram, Transaction } from "@solana/web3.js";
import { createTxRay } from "../src/client";
import { encodeBase58 } from "../src/base58";

const SIG = encodeBase58(new Uint8Array(64).fill(7));

type FetchMock = ReturnType<typeof vi.fn<typeof fetch>>;

function okFetch(): FetchMock {
  return vi.fn<typeof fetch>(async () => new Response(null, { status: 202 }));
}

function sentEvents(fetchMock: FetchMock) {
  return fetchMock.mock.calls.flatMap((c) => JSON.parse((c[1] as RequestInit).body as string).events);
}

describe("createTxRay", () => {
  it("trackSend returns sendFn's result and posts the event with a Bearer key", async () => {
    const fetchMock = okFetch();
    const txray = createTxRay({
      apiKey: "txd_test",
      endpoint: "http://x.test/",
      fetch: fetchMock,
      flushIntervalMs: 0,
    });

    const payer = Keypair.generate();
    const tx = new Transaction({
      feePayer: payer.publicKey,
      blockhash: "EkSnNWid2cvwEVnVx9aBqawnmiCNiDgp3gUdkDPTKN1N",
      lastValidBlockHeight: 50,
    });
    tx.add(SystemProgram.transfer({ fromPubkey: payer.publicKey, toPubkey: payer.publicKey, lamports: 1 }));
    tx.sign(payer);

    const before = Date.now();
    const result = await txray.trackSend(async () => "returned-value", {
      transaction: tx,
      label: "swap",
      path: "rpc",
    });
    expect(result).toBe("returned-value");

    await txray.flush();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://x.test/api/ingest");
    expect((init.headers as Record<string, string>).authorization).toBe("Bearer txd_test");

    const [event] = sentEvents(fetchMock);
    expect(event.signature).toBe(encodeBase58(tx.signature!));
    expect(event.label).toBe("swap");
    expect(event.path).toBe("rpc");
    expect(event.last_valid_block_height).toBe("50");
    expect(new Date(event.sent_at).getTime()).toBeGreaterThanOrEqual(before - 1);
    // Only metadata: no signed transaction, no secret key
    const body = (init.body as string) ?? "";
    expect(body).not.toContain(Buffer.from(tx.serialize()).toString("base64"));
    expect(Object.keys(event).sort()).toEqual(
      ["label", "last_valid_block_height", "path", "sent_at", "signature"].sort(),
    );
  });

  it("uses the string returned by sendFn as the signature when no transaction is given", async () => {
    const fetchMock = okFetch();
    const txray = createTxRay({ apiKey: "k", fetch: fetchMock, flushIntervalMs: 0 });
    await txray.trackSend(() => SIG);
    await txray.flush();
    const [event] = sentEvents(fetchMock);
    expect(event.signature).toBe(SIG);
    expect(event.path).toBe("other");
  });

  it("rethrows sendFn's own error unchanged", async () => {
    const txray = createTxRay({ apiKey: "k", fetch: okFetch(), flushIntervalMs: 0 });
    const boom = new Error("blockhash not found");
    await expect(txray.trackSend(() => Promise.reject(boom))).rejects.toBe(boom);
  });

  it("retries twice, then drops silently", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => {
      throw new Error("network down");
    });
    const txray = createTxRay({ apiKey: "k", fetch: fetchMock, flushIntervalMs: 0 });
    txray.track({ signature: SIG });
    await expect(txray.flush()).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(3);
    await txray.flush();
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("does not retry a 401", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => new Response(null, { status: 401 }));
    const txray = createTxRay({ apiKey: "bad", fetch: fetchMock, flushIntervalMs: 0 });
    txray.track({ signature: SIG });
    await txray.flush();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("splits into batches of 500 and caps the queue at 5000", async () => {
    const fetchMock = okFetch();
    const txray = createTxRay({ apiKey: "k", fetch: fetchMock, flushIntervalMs: 0 });
    for (let i = 0; i < 5200; i++) txray.track({ signature: SIG });
    await txray.flush();
    expect(fetchMock).toHaveBeenCalledTimes(10);
    expect(sentEvents(fetchMock)).toHaveLength(5000);
  });

  it("skips invalid input without throwing", async () => {
    const fetchMock = okFetch();
    const txray = createTxRay({ apiKey: "k", fetch: fetchMock, flushIntervalMs: 0 });
    expect(() => txray.track({ signature: "not a sig" })).not.toThrow();
    expect(() => txray.track(undefined as never)).not.toThrow();
    expect(() => txray.track({ transaction: { weird: true } })).not.toThrow();
    await txray.flush();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("flushes automatically every 2s", async () => {
    vi.useFakeTimers();
    try {
      const fetchMock = okFetch();
      const txray = createTxRay({ apiKey: "k", fetch: fetchMock });
      txray.track({ signature: SIG });
      expect(fetchMock).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(2000);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      await txray.close();
    } finally {
      vi.useRealTimers();
    }
  });
});
