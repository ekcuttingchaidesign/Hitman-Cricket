/**
 * Deals from a set in a shuffled order, every one of them once before any
 * comes round again, and never the same twice running across a reshuffle —
 * the way a player sees them all quickly and never thinks one is stuck.
 *
 * For what is only looked at: it draws from `Math.random` unless given
 * otherwise, and must never be handed the innings' `SeededRandom`, whose
 * draws decide the deliveries.
 */
export class ShuffleBag<T> {
  private left: T[] = [];
  private last: T | undefined;
  constructor(private readonly items: readonly T[], private readonly random: () => number = Math.random) {
    if (!items.length) throw new Error('A shuffle bag needs something in it');
  }
  next(): T {
    if (!this.left.length) {
      const bag = [...this.items];
      for (let i = bag.length - 1; i > 0; i--) {
        const j = Math.floor(this.random() * (i + 1));
        [bag[i], bag[j]] = [bag[j], bag[i]];
      }
      // Dealt from the end: the first out of a fresh bag is not the last one seen.
      if (bag.length > 1 && bag[bag.length - 1] === this.last) [bag[0], bag[bag.length - 1]] = [bag[bag.length - 1], bag[0]];
      this.left = bag;
    }
    this.last = this.left.pop()!;
    return this.last;
  }
}
