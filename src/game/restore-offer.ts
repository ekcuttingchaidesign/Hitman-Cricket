/**
 * Whether to offer a returning player the way back at the end of an innings.
 *
 * The offer exists because we cannot tell a returning player from a new one:
 * both arrive with empty storage, and the end of a first innings is the one
 * beat where a player who has lost a record is certain to be looking at the
 * screen. So it is offered to both, and the words carry the doubt — "played
 * before?" rather than "welcome back".
 *
 * Which is exactly why it is capped and dismissible. To the player who really
 * is new it is a question about something that has not happened to them, and a
 * question like that asked after every innings stops being read and starts
 * being scenery — taking the credibility of the other placements with it. Three
 * showings, or one press of the cross, and it is done for good.
 *
 * It has no business being on the screen at all once a name is claimed: from
 * then on the player has a key of their own, and the key is what that slot is
 * for.
 */

const KEY = 'hitman-restore-offer';

/** How many times it will ask before it stops asking. */
export const RESTORE_OFFER_LIMIT = 3;

interface Offer {
  /** How many innings have ended with it on the screen. */
  shown: number;
  /** Whether the player has taken it away by hand. */
  done: boolean;
}

function read(): Offer {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { shown: 0, done: false };
    const held = JSON.parse(raw) as Partial<Offer>;
    const shown = Number(held.shown);
    return { shown: Number.isInteger(shown) && shown > 0 ? shown : 0, done: held.done === true };
  } catch {
    // Storage off, or something that is not JSON. Treat it as never asked:
    // in a browser that forgets, asking is the whole point.
    return { shown: 0, done: false };
  }
}

function write(offer: Offer) {
  try { localStorage.setItem(KEY, JSON.stringify(offer)); } catch { /* Then it asks again. */ }
}

/** Whether the end of this innings should carry the offer. */
export function offerRestoreHere(): boolean {
  const offer = read();
  return !offer.done && offer.shown < RESTORE_OFFER_LIMIT;
}

/** One more innings has ended with it up. Counted where it is drawn, not where it is decided. */
export function restoreOfferShown() {
  const offer = read();
  if (offer.done) return;
  write({ ...offer, shown: offer.shown + 1 });
}

/** Whether it has been waved away, which ends it on every screen at once. */
export function restoreOfferDismissed(): boolean {
  return read().done;
}

/** Taken away by hand, which is for good. */
export function restoreOfferDone() {
  write({ ...read(), done: true });
}

/** For the checks, which need a browser that has not been asked yet. */
export function forgetRestoreOffer() {
  try { localStorage.removeItem(KEY); } catch { /* Nothing to forget. */ }
}
