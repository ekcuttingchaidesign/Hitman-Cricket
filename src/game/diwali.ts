import { onShelf } from './dressing-ids';

/**
 * Diwali week, while its kits and bats are on the shelf (`LIMITED_UNTIL`):
 * till the end of 11 November 2026 in India, by the browser's clock. The
 * What's new run and the Dressing Room card's badge go by it, so both stop
 * with the kits and nothing needs taking down.
 */
export const diwaliOn = (now = Date.now()) => onShelf('diwali', now);

/** The Dressing Room card's NEW DIWALI KITS: all Diwali week, opened or not. */
export const diwaliBadgeDue = (now = Date.now()) => diwaliOn(now);
