import { createHash, randomBytes } from "node:crypto";

const ALPHABET = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

/** "txd_" + 32 random alphanumeric chars */
export function generateApiKey(): string {
  const bytes = randomBytes(32);
  let out = "txd_";
  // 256 % 62 bias is negligible for API keys, but reject-sample anyway.
  let i = 0;
  let pool = bytes;
  while (out.length < 36) {
    if (i >= pool.length) {
      pool = randomBytes(32);
      i = 0;
    }
    const b = pool[i++]!;
    if (b < 248) out += ALPHABET[b % 62];
  }
  return out;
}

export function hashApiKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

/** Shown in the UI so users can tell keys apart, e.g. "txd_Ab12…" */
export function keyPrefix(key: string): string {
  return key.slice(0, 8);
}

export function parseBearer(header: string | null): string | undefined {
  if (!header) return undefined;
  const m = /^Bearer\s+(\S+)$/i.exec(header.trim());
  return m?.[1];
}
