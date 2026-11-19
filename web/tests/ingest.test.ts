import { describe, expect, it } from "vitest";
import { ingestSchema, toRows } from "@/lib/ingest";
import { generateApiKey, hashApiKey, keyPrefix, parseBearer } from "@/lib/apikey";

const SIG = "5".repeat(88);

describe("ingest schema", () => {
  it("accepts SDK events and normalizes bigints to strings", () => {
    const parsed = ingestSchema.parse({
      events: [
        {
          signature: SIG,
          sent_at: "2026-11-19T10:00:00.000Z",
          cu_limit: 200000,
          cu_price: "12345",
          tip_lamports: 1000000,
          last_valid_block_height: "300000000",
        },
      ],
    });
    const [e] = parsed.events;
    expect(e!.path).toBe("other");
    expect(e!.tip_lamports).toBe("1000000");
    expect(e!.last_valid_block_height).toBe("300000000");
  });

  it("rejects bad signatures, empty and oversized batches", () => {
    expect(ingestSchema.safeParse({ events: [] }).success).toBe(false);
    expect(
      ingestSchema.safeParse({ events: [{ signature: "0OIl", sent_at: "2026-11-19T10:00:00Z" }] }).success,
    ).toBe(false);
    const many = Array.from({ length: 501 }, () => ({ signature: SIG, sent_at: "2026-11-19T10:00:00Z" }));
    expect(ingestSchema.safeParse({ events: many }).success).toBe(false);
  });

  it("toRows dedupes signatures and sets pending", () => {
    const { events } = ingestSchema.parse({
      events: [
        { signature: SIG, sent_at: "2026-11-19T10:00:00Z" },
        { signature: SIG, sent_at: "2026-11-19T10:00:01Z" },
      ],
    });
    const rows = toRows("p1", events);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ project_id: "p1", status: "pending", label: null });
  });
});

describe("api keys", () => {
  it("generates txd_ + 32 alphanumerics and hashes with sha256", () => {
    const key = generateApiKey();
    expect(key).toMatch(/^txd_[A-Za-z0-9]{32}$/);
    expect(hashApiKey(key)).toMatch(/^[0-9a-f]{64}$/);
    expect(keyPrefix(key)).toBe(key.slice(0, 8));
    expect(generateApiKey()).not.toBe(key);
  });

  it("parses Bearer headers", () => {
    expect(parseBearer("Bearer txd_abc")).toBe("txd_abc");
    expect(parseBearer("bearer   txd_abc ")).toBe("txd_abc");
    expect(parseBearer("Basic x")).toBeUndefined();
    expect(parseBearer(null)).toBeUndefined();
  });
});
