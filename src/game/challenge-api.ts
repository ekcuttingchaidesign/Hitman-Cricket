import type { Innings } from './leaderboard';
import type { ChallengeState, PlayerStatus } from '../server/challenge-store';

/**
 * The match room, from the browser's side.
 *
 * Six calls and a few small things kept on the device. The rules all live on
 * the server — `challenge-store.ts` — and nothing here re-states them; this
 * only asks, remembers what it was told, and never lets a ball fall on the
 * floor.
 *
 * What the browser keeps is deliberately little. The server's index of rooms
 * per player is the record, and it follows the player id — which, through the
 * career key, follows the player. What is kept here is what a record cannot
 * hold: the innings the network has not taken yet, which rows the owner has
 * tidied off their list, and a tally of results against each friend that lives
 * past the fortnight a room does.
 */

/** Where the endpoints live. Same origin unless the game is published elsewhere. */
const API = import.meta.env.VITE_BOARD_API ?? '';

/** How long a call gets before the game stops waiting for it. */
const TIMEOUT_MS = 6000;

/** The query the link carries. A parameter rather than a path, so the game works
    unchanged under a subdirectory and on a host that cannot rewrite URLs. */
export const CODE_PARAM = 'c';

/** How often an open room asks what has changed. Two seconds is a ball. */
export const POLL_MS = 2000;

const UNSENT_KEY = 'hitman-unsent';
const HIDDEN_KEY = 'hitman-challenges-hidden';
const SEEN_KEY = 'hitman-challenges-seen';
const RIVALRY_KEY = 'hitman-rivalry';
const RIVALRY_MAX = 200;

/** One innings in the room, as the endpoint sends it. */
export interface ChallengeRow extends Innings {
  playerId: string;
  name: string;
  avatar: number;
  /** The innings so far, ball by ball. Another player's copy of this is the ghost. */
  card: string;
  host: boolean;
  status: PlayerStatus;
  joined: number;
  at: number;
  seen: boolean;
  /** The room's order. Higher first; equal is a draw. */
  score: number;
}

export interface Challenge {
  code: string;
  state: ChallengeState;
  host: string;
  at: number;
  expiresAt: number;
  v: number;
  rematchOf: string | null;
  size: number;
  /** Finished innings first, best first; then the ones still going; then the rest. */
  players: ChallengeRow[];
}

/** What every call answers with: a room, or a reason there is none. */
export interface ChallengeResult {
  ok: boolean;
  challenge?: Challenge;
  code?: string;
  /** Why it was turned down, in words the player can act on. */
  reason?: string;
  /** Whether waiting and trying again could fix it. A refusal never can. */
  retry?: boolean;
  status?: number;
}

/** The list a player asks for on open. */
export interface ChallengeListResult {
  ok: boolean;
  challenges?: Challenge[];
  retry?: boolean;
}

/** An innings the network has not taken yet. */
export interface Unsent {
  code: string;
  card: string;
  name: string;
  avatar: number;
  at: number;
}

/** One result against one friend, as this browser saw it land. */
export interface RivalryEntry {
  code: string;
  them: { playerId: string; name: string; avatar: number };
  mine: { runs: number; sixes: number; fours: number };
  theirs: { runs: number; sixes: number; fours: number };
  outcome: 'W' | 'L' | 'D';
  at: number;
}

/* ── The calls ───────────────────────────────────────────────────────────── */

/** A room, made. Empty unless an innings that just ended is handed in with it. */
export function createRoom(
  playerId: string, name: string, avatar: number, extra: { card?: string; rematchOf?: string } = {},
): Promise<ChallengeResult> {
  return post({ action: 'create', playerId, name, avatar, ...extra });
}

/** The link opened. Safe to call again: the server hands back the room. */
export function joinRoom(code: string, playerId: string, name: string, avatar: number): Promise<ChallengeResult> {
  return post({ action: 'join', code, playerId, name, avatar });
}

/** The innings so far, sent whole every ball. Safe to call again. */
export function sendBalls(code: string, playerId: string, name: string, avatar: number, card: string): Promise<ChallengeResult> {
  return post({ action: 'ball', code, playerId, name, avatar, card });
}

