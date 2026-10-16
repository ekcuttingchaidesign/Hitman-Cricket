import { inventedBoard } from './board-fixture';
import type { BoardRow, Innings } from './leaderboard';
import { readPlayer } from './player';
import type { SurviveInnings, SurviveRow } from './survive-board';
import type { MarathonFigures, SoloRow, TeamRow } from './marathon-board';

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
export const API = import.meta.env.VITE_BOARD_API ?? '';

/** How long the board gets before the game stops waiting for it. */
const TIMEOUT_MS = 4000;
/** How long a fetched board is reused before asking again. */
const FRESH_MS = 20_000;

/** Which board is being asked for. Each is its own ladder over its own keys. */
export type BoardMode = 'classic' | 'survive' | 'marathon';

export interface BoardPayload {
  rows: BoardRow[];
  cutoff: number | null;
  size: number;
}

/** The same answer, shaped by the Test match's own ladder. */
export interface SurvivePayload {
  rows: SurviveRow[];
  cutoff: number | null;
  size: number;
}

/** The Test Marathon's two ladders, which come as one answer: see `api/board.ts`. */
export interface MarathonPayload {
  team: { rows: TeamRow[]; cutoff: number | null; size: number };
  solo: { rows: SoloRow[]; cutoff: number | null; size: number };
}

/** What the sheet knows about the board it is drawing. */
export type BoardState = 'ready' | 'loading' | 'offline';

/**
 * Where a player stands on a whole board — not the fifty, all of it — as the
 * store counts it: the place from one, the score holding it, and how many are
 * on it. A place of null is a player the board has never seen.
 */
export interface Standing {
  rank: number | null;
  score: number | null;
  total: number;
}

/** Where an innings left its player, and where they stood before it (null: nowhere). */
export interface PostStanding extends Standing {
  was: { rank: number; score: number } | null;
}

/** A player's place, asked for without an innings, with the row that holds it. */
export interface PlayerStanding<R = Record<string, unknown>> extends Standing {
  row: R | null;
}

export interface SubmitResult<P = BoardPayload> {
  ok: boolean;
  /** For the Marathon, one flag a ladder: `{ team, solo }`. */
  improved?: boolean | { team: boolean; solo: boolean };
  score?: number | { team: number; solo: number };
  /** The board as it stands with this innings on it, so nothing has to guess. */
  board?: P;
  /**
   * Where the player stands on the whole board now, and stood before this
   * innings — however far below the fifty. For the Marathon, `{ team, solo }`.
   */
  standing?: PostStanding | { team: PostStanding; solo: PostStanding };
  /** Why it was turned down, in words the player can act on. */
  reason?: string;
  /**
   * The name is held by somebody else — which, for a player typing the name
   * they have always used, almost always means it is held by them, on a
   * device that has forgotten who they are. It is the one refusal this game
   * can answer with a way back, so it is carried as a fact rather than left
   * to be recognised from the sentence.
   */
  taken?: boolean;
  /**
   * Which name is held, where that is not the one typed: "Rohit 2" refused
   * because "Rohit" was claimed in the last day comes back with "Rohit", so
   * the way back starts from the name the record is under.
   */
  held?: string;
  /**
   * The career key, where this claim is the one that minted it. Handed over
   * once and kept nowhere on our side but a salted hash, so the browser that
   * reads this answer is the only thing in the world holding it.
   */
  key?: string;
}

/**
 * Every failure of the board is followed by this, because it is true: the card,
 * the personal best and the innings itself are the player's own and were never
 * the board's to lose.
 */
const STILL_COUNTS = 'Your innings still counts on this device.';

/**
 * One held board per mode. Keyed rather than single, or opening the Test board
 * and then the five-over one would hand the second the first one's fifty — the
 * rows have different figures on them and the sheet would draw whichever it was
 * given.
 */
const cached: Partial<Record<BoardMode, { at: number; payload: BoardPayload | SurvivePayload | MarathonPayload }>> = {};

