import type { FeedbackStore, StoredFeedback } from './feedback-store.js';
import { FEEDBACK_KEPT } from './feedback-store.js';

/**
 * The questionnaire, in memory.
 *
 * The same two jobs `memory-store.ts` does for the board: it backs the endpoint
 * while `npm run dev` is running, so the form can be opened, filled in, sent and
 * read back with no credentials and no network — and it is what the tests run
 * the submit path against.
 *
 * It keeps the semantics the Redis adapter leans on rather than the convenient
 * ones: newest first, and the list trimmed on every write. A fake that kept
 * everything for ever would pass a test the real store fails on its two
 * thousandth answer.
 */
export function memoryFeedback(): FeedbackStore & { clear(): void } {
  let kept: StoredFeedback[] = [];
  const rate = new Map<string, { count: number; until: number }>();
  return {
    async save(entry) {
      kept.unshift(entry);
      kept = kept.slice(0, FEEDBACK_KEPT);
    },
    async read(limit) { return kept.slice(0, limit); },
    async hits(address, windowSeconds) {
      const now = Date.now();
      const held = rate.get(address);
      if (!held || held.until <= now) {
        rate.set(address, { count: 1, until: now + windowSeconds * 1000 });
        return 1;
      }
      held.count++;
      return held.count;
    },
    clear() { kept = []; rate.clear(); },
  };
}