/** The result has been looked at. */
export function sendSeen(code: string, playerId: string, name: string, avatar: number): Promise<ChallengeResult> {
  return post({ action: 'seen', code, playerId, name, avatar });
}

/** The room as it stands. The call an open room makes every two seconds. */
export async function fetchChallenge(code: string): Promise<ChallengeResult> {
  return read(await ask<Challenge & { error?: string; retry?: boolean; status?: number }>(
    `${API}/api/challenge?code=${encodeURIComponent(code)}`,
  ));
}

/** Every room this player is in. One call on open. */
export async function fetchMine(playerId: string): Promise<ChallengeListResult> {
  const answer = await ask<{ challenges?: Challenge[]; error?: string; retry?: boolean }>(
    `${API}/api/challenge?player=${encodeURIComponent(playerId)}`,
  );
  if (!answer) return { ok: false, retry: true };
  if (answer.error || !Array.isArray(answer.challenges)) return { ok: false, retry: answer.retry === true };
  return { ok: true, challenges: answer.challenges };
}

async function post(body: Record<string, unknown>): Promise<ChallengeResult> {
  return read(await ask<{ code: string; challenge: Challenge; error?: string; retry?: boolean; status?: number }>(
    `${API}/api/challenge`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) },
  ));
}

/**
 * An answer turned into a result.
 *
 * A refusal is read out as it stands, because the player can act on it — the
 * room has closed, it is full, that name is not allowed. Nothing at all coming
 * back is the only case this file words itself, because the endpoint never got
 * as far as writing a message.
 */
function read(
  answer: ({ code?: string; challenge?: Challenge; error?: string; retry?: boolean; status?: number }) | null,
): ChallengeResult {
  if (!answer) return { ok: false, reason: 'Could not reach the match.', retry: true };
  if (answer.error) return { ok: false, reason: answer.error, retry: answer.retry === true, status: answer.status };
  // A read answers with the room itself; a write wraps it. Both shapes are
  // handled here so a caller never has to know which call it made.
  const challenge = answer.challenge ?? (answer as unknown as Challenge);
  return { ok: true, challenge, code: answer.code ?? challenge.code };
}

/** The link a friend follows. The game's own address, with the code on it. */
export function challengeLink(code: string): string {
  const url = new URL(location.pathname, location.origin);
  url.searchParams.set(CODE_PARAM, code);
  return url.href;
}

/** The code this page was opened with, or null. */
export function codeFromLocation(search = location.search): string | null {
  const code = new URLSearchParams(search).get(CODE_PARAM);
  return code && code.trim() ? code.trim() : null;
}

/* ── What goes out ───────────────────────────────────────────────────────── */

/**
 * The messages, and they are taunts, on purpose.
 *
 * None of them carries a score unless asked to, and that is the point: the
 * number is the one thing the whole mode hides until the last ball, so a share
 * line reading "I scored 102, beat that" would give away in the notification
 * what the game spends five overs withholding. The hook is the blindness.
 */
export const copy = {
  /** The link, before anybody has batted. */
  invite: (url: string) =>
    `Fancy 30 balls? I've opened a match on Hitman Cricket. You won't see my score till your last ball. ${url}`,
  /** The link, once the sender's innings is in. */
  set: (url: string, runs?: number) => runs === undefined
    ? `I've set you a score on Hitman Cricket. You won't see it till your 30th ball. ${url}`
    : `I scored ${runs} on Hitman Cricket. Beat it — you'll find out at ball 30. ${url}`,
  /** The link again, to somebody who has not got round to it. */
  nudge: (url: string) => `Still waiting on you. My innings is in. Yours isn't. ${url}`,
  /** A fresh room, aimed at the same person. */
  rematch: (url: string, them: string, tally: string) => `Rematch, ${them}. ${tally}. ${url}`,
  /** What the winner sends afterwards. The real notification, delivered by a human. */
  result: (mine: number, theirs: number, them: string, url: string) => mine > theirs
    ? `${mine} vs ${theirs}. Sit down, ${them}. ${url}`
    : mine === theirs
      ? `${mine} each. Nobody sits down. Rematch: ${url}`
      : `You got me — ${theirs} to ${mine}. Rematch? ${url}`,
};

