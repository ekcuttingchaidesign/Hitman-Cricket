import { AVATARS } from '../config/board';

/**
 * The name and kit a player bats under.
 *
 * Kept apart from `identity.ts` on purpose. The id there is the thing that must
 * never be lost, so it is written to three stores and fought for; this is a
 * preference, and losing it costs a returning player one tap to pick their kit
 * again. The board is the real record of both — anything here is a convenience
 * so that a second innings does not ask the same two questions.
 */

const KEY = 'hitman-batter';

export interface Player {
  name: string;
  avatar: number;
}

/** What this browser last batted under, if it has batted under anything. */
export function readPlayer(): Player | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const held = JSON.parse(raw) as Partial<Player>;
    const name = typeof held.name === 'string' ? held.name.trim() : '';
    const avatar = Number(held.avatar);
    if (!name) return null;
    return { name, avatar: Number.isInteger(avatar) && avatar >= 0 && avatar < AVATARS ? avatar : 0 };
  } catch {
    // Disabled storage, or something that is not JSON. Either way, no player.
    return null;
  }
}

/** Remembers the pair, so the next innings is one key rather than a form. */
export function writePlayer(player: Player) {
  try { localStorage.setItem(KEY, JSON.stringify(player)); } catch { /* A session remains playable without it. */ }
}

/** Which way round the player bats. */
export type Hand = 'right' | 'left';

const HAND = 'hitman-hand';

/**
 * The hand the player bats with, asked on the form before their first innings.
 * Right until they say otherwise, which is how every innings was batted before
 * the question was asked.
 */
export function readHand(): Hand {
  try { return localStorage.getItem(HAND) === 'left' ? 'left' : 'right'; } catch { return 'right'; }
}

export function writeHand(hand: Hand) {
  try { localStorage.setItem(HAND, hand); } catch { /* Right-handed next time, which still plays. */ }
}

const PROFILE = 'hitman-profile';

/**
 * Whether this browser has been through the form before an innings — name,
 * kit and hand — new player or old. Kept apart from the name, because a player
 * who already had one is still shown the form once, to see it and carry on.
 */
export function profileDone(): boolean {
  try { return localStorage.getItem(PROFILE) === '1'; } catch { return false; }
}

export function markProfileDone() {
  try { localStorage.setItem(PROFILE, '1'); } catch { /* Then it asks again, and is answered again. */ }
}
