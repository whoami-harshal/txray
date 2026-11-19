import { randomBytes } from "node:crypto";

/** Unambiguous characters only: no 0/O, 1/l/I. */
export const SLUG_ALPHABET = "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function newSlug(length = 10): string {
  const n = SLUG_ALPHABET.length;
  const limit = 256 - (256 % n); // reject bytes above the last full multiple: no modulo bias
  let out = "";
  while (out.length < length) {
    for (const b of randomBytes(length)) {
      if (b < limit && out.length < length) out += SLUG_ALPHABET[b % n];
    }
  }
  return out;
}
