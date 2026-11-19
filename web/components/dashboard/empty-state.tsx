import type { ReactNode } from "react";

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed px-6 py-16 text-center">
      <h2 className="text-base font-medium">{title}</h2>
      {children && <div className="mt-2 max-w-md text-sm text-muted-foreground">{children}</div>}
    </div>
  );
}

export const SDK_SNIPPET = `import { createTxRay } from "@txray/sdk";

const txray = createTxRay({ apiKey: process.env.TXRAY_API_KEY });

await txray.trackSend(() => connection.sendRawTransaction(tx.serialize()), {
  transaction: tx,
  label: "swap",
});`;

export function SdkSnippet() {
  return (
    <pre className="mt-4 overflow-x-auto rounded-lg bg-zinc-950 p-4 text-left text-xs leading-relaxed text-zinc-100 ring-1 ring-border">
      <code>{SDK_SNIPPET}</code>
    </pre>
  );
}
