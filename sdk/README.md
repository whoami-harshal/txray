# @txray/sdk

Find out whether your Solana transactions **land, fail, or expire**, and why.
Wrap your send call; TxRay tracks the rest.

- Zero runtime dependencies, ~12 KB
- Works with `@solana/web3.js` v1 (`Transaction`, `VersionedTransaction`) and `@solana/kit`
- Never throws its own errors, never blocks your send
- Sends only metadata: signature, compute-unit limit/price, tip, timing. **Never keys or the signed transaction.**

## Quickstart

```bash
npm i @txray/sdk
```

```ts
import { createTxRay } from "@txray/sdk";

const txray = createTxRay({ apiKey: process.env.TXRAY_API_KEY! });

const sig = await txray.trackSend(() => connection.sendRawTransaction(tx.serialize()), {
  transaction: tx,
  label: "swap",
});
```

That's it. `trackSend` returns whatever your send function returns and rethrows whatever it throws.

## API

```ts
const txray = createTxRay({ apiKey, endpoint?, debug? });

// Wrap a send (recommended): records sent_at right before sending
await txray.trackSend(sendFn, { transaction?, path?, label?, lastValidBlockHeight? });

// Or record a transaction you already sent
txray.track({ signature, transaction?, path?, label?, lastValidBlockHeight? });

// Send queued events now (e.g. before a script or serverless function exits)
await txray.flush();
```

| Option | Description |
|---|---|
| `transaction` | The signed tx. We read the signature, CU limit, CU price and any Helius Sender / Jito tip from it. |
| `path` | `"sender"`, `"rpc"` or `"other"`. Auto-set to `"sender"` when a Helius Sender tip is found. |
| `label` | Your own tag (`"swap"`, `"mint"`…) to filter by in the dashboard. |
| `lastValidBlockHeight` | Lets us mark a tx as **expired** precisely. Read automatically from web3.js `Transaction` and kit messages. |

### @solana/kit

```ts
const signed = await signTransactionMessageWithSigners(message);
await txray.trackSend(() => sendAndConfirm(signed, { commitment: "confirmed" }), {
  transaction: signed,
  lastValidBlockHeight: message.lifetimeConstraint.lastValidBlockHeight,
});
```

## How it sends data

Events are queued in memory and POSTed in batches every 2 s to `{endpoint}/api/ingest`.
Failed batches are retried twice, then dropped. The queue holds at most 5000 events.
In short-lived processes (scripts, serverless functions), call `await txray.flush()` before exiting.
