/**
 * Browser-compatible crypto fallbacks for environments where
 * Web Crypto API (crypto.subtle, crypto.randomUUID) is unavailable.
 *
 * Functionality:
 * - Generates UUID v4 strings with Web Crypto or a Math.random fallback.
 * - Implements a pure-JS SHA-256 for when crypto.subtle is missing.
 * - Exposes `sha256` that prefers crypto.subtle and falls back to the JS implementation.
 *
 * Notes:
 * - Used by the audit ledger so hashing still works in non-secure contexts.
 *
 * @author mrpi
 * @date 2026-09-16
 */

/** Generate a random UUID v4 string. */
export function generateUUID(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  const getRandomValues = (arr: Uint8Array) => {
    if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
      return crypto.getRandomValues(arr);
    }
    for (let i = 0; i < arr.length; i++) arr[i] = (Math.random() * 256) | 0;
    return arr;
  };
  const buf = new Uint8Array(16);
  getRandomValues(buf);
  // Set the RFC 4122 version (4) and variant bits.
  buf[6] = (buf[6] & 0x0f) | 0x40;
  buf[8] = (buf[8] & 0x3f) | 0x80;
  const hex = Array.from(buf, (b) => b.toString(16).padStart(2, "0"));
  return `${hex[0]}${hex[1]}${hex[2]}${hex[3]}-${hex[4]}${hex[5]}-${hex[6]}${hex[7]}-${hex[8]}${hex[9]}-${hex[10]}${hex[11]}${hex[12]}${hex[13]}${hex[14]}${hex[15]}`;
}

/** Pure-JS SHA-256 fallback when crypto.subtle is unavailable. */
export function sha256Fallback(message: string): string {
  function rotr(x: number, n: number) { return (x >>> n) | (x << (32 - n)); }
  function ch(x: number, y: number, z: number) { return (x & y) ^ (~x & z); }
  function maj(x: number, y: number, z: number) { return (x & y) ^ (x & z) ^ (y & z); }
  function bsig0(x: number) { return rotr(x, 2) ^ rotr(x, 13) ^ rotr(x, 22); }
  function bsig1(x: number) { return rotr(x, 6) ^ rotr(x, 11) ^ rotr(x, 25); }
  function ssig0(x: number) { return rotr(x, 7) ^ rotr(x, 18) ^ (x >>> 3); }
  function ssig1(x: number) { return rotr(x, 17) ^ rotr(x, 19) ^ (x >>> 10); }

  const K = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ];

  const msgBytes = new TextEncoder().encode(message);
  const msgBits = msgBytes.length * 8;
  const blocks: number[][] = [];
  for (let i = 0; i < msgBytes.length; i += 64) {
    const block: number[] = [];
    for (let j = 0; j < 64; j += 4) {
      const idx = i + j;
      block.push(
        idx < msgBytes.length
          ? (msgBytes[idx] << 24) | (msgBytes[idx + 1] << 16) | (msgBytes[idx + 2] << 8) | msgBytes[idx + 3]
          : 0
      );
    }
    blocks.push(block);
  }
  const lastBlock = blocks[blocks.length - 1] ?? [];
  const remainingBytes = msgBytes.length % 64;
  lastBlock[remainingBytes >> 2] |= 0x80 << (24 - (remainingBytes % 4) * 8);
  if (remainingBytes >= 56) blocks.push(new Array(16).fill(0) as number[]);
  const finalBlock = blocks[blocks.length - 1];
  finalBlock[14] = Math.floor(msgBits / 0x100000000);
  finalBlock[15] = msgBits & 0xffffffff;

  let h0 = 0x6a09e667, h1 = 0xbb67ae85, h2 = 0x3c6ef372, h3 = 0xa54ff53a;
  let h4 = 0x510e527f, h5 = 0x9b05688c, h6 = 0x1f83d9ab, h7 = 0x5be0cd19;

  for (const block of blocks) {
    const w = new Array(64) as number[];
    for (let t = 0; t < 16; t++) w[t] = block[t] >>> 0;
    for (let t = 16; t < 64; t++) w[t] = (ssig1(w[t - 2]) + w[t - 7] + ssig0(w[t - 15]) + w[t - 16]) >>> 0;

    let a = h0, b = h1, c = h2, d = h3, e = h4, f = h5, g = h6, h = h7;
    for (let t = 0; t < 64; t++) {
      const t1 = (h + bsig1(e) + ch(e, f, g) + K[t] + w[t]) >>> 0;
      const t2 = (bsig0(a) + maj(a, b, c)) >>> 0;
      h = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0;
    }
    h0 = (h0 + a) >>> 0; h1 = (h1 + b) >>> 0; h2 = (h2 + c) >>> 0; h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0; h5 = (h5 + f) >>> 0; h6 = (h6 + g) >>> 0; h7 = (h7 + h) >>> 0;
  }

  return [h0, h1, h2, h3, h4, h5, h6, h7]
    .map((n) => n.toString(16).padStart(8, "0"))
    .join("");
}

/** Hash an input string via crypto.subtle (preferred) or pure-JS fallback. */
export async function sha256(input: string): Promise<string> {
  if (typeof crypto !== "undefined" && crypto.subtle) {
    try {
      const data = new TextEncoder().encode(input);
      const hashBuffer = await crypto.subtle.digest("SHA-256", data);
      return Array.from(new Uint8Array(hashBuffer))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
    } catch {
      // Fall through
    }
  }
  return sha256Fallback(input);
}
