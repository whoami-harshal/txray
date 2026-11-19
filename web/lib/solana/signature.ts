const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const INDEX: Record<string, number> = {};
for (let i = 0; i < ALPHABET.length; i++) INDEX[ALPHABET[i]!] = i;

/** Number of bytes a base58 string decodes to, or -1 if it isn't base58. */
export function base58ByteLength(str: string): number {
  let zeros = 0;
  while (zeros < str.length && str[zeros] === "1") zeros++;
  const bytes: number[] = [];
  for (let i = zeros; i < str.length; i++) {
    const value = INDEX[str[i]!];
    if (value === undefined) return -1;
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
  return zeros + bytes.length;
}

/** A transaction signature is base58 that decodes to exactly 64 bytes. */
export function isValidSignature(sig: unknown): sig is string {
  return typeof sig === "string" && sig.length >= 64 && sig.length <= 90 && base58ByteLength(sig) === 64;
}