/**
 * The fifty. A board fetched in the last few seconds is reused rather than
 * fetched again, because opening and closing the sheet twice is not two boards.
 * Answers null when there is nothing to show, which the sheet says out loud.
 */
export async function fetchBoard(force = false): Promise<BoardPayload | null> {
  return await board(force, 'classic') as BoardPayload | null;
}

/** The Test fifty, under its own ladder. */
export async function fetchSurviveBoard(force = false): Promise<SurvivePayload | null> {
  return await board(force, 'survive') as SurvivePayload | null;
}

/** The Test Marathon's two ladders, fetched together. */
export async function fetchMarathonBoard(force = false): Promise<MarathonPayload | null> {
  return await board(force, 'marathon') as MarathonPayload | null;
}

async function board(force: boolean, mode: BoardMode) {
  const held = cached[mode];
  if (!force && held && Date.now() - held.at < FRESH_MS) return held.payload;
  const query = mode === 'classic' ? '' : `?mode=${mode}`;
  // `ask` hands back a refusal as readily as a board, and the sheet has one line
  // for every way this can fail, so anything carrying `error` is no board here.
  const answer = await ask<BoardPayload & { error?: string }>(`${API}/api/board${query}`);
  const payload = answer && !answer.error ? answer : null;
  if (payload) cached[mode] = { at: Date.now(), payload };
  // In development there is usually no database behind any of this, so the
  // invented fifty stand in. They never stand in for a live board — and there
  // are none invented for the Test match, which would rather show nothing than
  // a ladder of people who never batted.
  else if (import.meta.env.DEV && mode === 'classic') return { rows: inventedBoard(), cutoff: null, size: 50 };
  return payload;
}

/**
 * An innings offered to the board. The server stamps it, ranks it and answers
 * with the board it made, so nothing here has to guess where the player landed.
 */
export function submitInnings(
  playerId: string, name: string, avatar: number, innings: Innings,
): Promise<SubmitResult<BoardPayload>> {
  return offer(playerId, name, avatar, innings, 'classic') as Promise<SubmitResult<BoardPayload>>;
}

/** The Test innings, offered to the Test ladder. */
export function submitSurvive(
  playerId: string, name: string, avatar: number, innings: SurviveInnings,
): Promise<SubmitResult<SurvivePayload>> {
  return offer(playerId, name, avatar, innings, 'survive') as Promise<SubmitResult<SurvivePayload>>;
}

/**
 * A whole Marathon innings, offered to both its ladders at once: the store
 * writes the side to one and the best of the three to the other.
 */
export function submitMarathon(
  playerId: string, name: string, avatar: number, innings: MarathonFigures,
): Promise<SubmitResult<MarathonPayload>> {
  return offer(playerId, name, avatar, innings, 'marathon') as Promise<SubmitResult<MarathonPayload>>;
}

async function offer(
  playerId: string, name: string, avatar: number, innings: Innings | SurviveInnings | MarathonFigures, mode: BoardMode,
): Promise<SubmitResult<BoardPayload | SurvivePayload | MarathonPayload>> {
  const answer = await ask<{
    improved: SubmitResult['improved']; score: SubmitResult['score']; board: BoardPayload | SurvivePayload | MarathonPayload;
    standing?: SubmitResult['standing']; error?: string; retry?: boolean; status?: number; key?: string; held?: string;
  }>(
    `${API}/api/score`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // The name this browser batted under before, for a claim that changes
      // it: the key already saved for that name comes across to this one.
      body: JSON.stringify({ playerId, name, avatar, innings, mode, previous: readPlayer()?.name }),
    },
  );
  // Nothing came back at all: a timeout, a dropped connection, or a crash with
  // no body to read. There is nothing more specific to say than this.
  if (!answer) return { ok: false, reason: `The board could not be reached. ${STILL_COUNTS}` };
  // A refusal is read out as it stands, because the player can act on it. A
  // failure of the board itself gets the reassurance appended, because they
  // cannot, and being told their hundred vanished would be the wrong reading.
  if (answer.error) {
    return {
      ok: false,
      reason: answer.retry ? `${answer.error} ${STILL_COUNTS}` : answer.error,
      taken: answer.status === 409,
      held: typeof answer.held === 'string' ? answer.held : undefined,
    };
  }
  cached[mode] = { at: Date.now(), payload: answer.board };
  // The place held from before is now the place before this innings.
  delete standings[mode];
  return {
    ok: true, improved: answer.improved, score: answer.score, board: answer.board, standing: answer.standing,
    key: answer.key,
  };
}

