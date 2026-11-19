import { z } from "zod";
import { isValidSignature } from "@/lib/solana/signature";

export const MAX_EVENTS_PER_REQUEST = 500;

/** Accept bigint-ish values as JSON number or decimal string; store as string for Postgres bigint. */
const bigintLike = z
  .union([z.number().int().nonnegative(), z.string().regex(/^\d{1,20}$/)])
  .transform((v) => String(v));

export const eventSchema = z.object({
  signature: z.string().refine(isValidSignature, "invalid signature (must be base58 of 64 bytes)"),
  sent_at: z.iso.datetime({ offset: true }),
  path: z.enum(["sender", "rpc", "other"]).default("other"),
  label: z.string().max(100).optional(),
  cu_limit: z.number().int().nonnegative().max(1_400_000).optional(),
  cu_price: bigintLike.optional(),
  tip_lamports: bigintLike.optional(),
  last_valid_block_height: bigintLike.optional(),
});

export const ingestSchema = z.object({
  events: z.array(eventSchema).min(1).max(MAX_EVENTS_PER_REQUEST),
});

export type IngestEvent = z.infer<typeof eventSchema>;

/** Map validated events to tx_events rows for one project (dedupes by signature). */
export function toRows(projectId: string, events: IngestEvent[]) {
  const seen = new Set<string>();
  const rows = [];
  for (const e of events) {
    if (seen.has(e.signature)) continue;
    seen.add(e.signature);
    rows.push({
      project_id: projectId,
      signature: e.signature,
      sent_at: e.sent_at,
      path: e.path,
      label: e.label ?? null,
      cu_limit: e.cu_limit ?? null,
      cu_price: e.cu_price ?? null,
      tip_lamports: e.tip_lamports ?? null,
      last_valid_block_height: e.last_valid_block_height ?? null,
      status: "pending" as const,
    });
  }
  return rows;
}
