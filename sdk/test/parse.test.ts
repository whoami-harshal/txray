import { describe, expect, it } from "vitest";
import {
  ComputeBudgetProgram,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";
import {
  address,
  appendTransactionMessageInstructions,
  createTransactionMessage,
  generateKeyPairSigner,
  getSignatureFromTransaction,
  pipe,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  signTransactionMessageWithSigners,
  type Blockhash,
} from "@solana/kit";
import { extractTxInfo } from "../src/parse";
import { decodeBase58, encodeBase58 } from "../src/base58";

const SENDER_TIP = new PublicKey("4ACfpUFoaSD9bfPdeu6DBt89gB6ENTeHBXCAi87NhDEE");
const JITO_TIP = new PublicKey("96gYZGLnJYVFmbjzopPSU6QiEV5fGqZNyN9nmNhvrZU5");
const BLOCKHASH = "EkSnNWid2cvwEVnVx9aBqawnmiCNiDgp3gUdkDPTKN1N";

function web3Instructions(payer: PublicKey, tipTo = SENDER_TIP) {
  return [
    ComputeBudgetProgram.setComputeUnitLimit({ units: 200_000 }),
    ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 12_345 }),
    SystemProgram.transfer({ fromPubkey: payer, toPubkey: Keypair.generate().publicKey, lamports: 5 }),
    SystemProgram.transfer({ fromPubkey: payer, toPubkey: tipTo, lamports: 1_000_000 }),
  ];
}

const u32 = (n: number) => {
  const b = new Uint8Array(4);
  new DataView(b.buffer).setUint32(0, n, true);
  return b;
};
const u64 = (n: bigint) => {
  const b = new Uint8Array(8);
  new DataView(b.buffer).setBigUint64(0, n, true);
  return b;
};

describe("base58", () => {
  it("round-trips", () => {
    const pk = Keypair.generate().publicKey;
    expect(encodeBase58(pk.toBytes())).toBe(pk.toBase58());
    expect(Array.from(decodeBase58(pk.toBase58())!)).toEqual(Array.from(pk.toBytes()));
    expect(encodeBase58(new Uint8Array(32))).toBe("11111111111111111111111111111111");
  });
});

describe("extractTxInfo: @solana/web3.js", () => {
  it("reads a legacy Transaction", () => {
    const payer = Keypair.generate();
    const tx = new Transaction({ feePayer: payer.publicKey, blockhash: BLOCKHASH, lastValidBlockHeight: 999 });
    tx.add(...web3Instructions(payer.publicKey));
    tx.sign(payer);

    const info = extractTxInfo(tx);
    expect(info.signature).toBe(encodeBase58(tx.signature!));
    expect(info.cuLimit).toBe(200_000);
    expect(info.cuPrice).toBe(12_345n);
    expect(info.tipLamports).toBe(1_000_000n);
    expect(info.tipKind).toBe("sender");
    expect(info.lastValidBlockHeight).toBe(999n);
  });

  it("reads a VersionedTransaction (v0) and its raw bytes", () => {
    const payer = Keypair.generate();
    const msg = new TransactionMessage({
      payerKey: payer.publicKey,
      recentBlockhash: BLOCKHASH,
      instructions: web3Instructions(payer.publicKey, JITO_TIP),
    }).compileToV0Message();
    const tx = new VersionedTransaction(msg);
    tx.sign([payer]);

    for (const input of [tx, tx.serialize()]) {
      const info = extractTxInfo(input);
      expect(info.signature).toBe(encodeBase58(tx.signatures[0]!));
      expect(info.cuLimit).toBe(200_000);
      expect(info.cuPrice).toBe(12_345n);
      expect(info.tipLamports).toBe(1_000_000n);
      expect(info.tipKind).toBe("jito");
    }
  });

  it("reads a VersionedTransaction with a legacy message", () => {
    const payer = Keypair.generate();
    const msg = new TransactionMessage({
      payerKey: payer.publicKey,
      recentBlockhash: BLOCKHASH,
      instructions: web3Instructions(payer.publicKey),
    }).compileToLegacyMessage();
    const tx = new VersionedTransaction(msg);
    tx.sign([payer]);
    const info = extractTxInfo(tx);
    expect(info.signature).toBe(encodeBase58(tx.signatures[0]!));
    expect(info.cuLimit).toBe(200_000);
  });

  it("returns no signature for an unsigned tx and no tip without a tip transfer", () => {
    const payer = Keypair.generate();
    const tx = new Transaction({ feePayer: payer.publicKey, blockhash: BLOCKHASH, lastValidBlockHeight: 1 });
    tx.add(SystemProgram.transfer({ fromPubkey: payer.publicKey, toPubkey: payer.publicKey, lamports: 1 }));
    const info = extractTxInfo(tx);
    expect(info.signature).toBeUndefined();
    expect(info.tipLamports).toBeUndefined();
    expect(info.cuLimit).toBeUndefined();
  });
});

describe("extractTxInfo: @solana/kit", () => {
  it("reads a kit transaction message and the signed transaction", async () => {
    const signer = await generateKeyPairSigner();
    const cb = address("ComputeBudget111111111111111111111111111111");
    const message = pipe(
      createTransactionMessage({ version: 0 }),
      (m) => setTransactionMessageFeePayerSigner(signer, m),
      (m) =>
        setTransactionMessageLifetimeUsingBlockhash(
          { blockhash: BLOCKHASH as Blockhash, lastValidBlockHeight: 4242n },
          m,
        ),
      (m) =>
        appendTransactionMessageInstructions(
          [
            { programAddress: cb, data: new Uint8Array([2, ...u32(300_000)]) },
            { programAddress: cb, data: new Uint8Array([3, ...u64(777n)]) },
            {
              programAddress: address("11111111111111111111111111111111"),
              accounts: [
                { address: signer.address, role: 3, signer } as never,
                { address: address(SENDER_TIP.toBase58()), role: 1 },
              ],
              data: new Uint8Array([...u32(2), ...u64(200_000n)]),
            },
          ],
          m,
        ),
    );

    const fromMessage = extractTxInfo(message);
    expect(fromMessage.cuLimit).toBe(300_000);
    expect(fromMessage.tipLamports).toBe(200_000n);
    expect(fromMessage.lastValidBlockHeight).toBe(4242n);

    const signed = await signTransactionMessageWithSigners(message);
    const info = extractTxInfo(signed);
    expect(info.signature).toBe(getSignatureFromTransaction(signed));
    expect(info.cuLimit).toBe(300_000);
    expect(info.cuPrice).toBe(777n);
    expect(info.tipLamports).toBe(200_000n);
    expect(info.tipKind).toBe("sender");
  });
});

describe("extractTxInfo: garbage in", () => {
  it("never throws", () => {
    const junk: unknown[] = [
      null,
      undefined,
      42,
      "abc",
      {},
      [],
      new Uint8Array([1, 2, 3]),
      { message: {} },
      { instructions: [null] },
      { messageBytes: new Uint8Array([0x80, 1]) },
    ];
    for (const j of junk) expect(() => extractTxInfo(j)).not.toThrow();
  });
});
