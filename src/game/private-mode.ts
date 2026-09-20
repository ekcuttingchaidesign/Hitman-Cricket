import { today } from './visits';

/**
 * Whether the game is being played in a private window.
 *
 * No browser answers that question. Private browsing is deliberately not
 * detectable — a page that could tell would be a page that could treat those
 * players differently, which is the thing private browsing exists to stop — so
 * every check here is a guess made from a side effect, and every one of them is
 * a guess a browser release is allowed to break.
 *
 * What is left to read is storage. A private window is given a small, temporary
 * quota where an ordinary one is given a share of the disk, and that gap is wide
 * enough to see from here: `navigator.storage.estimate()` reports billions of
 * bytes in a normal tab and a small fraction of that in a private one. Firefox
 * adds a second tell — it refuses to register a service worker in a private
 * window — and that is the lot. Nothing below asks whether storage *works*,
 * because in a private window it works fine; it is only forgotten afterwards.
 *
 * The quota tell has one predictable way of being wrong: an ordinary window is
 * given a share of the *disk*, so a phone or a laptop with very little room left
 * reports a private window's figure while being nothing of the kind. That is
 * what `remembered` is for. A browser holding a record of a visit from an
 * earlier day has demonstrably kept something across sessions, which is the one
 * thing a private window never does, and no quota figure argues with it.
 *
 * Two things follow from the guessing, and both are decisions rather than
 * details. A player the check is wrong about still gets to play — the notice
 * has a way past it — and a player the check is right about is not thrown out,
 * only told that an innings played here cannot be registered, because the board
 * is the only part of the game a forgetful window actually breaks.
 */

const GIB = 1024 ** 3;

/** Which detection the browser is a candidate for. */
export type Engine = 'chromium' | 'webkit' | 'gecko' | 'unknown';

/** Everything the verdict is made from, so the verdict itself needs no browser. */
export interface Signals {
  engine: Engine;
  /** Bytes the origin is allowed to store, or null where nothing would say. */
  quota: number | null;
  /** The JS heap ceiling, which the quota in a private window scales with. */
  heapLimit: number | null;
  /** Whether service workers are on offer. Firefox withholds them in private. */
  serviceWorker: boolean;
  /** Service workers and storage estimates need a secure context to mean anything. */
  secure: boolean;
  /** Whether this browser kept something from a day before today. */
  remembered: boolean;
}

/** Where the proof that this browser remembers anything is kept. */
export const SEEN_KEY = 'hitman-seen';
/** Set for the rest of the session once the notice has been read. */
const NOTICE_KEY = 'hitman-private-seen';
/** Set for good once the injury meter has explained itself once. */
const HURT_NOTE_KEY = 'hitman-hurt-seen';

/**
 * Whose private mode this might be.
 *
 * Every browser on iOS is Safari underneath, whatever its name, so Chrome and
 * Firefox there are read as WebKit: they inherit WebKit's private window and
 * not the one their desktop namesake has.
 */