/** One held place a mode, for the reason the boards are held: two looks in a few seconds are one question. */
const standings: Partial<Record<BoardMode, { at: number; player: string; payload: unknown }>> = {};

/**
 * Where this browser's player stands on a mode's whole board, for a screen
 * opened without an innings just played — the cover's "you are #73". Asked of
 * the store directly and never cached at the edge: it is about who is asking.
 * Null with no player id yet, no answer, or no board behind the game.
 */
export async function fetchStanding(player: string | null, mode: 'classic' | 'survive'): Promise<PlayerStanding | null>;
export async function fetchStanding(
  player: string | null, mode: 'marathon',
): Promise<{ team: PlayerStanding; solo: PlayerStanding } | null>;
export async function fetchStanding(player: string | null, mode: BoardMode): Promise<unknown> {
  if (!player) return null;
  const held = standings[mode];
  if (held && held.player === player && Date.now() - held.at < FRESH_MS) return held.payload;
  const query = `?player=${encodeURIComponent(player)}${mode === 'classic' ? '' : `&mode=${mode}`}`;
  const answer = await ask<{ error?: string }>(`${API}/api/board${query}`);
  if (!answer || answer.error) return null;
  standings[mode] = { at: Date.now(), player, payload: answer };
  return answer;
}

/** What claiming a name on its own answers: the name as held, and the key where this claim minted it. */
export interface NameResult {
  ok: boolean;
  name?: string;
  key?: string;
  reason?: string;
  taken?: boolean;
  held?: string;
  /** No answer, or the store itself failing: nothing the player typed was wrong. */
  offline?: boolean;
}

/**
 * A name claimed with no innings for a board: the end card's offer to a player
 * with no name whose innings earned no place. The same gate a board claim
 * passes, and the same key back — see `api/name.ts`.
 */
export async function claimName(playerId: string, name: string, avatar: number, previous?: string): Promise<NameResult> {
  const answer = await ask<{ name?: string; key?: string; error?: string; retry?: boolean; status?: number; held?: string }>(
    `${API}/api/name`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // The name this browser bats under now, so the key already saved for it
      // opens the new one too. The store checks it is this player's.
      body: JSON.stringify({ playerId, name, avatar, previous }),
    },
  );
  if (!answer) return { ok: false, reason: 'The board could not be reached. Try again in a moment.', offline: true };
  if (answer.error) {
    return {
      ok: false,
      reason: answer.error,
      offline: answer.retry === true,
      taken: answer.status === 409,
      held: typeof answer.held === 'string' ? answer.held : undefined,
    };
  }
  return { ok: true, name: answer.name, key: answer.key };
}

/** Throws away the board held from last time, so the next open asks again. */
export function forgetBoard() {
  for (const mode of ['classic', 'survive', 'marathon'] as const) { delete cached[mode]; delete standings[mode]; }
}

/**
 * One request, with a timeout and no way to throw. A rejected fetch, a timeout
 * and a body that is not JSON all mean the same thing to the caller: no answer.
 *
 * The exception is a body carrying `error`, which comes back whatever the
 * status. Only the endpoints' own `failed` writes that field, and every message
 * it writes is already in words the player can read — a name already taken, an
 * innings that could not have happened, a board with no database behind it. The
 * status is carried alongside it as `retry` rather than inspected here, so a
 * refusal and an outage are told apart by what the answer says rather than by a
 * number this function would have to interpret.
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