export const whatsapp = (text: string) => `https://wa.me/?text=${encodeURIComponent(text)}`;

/* ── What the browser keeps ──────────────────────────────────────────────── */

/**
 * The innings the network has not taken yet.
 *
 * Every ball is sent as it happens, and most of them arrive. The one that does
 * not is held here and goes with the next, or on the next open — so a tunnel,
 * a dead spot or a closed laptop costs a delay and never the innings.
 */
export function holdUnsent(unsent: Unsent) { write(UNSENT_KEY, unsent); }

export function readUnsent(): Unsent | null {
  try {
    const held = JSON.parse(localStorage.getItem(UNSENT_KEY) ?? 'null') as Partial<Unsent> | null;
    if (!held || typeof held.code !== 'string' || typeof held.card !== 'string') return null;
    return {
      code: held.code,
      card: held.card,
      name: typeof held.name === 'string' ? held.name : '',
      avatar: Number(held.avatar) || 0,
      at: Number(held.at) || Date.now(),
    };
  } catch { return null; }
}

export function clearUnsent() {
  try { localStorage.removeItem(UNSENT_KEY); } catch { /* Then it is retried once more. */ }
}

/**
 * Rows the owner has taken off their list. Tidying, not cancelling: the room
 * is still there for everybody else in it, and the row says so before it goes.
 */
export function hiddenChallenges(): string[] {
  return strings(HIDDEN_KEY);
}
export function hideChallenge(code: string) {
  write(HIDDEN_KEY, [...new Set([code, ...hiddenChallenges()])].slice(0, 100));
}

/**
 * Results this browser has already shown, kept here as well as on the server
 * so the same result is not shown twice when the note to the server was lost.
 */
export function seenHere(code: string): boolean { return strings(SEEN_KEY).includes(code); }
export function markSeenHere(code: string) {
  write(SEEN_KEY, [...new Set([code, ...strings(SEEN_KEY)])].slice(0, 100));
}

/**
 * The tally against each friend.
 *
 * A room lives a fortnight; a rivalry lives as long as the two of them keep
 * playing, so it cannot be worked out from the rooms alone. Each result is
 * noted once, the first time this browser sees it land, keyed by room so a
 * result seen twice is counted once.
 */
export function recordResult(entry: RivalryEntry) {
  const held = rivalryEntries().filter(one => one.code !== entry.code);
  write(RIVALRY_KEY, [entry, ...held].slice(0, RIVALRY_MAX));
}

export function rivalryEntries(): RivalryEntry[] {
  try {
    const held = JSON.parse(localStorage.getItem(RIVALRY_KEY) ?? '[]') as unknown;
    if (!Array.isArray(held)) return [];
    return held.filter((one): one is RivalryEntry =>
      !!one && typeof one === 'object' && typeof (one as RivalryEntry).code === 'string'
      && !!(one as RivalryEntry).them && ['W', 'L', 'D'].includes((one as RivalryEntry).outcome));
  } catch { return []; }
}

/** Everything noted against one person, newest first. */
export function rivalryWith(playerId: string): RivalryEntry[] {
  return rivalryEntries().filter(one => one.them.playerId === playerId);
}

function strings(key: string): string[] {
  try {
    const held = JSON.parse(localStorage.getItem(key) ?? '[]') as unknown;
    return Array.isArray(held) ? held.filter((one): one is string => typeof one === 'string') : [];
  } catch { return []; }
}

function write(key: string, value: unknown) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* A session remains playable without it. */ }
}

/**
 * One request, with a timeout and no way to throw. A rejected fetch, a timeout
 * and a body that is not JSON all mean the same thing to the caller: no answer.
 * A body carrying `error` comes back whatever the status, because the endpoint's
 * own `failed` writes those in words a player can read.
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
