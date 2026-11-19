const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const INDEX: Record<string, number> = {};
for (let i = 0; i < ALPHABET.length; i++) INDEX[ALPHABET[i]!] = i;

/** Decode base58, or null if the string isn't base58. */
export function decodeBase58(str: string): Uint8Array | null {
  let zeros = 0;
  while (zeros < str.length && str[zeros] === "1") zeros++;
  const bytes: number[] = [];
  for (let i = zeros; i < str.length; i++) {
    const value = INDEX[str[i]!];
    if (value === undefined) return null;
    let carry = value;
    for (let j = 0; j < bytes.length; j++) {
      carry += bytes[j]! * 58;
      bytes[j] = carry & 0xff;
      carry >>= 8;
    }
    while (carry > 0) {
      bytes.push(carry & 0xff);
      carry >>= 8;
    }
  }
  const out = new Uint8Array(zeros + bytes.length);
  for (let i = 0; i < bytes.length; i++) out[out.length - 1 - i] = bytes[i]!;
  return out;
}

/** Number of bytes a base58 string decodes to, or -1 if it isn't base58. */
export function base58ByteLength(str: string): number {
  return decodeBase58(str)?.length ?? -1;
}

/** A transaction signature is base58 that decodes to exactly 64 bytes. */
export function isValidSignature(sig: unknown): sig is string {
  return typeof sig === "string" && sig.length >= 64 && sig.length <= 90 && base58ByteLength(sig) === 64;
}

/** An account / program address is base58 that decodes to exactly 32 bytes. */
export function isValidAddress(addr: unknown): addr is string {
  return typeof addr === "string" && addr.length >= 32 && addr.length <= 44 && base58ByteLength(addr) === 32;
}
