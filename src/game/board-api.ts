import { inventedBoard } from './board-fixture';
import type { BoardRow, Innings } from './leaderboard';

/**
 * The board, fetched.
 *
 * Two rules shape everything here. The board must never hold up an innings — if
 * it is slow or down, the game still ends and the card still shows — so every
 * call is on a short leash and a failure is an answer rather than an exception.
 * And the fifty invented rows are for developing against, never for showing a
 * player: a live board that quietly falls back to made-up names is lying about
 * who is on it. So the fixture answers only where there is no API to ask.
 */

/**
 * Where the endpoints live. Empty means the same origin as the game, which is
 * the case when Vercel serves both. Set `VITE_BOARD_API` at build time when the
 * game is published somewhere that cannot run them — GitHub Pages — and the
 * board is fetched across origins instead. The API's allowlist has to name that
 * origin for the browser to allow it.
 */
const API = import.meta.env.VITE_BOARD_API ?? '';

/** How long the board gets before the game stops waiting for it. */
const TIMEOUT_MS = 4000;
/** How long a fetched board is reused before asking again. */
const FRESH_MS = 20_000;

export interface BoardPayload {
  rows: BoardRow[];
  cutoff: number | null;
  size: number;
}

/** What the sheet knows about the board it is drawing. */
export type BoardState = 'ready' | 'loading' | 'offline';

export interface SubmitResult {
  ok: boolean;
  improved?: boolean;
  score?: number;
  board?: BoardPayload;
  /** Why it was turned down, in words the player can act on. */
  reason?: string;
}

let cached: { at: number; payload: BoardPayload } | null = null;

/**
 * The fifty. A board fetched in the last few seconds is reused rather than
 * fetched again, because opening and closing the sheet twice is not two boards.
 * Answers null when there is nothing to show, which the sheet says out loud.
 */
export async function fetchBoard(force = false): Promise<BoardPayload | null> {
  if (!force && cached && Date.now() - cached.at < FRESH_MS) return cached.payload;
  const payload = await ask<BoardPayload>(`${API}/api/board`);
  if (payload) cached = { at: Date.now(), payload };
  // In development there is usually no database behind any of this, so the
  // invented fifty stand in. They never stand in for a live board.
  else if (import.meta.env.DEV) return { rows: inventedBoard(), cutoff: null, size: 50 };
  return payload;
}

/**
 * An innings offered to the board. The server stamps it, ranks it and answers
 * with the board it made, so nothing here has to guess where the player landed.
 */
export async function submitInnings(
  playerId: string, name: string, avatar: number, innings: Innings,
): Promise<SubmitResult> {
  const answer = await ask<{ improved: boolean; score: number; board: BoardPayload; error?: string }>(
    `${API}/api/score`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ playerId, name, avatar, innings }) },
  );
  if (!answer) return { ok: false, reason: 'The board could not be reached. Your innings still counts on this device.' };
  if (answer.error) return { ok: false, reason: answer.error };
  cached = { at: Date.now(), payload: answer.board };
  return { ok: true, improved: answer.improved, score: answer.score, board: answer.board };
}

/** Throws away the board held from last time, so the next open asks again. */
export function forgetBoard() { cached = null; }

/**
 * One request, with a timeout and no way to throw. A rejected fetch, a timeout,
 * a 500 and a body that is not JSON all mean the same thing to the caller: no
 * answer. The one exception is a refusal the player needs to read — a name
 * already taken — which comes back as an object carrying `error`.
 */
async function ask<T>(url: string, init: RequestInit = {}): Promise<T | null> {
  const stop = new AbortController();
  const timer = setTimeout(() => stop.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, { ...init, signal: stop.signal });
    const body = await response.json().catch(() => null);
    if (response.ok) return body as T;
    // 4xx carries a reason worth showing; 5xx is the board being down.
    return body && typeof body === 'object' && 'error' in body && response.status < 500 ? body as T : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
