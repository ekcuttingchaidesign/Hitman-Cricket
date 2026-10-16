/**
 * When a player without a password is asked for one (the design: Figma
 * section 13, journeys A and B).
 *
 * Nothing is asked before the first ball. My Stats carries the Set a password
 * card from the first visit, for anybody with a name. The end of an innings
 * carries it once the career is worth keeping — 50 runs, every mode added up —
 * which every returning player already is. A player who walks past the card
 * three innings running gets a sheet that asks outright, and then every five
 * innings after that, never twice in a visit. There is no point at which a
 * player cannot bat without one.
 */

/** Career runs, every mode together, before the end card asks. */
export const NUDGE_RUNS = 50;
/** Ignored end cards before the sheet, and then how often it comes back. */
export const SHEET_AFTER = 3;
export const SHEET_EVERY = 5;

/** What the store last said: no password, one, or nothing heard yet (offline, or not asked). */
export type PasswordState = 'unknown' | 'none' | 'set';

export interface NudgeContext {
  named: boolean;
  /** Not a private window, which can keep nothing and so is never asked. */
  canRegister: boolean;
  practice: boolean;
  /** A Rival Match card is the match's, and carries no nudge. */
  rival: boolean;
  demo: boolean;
  state: PasswordState;
  runs: number;
}

/** The card on My Stats: from the first visit, for any named player with none. */
export function statsCardDue(c: Pick<NudgeContext, 'named' | 'canRegister' | 'state'>): boolean {
  return c.named && c.canRegister && c.state === 'none';
}

/** The card on the end of an innings: as My Stats', once the career passes 50 runs, and never on practice or a match. */
export function endCardDue(c: NudgeContext): boolean {
  return statsCardDue(c) && !c.practice && !c.rival && !c.demo && c.runs >= NUDGE_RUNS;
}

/**
 * Whether this innings' end brings the sheet, given how many end cards before
 * it were walked past: the fourth card after three ignored, then every five.
 */
export function sheetDue(ignored: number, shownThisVisit: boolean): boolean {
  if (shownThisVisit || ignored < SHEET_AFTER) return false;
  return (ignored - SHEET_AFTER) % SHEET_EVERY === 0;
}

const KEY = 'hitman-password-nudge';

/** End cards that carried the nudge and were not answered, in this browser. */
export function readIgnored(): number {
  try { const n = Number(localStorage.getItem(KEY)); return Number.isInteger(n) && n > 0 ? n : 0; } catch { return 0; }
}

export function writeIgnored(n: number) {
  try { if (n > 0) localStorage.setItem(KEY, String(n)); else localStorage.removeItem(KEY); } catch { /* Counted again from nothing. */ }
}
