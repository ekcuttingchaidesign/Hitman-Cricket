export class SeededRandom {
  constructor(private seed: number) {}
  next(): number {
    let t = this.seed += 0x6D2B79F5;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  }
  range(min: number, max: number) { return min + this.next() * (max - min); }
  /**
   * A second stream, seeded off where this one stands and leaving it standing
   * there: something new can be drawn from the seed without moving a single
   * draw that came after it before.
   */
  fork(salt: number): SeededRandom { return new SeededRandom((this.seed ^ salt) >>> 0); }
  shuffle<T>(items: T[]): T[] {
    const result = [...items];
    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }
}
