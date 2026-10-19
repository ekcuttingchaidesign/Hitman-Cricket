/**
 * Who the player has gone back after: WIN IT BACK on their profile, played to
 * the end of an innings. A Rank down card from that player in that mode, from
 * before then, has been answered and comes down, whatever the innings made.
 * Kept in this browser, by handle and mode, for as long as a card can stand.
 */
import type { CareerMode } from './career';

const KEY = 'hitman-answered';

/** How long the Rank down card stands, answered or not. */
export const HEADLINE_MS = 2 * 24 * 60 * 60 * 1000;

/** `handle:mode` to when it was answered. */
export type Answered = Record<string, number>;

const keyOf = (handle: string, mode: CareerMode) => `${handle}:${mode}`;

export function readAnswered(): Answered {
  try {
    const stored = JSON.parse(localStorage.getItem(KEY) ?? '{}') as unknown;
    return stored && typeof stored === 'object' ? stored as Answered : {};
  } catch {
    return {};
  }
}

/** The innings went to its end: everything from them in this mode until now is answered. */
export function noteAnswered(handle: string, mode: CareerMode, now = Date.now()): void {
  const kept = Object.fromEntries(Object.entries(readAnswered()).filter(([, at]) => now - at < HEADLINE_MS));
  kept[keyOf(handle, mode)] = now;
  try { localStorage.setItem(KEY, JSON.stringify(kept)); } catch { /* The card stands its two days instead. */ }
}

/** Whether an event was answered by an innings played after it. */
export function answeredBy(event: { handle: string; mode: CareerMode; at: number }, answered: Answered): boolean {
  const at = answered[keyOf(event.handle, event.mode)];
  return typeof at === 'number' && at >= event.at;
}
