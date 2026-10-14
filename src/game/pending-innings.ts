import type { CareerMode } from './career';

/**
 * Finished innings the career has not yet confirmed, kept until it does.
 *
 * An innings is counted toward a career by one request sent as it ends, and
 * until this existed that request was tried twice, four seconds apart, and then
 * forgotten. The innings board does not lose an innings that way — a post that
 * fails puts the register key back on the card — so a dropped signal at the end
 * card could leave a 150 not out on Top score and nowhere on the career that
 * the Individual, Runs and Boundaries ladders are read from.
 *
 * So the innings is written down here before it is sent, and crossed off only
 * when the store answers for it: counted, already counted, or turned down for
 * good. Anything else — no signal, a timeout, an address over its hourly
 * allowance — leaves it here to go again on the next load or the next innings.
 * Sending one twice is safe because each carries the nonce minted when it
 * ended, and the store counts a nonce once.
 *
 * Only an innings that ended is ever written here, by the one call in `end`,
 * so resending cannot make an innings walked out on count.
 */
export interface PendingInnings {
  /** The player who batted it. A browser that has become somebody else since leaves it be. */
  player: string;
  mode: CareerMode;
  /** The tally exactly as it was first sent, so a resend is the same request. */
  tally: unknown;
  nonce: string;
  look: { kit: string; bat: string } | null;
  /** When it ended. */
  ended: number;
  /** When a tab last sent it, so a second tab open at the same time leaves it alone. */
  sending?: number;
}

const KEY = 'hitman-pending-innings';
/** The most kept. Past it the oldest goes: a browser that has been offline for thirty innings has bigger problems. */
export const PENDING_MAX = 30;
/** How long one is worth resending. The store stamps an innings when it arrives, so a stale one lands on today. */
export const PENDING_MAX_AGE_MS = 14 * 86_400_000;
/**
 * How long a send in another tab is left to finish before this one tries. Two
 * tabs sending one nonce at the same instant could both be read as new by the
 * store, which has no transaction around its read and write.
 */
export const CLAIM_MS = 15_000;

/** What is held if the browser's storage cannot be written, so the innings in hand is still sent. */
let fallback: PendingInnings[] = [];
let storageOk = true;

function load(): PendingInnings[] {
  if (!storageOk) return fallback;
  let raw: string | null;
  try { raw = localStorage.getItem(KEY); } catch { return fallback; }
  try { return raw ? clean(JSON.parse(raw)) : []; } catch { return []; }
}

function save(list: PendingInnings[]) {
  fallback = list;
  try {
    if (list.length) localStorage.setItem(KEY, JSON.stringify(list));
    else localStorage.removeItem(KEY);
    storageOk = true;
  } catch {
    storageOk = false;
  }
}

function clean(raw: unknown): PendingInnings[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((one): one is PendingInnings => !!one && typeof one === 'object'
    && typeof one.player === 'string' && typeof one.nonce === 'string'
    && (one.mode === 'classic' || one.mode === 'survive' || one.mode === 'marathon')
    && Number.isFinite(one.ended) && one.tally !== undefined);
}

/** An innings that has just ended, written down before it is sent. */
export function keepPending(entry: PendingInnings): void {
  const list = load().filter(one => one.nonce !== entry.nonce);
  list.push(entry);
  save(list.slice(-PENDING_MAX));
}

/** Crossed off: the store has answered for it. */
export function dropPending(nonce: string): void {
  save(load().filter(one => one.nonce !== nonce));
}

/** Marked as being sent by this tab, or, with `at` null, as free to send again. */
export function claimPending(nonce: string, at: number | null): void {
  save(load().map(one => (one.nonce === nonce ? { ...one, sending: at ?? undefined } : one)));
}

/**
 * The oldest innings this player still has to send, oldest first because the
 * store spaces counted innings apart and the order they were played is the
 * order they should land. Anything past its age is dropped on the way.
 */
export function nextPending(player: string, now: number, skip: ReadonlySet<string> = new Set()): PendingInnings | null {
  const all = load();
  const live = all.filter(one => now - one.ended <= PENDING_MAX_AGE_MS);
  if (live.length !== all.length) save(live);
  return live.find(one => one.player === player && !skip.has(one.nonce)
    && !(one.sending && now - one.sending < CLAIM_MS)) ?? null;
}

/** Everything held, for tests. */
export function allPending(): PendingInnings[] {
  return load();
}

/** Forgets what is held in memory, so one test does not inherit another's. */
export function resetPendingMemory(): void {
  fallback = [];
  storageOk = true;
}
