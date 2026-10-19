/**
 * The name a player goes by in anything the game shows to other people.
 *
 * A player id is the only thing that proves who is writing — a score, a name,
 * a Dressing Room save, a bio — so it is a secret between a browser and the
 * store, and it must never be sent to anybody else. Until the profiles came the
 * boards sent every row's id to every browser, which let anybody who opened the
 * board post as anybody on it. A row now carries a handle instead: the first
 * sixteen hex digits of a SHA-256 of the id. The id cannot be had back from it,
 * the browser can still work out its own (to find its row on a board), and the
 * store keeps handle → id so a profile can be opened from a row.
 *
 * SHA-256 by hand rather than `crypto.subtle`, which is asynchronous and would
 * make every board render wait on a promise, or `node:crypto`, which the
 * browser does not have: one function, the same answer on both sides of the
 * wire, checked against Node's own in the tests.
 */

const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

/** SHA-256 of a string's UTF-8 bytes, as 64 hex digits. */
export function sha256(text: string): string {
  const bytes = new TextEncoder().encode(text);
  const bits = bytes.length * 8;
  const padded = new Uint8Array(((bytes.length + 9 + 63) >> 6) << 6);
  padded.set(bytes);
  padded[bytes.length] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(padded.length - 8, Math.floor(bits / 0x100000000));
  view.setUint32(padded.length - 4, bits >>> 0);
  const h = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
  const w = new Uint32Array(64);
  const rotr = (x: number, n: number) => (x >>> n) | (x << (32 - n));
  for (let block = 0; block < padded.length; block += 64) {
    for (let i = 0; i < 16; i++) w[i] = view.getUint32(block + i * 4);
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }
    let [a, b, c, d, e, f, g, k] = h;
    for (let i = 0; i < 64; i++) {
      const t1 = (k + (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) + ((e & f) ^ (~e & g)) + K[i] + w[i]) >>> 0;
      const t2 = ((rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) >>> 0;
      k = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0;
    }
    h[0] += a; h[1] += b; h[2] += c; h[3] += d; h[4] += e; h[5] += f; h[6] += g; h[7] += k;
  }
  return [...h].map(word => word.toString(16).padStart(8, '0')).join('');
}

const known = new Map<string, string>();

/**
 * The handle a player id goes by. The prefix keeps it from being any other hash
 * of the same id. Remembered, because a board render asks for this browser's
 * own handle once a row.
 */
export function handleOf(playerId: string): string {
  let handle = known.get(playerId);
  if (!handle) {
    handle = sha256(`hitman-handle:${playerId}`).slice(0, 16);
    if (known.size > 200) known.clear();
    known.set(playerId, handle);
  }
  return handle;
}

/** Whether a row's handle is this player's: the board's "is this you", with the id never leaving the browser. */
export function ownsHandle(handle: string | null | undefined, playerId: string | null | undefined): boolean {
  return !!handle && !!playerId && handle === handleOf(playerId);
}

/** Whether a value is shaped like a handle. */
export function isHandle(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{16}$/.test(value);
}