export function engineOf(userAgent: string): Engine {
  if (/CriOS|FxiOS|EdgiOS|OPiOS/.test(userAgent)) return 'webkit';
  if (/Firefox\//.test(userAgent)) return 'gecko';
  if (/Edg\/|OPR\/|Chrome\/|Chromium\//.test(userAgent)) return 'chromium';
  if (/Safari\//.test(userAgent)) return 'webkit';
  return 'unknown';
}

/**
 * The quota below which a window is taken to be private.
 *
 * A private window's allowance is cut from memory rather than disk, so where
 * the heap ceiling is known the line is drawn from it — twice the ceiling,
 * which sits above what a private window is handed and far below the tens of
 * gigabytes an ordinary one reports. It is held between one and two gigabytes
 * either way, and deliberately at the low end of what would work: every
 * gigabyte the line is raised by catches a few more private windows and a great
 * many more ordinary ones with a full disk, and of the two mistakes it is the
 * second that costs somebody their place on the board.
 *
 * Safari publishes no heap ceiling, so it gets the flat figure.
 */
export function quotaCeiling(heapLimit: number | null): number {
  if (!heapLimit || !Number.isFinite(heapLimit) || heapLimit <= 0) return GIB;
  return Math.min(Math.max(heapLimit * 2, GIB), 2 * GIB);
}

/**
 * The verdict. False wherever the signals do not clearly say private: this
 * decides whether to interrupt somebody who only wants to bat, and an
 * interruption nobody needed is worse than a private window that got through.
 */
export function looksPrivate(signals: Signals): boolean {
  const { engine, quota, heapLimit, serviceWorker, secure, remembered } = signals;
  if (engine === 'unknown') return false;
  // It kept something from another day, so it is not a window that forgets.
  if (remembered) return false;
  // Firefox hands out no service workers in a private window. Only worth
  // reading over https, where every other Firefox has them.
  if (engine === 'gecko' && secure && !serviceWorker) return true;
  if (quota === null || !Number.isFinite(quota) || quota <= 0) return false;
  return quota < quotaCeiling(heapLimit);
}

/** What this browser will say about itself, with nothing allowed to throw. */
export async function readSignals(): Promise<Signals> {
  const memory = (performance as unknown as { memory?: { jsHeapSizeLimit?: number } }).memory;
  return {
    engine: read(() => engineOf(navigator.userAgent), 'unknown' as Engine),
    quota: await estimateQuota(),
    heapLimit: read(() => memory?.jsHeapSizeLimit ?? null, null),
    serviceWorker: read(() => 'serviceWorker' in navigator, true),
    secure: read(() => window.isSecureContext, true),
    remembered: read(() => rememberedBefore(localStorage.getItem(SEEN_KEY), today()), false),
  };
}

/**
 * Whether a stored day is one this browser was here on before today. A private
 * window can hold today's mark — it was written in this same session — so only
 * an earlier day proves anything, and junk proves nothing.
 */
export function rememberedBefore(held: string | null, day: string): boolean {
  return !!held && /^\d{4}-\d{2}-\d{2}$/.test(held) && held < day;
}

/** Leaves today's mark, which is what a later visit reads to clear this browser. */
export function markSeen() {
  try { localStorage.setItem(SEEN_KEY, today()); } catch { /* Nothing to prove, then. */ }
}

/** Whether the notice has already been read and waved past in this session. */
export function noticeSeen(): boolean {
  try { return sessionStorage.getItem(NOTICE_KEY) === '1'; } catch { return false; }
}

/**
 * Remembers that it was read, so a reload does not put it up again. The window
 * is still a private one — the board stays closed to it — this only stops the
 * game asking twice.
 */
export function markNoticeSeen() {
  try { sessionStorage.setItem(NOTICE_KEY, '1'); } catch { /* Then it asks again. */ }
}

/**
 * The verdict for this page, settled before anything is drawn.
 *
 * A storage estimate is a few milliseconds of work, but it is work done on the
 * way to the cover screen, so it is raced against a timeout and the game starts
 * without it rather than late. An unanswered check is not a private window.
 *
 * `?private=1` forces the notice on and `?private=0` forces it off, which is how
 * the screen is worked on without two browsers open.
 */
export async function privateWindow(timeoutMs = 600): Promise<boolean> {
  const forced = read(() => new URLSearchParams(location.search).get('private'), null);
  if (forced === '1') return true;
  if (forced === '0') return false;
  const timeout = new Promise<boolean>(resolve => setTimeout(() => resolve(false), timeoutMs));
  const check = readSignals().then(looksPrivate).catch(() => false);
  const verdict = await Promise.race([check, timeout]);
  // Today's mark goes down either way. In an ordinary window it is what clears
  // this browser tomorrow; in a private one it is forgotten with everything else.
  markSeen();
  return verdict;
}

async function estimateQuota(): Promise<number | null> {
  try {
    const estimate = await navigator.storage?.estimate?.();
    return typeof estimate?.quota === 'number' ? estimate.quota : null;
  } catch { return null; }
}

/** A reading, or what to assume where the browser will not be asked. */
function read<T>(act: () => T, fallback: T): T {
  try { return act(); } catch { return fallback; }
}

/**
 * Whether this device has already been told what a critical injury meter means.
 *
 * Kept for good rather than for the session, because it is a lesson and not a
 * warning: a player who has met it once knows what the red edge is saying, and
 * a panel that interrupts every innings would be teaching nobody and stopping
 * everybody. A window that cannot remember gets told again, which is the right
 * failure — the alternative is a player who never sees it at all.
 */
export function hurtNoteSeen(): boolean {
  try { return localStorage.getItem(HURT_NOTE_KEY) === '1'; } catch { return false; }
}
export function markHurtNoteSeen() {
  try { localStorage.setItem(HURT_NOTE_KEY, '1'); } catch { /* Told again next time, then. */ }
}

/** Set for good once the career widget has been opened once. */
const CAREER_KEY = 'hitman-career-seen';

/**
 * Whether this browser has opened the career card before.
 *
 * The NEW pill on the innings card's widget comes off the moment it is, once
 * and for good. A flag that still says NEW on the fortieth innings is one
 * nobody reads — and worse, it teaches the player that the flags on that
 * screen do not mean anything.
 */
export function careerSeen(): boolean {
  try { return localStorage.getItem(CAREER_KEY) === '1'; } catch { return false; }
}

export function markCareerSeen() {
  try { localStorage.setItem(CAREER_KEY, '1'); } catch { /* It stays new, then. */ }
}
