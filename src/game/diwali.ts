import { onShelf } from './dressing-ids';

/**
 * Diwali week, while its kits and bats are on the shelf (`LIMITED_UNTIL`):
 * till the end of 11 November 2026 in India, by the browser's clock. The
 * What's new run and the Dressing Room card's badge go by it, so both stop
 * with the kits and nothing needs taking down.
 */
export const diwaliOn = (now = Date.now()) => onShelf('diwali', now);

const ROOM_KEY = 'hitman-diwali-room';

/** Whether this browser has opened the Dressing Room since the Diwali kits arrived. */
export function diwaliRoomSeen(): boolean {
  try { return localStorage.getItem(ROOM_KEY) === '1'; } catch { return false; }
}

/** The room has been opened: the card's NEW DIWALI KITS badge has done its job. */
export function markDiwaliRoomSeen() {
  try { localStorage.setItem(ROOM_KEY, '1'); } catch { /* Then it shows again next time. */ }
}

/** The Dressing Room card's badge: while it is Diwali week, until the room is opened. */
export const diwaliBadgeDue = (now = Date.now()) => diwaliOn(now) && !diwaliRoomSeen();
