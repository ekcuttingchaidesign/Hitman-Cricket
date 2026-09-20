import type { BlastCareer, CareerMode, SurviveCareer, SurviveTally } from './career';
import { emptyBlast, emptySurvive } from './career';
import type { Innings } from './leaderboard';

/**
 * Careers, fetched and sent.
 *
 * The same two rules that shape `board-api.ts` shape this. Nothing here may
 * hold up an innings — the counting request goes out after the card is already
 * on screen and nobody ever waits on it — and a failure is an answer rather
 * than an exception, because a career that could not be reached is not a career
 * that was lost.
 *
 * There is one rule of its own. A career is the figure a player watches go up,
 * so it is mirrored into this browser as it changes and drawn from the mirror
 * first. A card that says "fetching…" where a number was yesterday is a card
 * that makes the player wonder what happened to their runs.
 */

const API = import.meta.env.VITE_BOARD_API ?? '';

/** How long a career call gets before the game stops waiting for it. */
const TIMEOUT_MS = 4000;
/** How long fetched boards are reused before asking again. */
const FRESH_MS = 60_000;
/** Where this browser's own figures are mirrored. */
const MIRROR_KEY = 'hitman-career';

/** A row on a career board, as the endpoint sends it. */
export interface CareerRow<C> {
  playerId: string;
  name: string;
  avatar: number;
  career: C;
  score: number;
}

/** Every career board of one mode, keyed by the board's own key. */
export interface CareerBoards<C> {
  boards: Record<string, CareerRow<C>[]>;
  size: number;
}

/** One player's own figures, and the name they are ranked under. */
export interface MyCareer<C> {
  career: C | null;
  name: string;
  avatar: number;
  /** A tier held whatever the figures say — see `foundingGrant` in `tier.ts`. */
  granted?: { key: string; reason: string } | null;
}

type AnyCareer = BlastCareer | SurviveCareer;

const cached: Partial<Record<CareerMode, { at: number; payload: CareerBoards<AnyCareer> }>> = {};

/**
 * This innings' own id.
 *
 * Minted once when the innings ends and resent unchanged on a retry, which is
 * the whole of what it is for: without it, a request that timed out on the way
 * back and was sent again would add the same thirty balls to a career twice,
 * and a player on a bad connection would quietly out-score everybody.
 */
export function mintNonce(): string {
  const bytes = new Uint8Array(12);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) crypto.getRandomValues(bytes);
  else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  return Array.from(bytes, byte => (byte % 36).toString(36)).join('');
}

/**
 * The innings, counted.
 *
 * Sent after every innings anybody finishes, with no decision asked of the
 * player — that is what makes "most runs, all time" mean every run rather than
 * every run in an innings good enough for a leaderboard.
 *
 * The name goes along with it so a registered player's career is ranked under
 * the name they claimed. The store only writes it if its own registry agrees
 * the name is theirs, so sending one here can never take somebody else's.
 */
export async function countInnings<C extends AnyCareer>(
  playerId: string, mode: CareerMode, innings: Innings | SurviveTally,
  who: { name: string; avatar: number } | null, nonce: string,
): Promise<MyCareer<C> | null> {
  const answer = await ask<{
    career: C; name: string; avatar: number; counted?: boolean;
    granted?: { key: string; reason: string } | null; error?: string;
  }>(`${API}/api/innings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      playerId, mode, innings, nonce,
      name: who?.name ?? '', avatar: who?.avatar ?? 0,
    }),
  });
  if (!answer || answer.error) return null;
  const mine = {
    career: answer.career, name: answer.name, avatar: answer.avatar, granted: answer.granted ?? null,
  };
  mirror(mode, answer.career);
  // The boards held from before this innings no longer have it on them, so the
  // next open asks again. Without this the card would show a total the board
  // beside it does not, for as long as the held copy stayed fresh — which is
  // exactly the minute after an innings, when both are being looked at.
  if (answer.counted) delete cached[mode];
  return mine;
}

/**
 * This player's own figures for their card. The mirror answers first so the
 * card draws with a number on it, and the fetch corrects it a moment later —
 * which is what carries a career across from another browser once the ids
 * agree, and what shows anything at all when the board is down.
 */
export async function fetchMyCareer<C extends AnyCareer>(
  playerId: string, mode: CareerMode,
): Promise<MyCareer<C> | null> {
  const answer = await ask<MyCareer<C> & { error?: string }>(
    `${API}/api/career?mode=${mode}&player=${encodeURIComponent(playerId)}`,
  );
  if (!answer || answer.error) return null;
  if (answer.career) mirror(mode, answer.career);
  return answer;
}

/**
 * Every career board of one mode, in one call, because the sheet draws them as
 * tabs over one screen and a round trip a tab would make switching feel broken.
 */
export async function fetchCareerBoards<C extends AnyCareer>(
  mode: CareerMode, force = false,
): Promise<CareerBoards<C> | null> {
  const held = cached[mode];
  if (!force && held && Date.now() - held.at < FRESH_MS) return held.payload as CareerBoards<C>;
  const answer = await ask<CareerBoards<C> & { error?: string }>(`${API}/api/career?mode=${mode}`);
  if (!answer || answer.error || !answer.boards) return null;
  cached[mode] = { at: Date.now(), payload: answer as CareerBoards<AnyCareer> };
  return answer;
}

/** Throws away the boards held from last time, so the next open asks again. */
export function forgetCareer() { delete cached.classic; delete cached.survive; }

/**
 * What this browser last saw of its own career, or an empty one.
 *
 * Never the truth — the store is — and deliberately readable before any of it
 * has answered, so the card has a number the instant it opens. A mirror that
 * will not parse is treated as no mirror rather than repaired.
 */
export function heldCareer(mode: CareerMode): AnyCareer {
  const blank = mode === 'survive' ? emptySurvive() : emptyBlast();
  try {
    const raw = localStorage.getItem(MIRROR_KEY);
    if (!raw) return blank;
    const held = (JSON.parse(raw) as Partial<Record<CareerMode, AnyCareer>>)[mode];
    if (!held || typeof held !== 'object') return blank;
    // Field by field, so a mirror written by an older build that is missing a
    // figure reads as a nought rather than as an undefined on the screen.
    const figures = held as unknown as Record<string, unknown>;
    return Object.fromEntries(
      Object.keys(blank).map(key => [key, numberOf(figures[key])]),
    ) as unknown as AnyCareer;
  } catch {
    return blank;
  }
}

/** Keeps this browser's copy in step with whatever the store just said. */
function mirror(mode: CareerMode, career: AnyCareer) {
  try {
    const raw = localStorage.getItem(MIRROR_KEY);
    const held = raw ? JSON.parse(raw) as Record<string, unknown> : {};
    localStorage.setItem(MIRROR_KEY, JSON.stringify({ ...held, [mode]: career }));
  } catch { /* A session remains playable without it. */ }
}

function numberOf(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;
}

/**
 * One request, with a timeout and no way to throw — the same shape
 * `board-api.ts` uses, and for the same reasons. A rejected fetch, a timeout
 * and a body that is not JSON all mean the same thing to the caller.
 */
async function ask<T>(url: string, init: RequestInit = {}): Promise<T | null> {
  const stop = new AbortController();
  const timer = setTimeout(() => stop.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, { ...init, signal: stop.signal });
    const body = await response.json().catch(() => null);
    if (response.ok) return body as T;
    return body && typeof body === 'object' && 'error' in body ? body as T : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
