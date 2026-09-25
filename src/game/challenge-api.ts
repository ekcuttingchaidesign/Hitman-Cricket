import type { Innings } from './leaderboard';

/**
 * The challenge, from the browser's side.
 *
 * Three calls and two small things kept on the device. The rules all live on the
 * server — `challenge-store.ts` — and nothing here re-states them; this only
 * asks, remembers what it asked about, and never lets a finished innings fall on
 * the floor.
 *
 * The one rule that *is* here, because only the client can keep it: an innings
 * is fetched once before the first ball and nothing is asked of the network
 * again until the thirtieth. Five overs of cricket with no connection is the
 * whole reason this design is affordable, and it is the client that has to not
 * spoil it.
 */

/** Where the endpoints live. Same origin unless the game is published elsewhere. */
const API = import.meta.env.VITE_BOARD_API ?? '';

/** How long a call gets before the game stops waiting for it. */
const TIMEOUT_MS = 6000;

/** The query the link carries. A parameter rather than a path, so the game works
    unchanged under a subdirectory and on a host that cannot rewrite URLs. */
export const CODE_PARAM = 'c';

/** Codes this browser set and has not seen answered. Drives the waiting card. */
const OPEN_KEY = 'hitman-challenges';
/** An innings that finished and could not be sent. Retried on the next open. */
const UNSENT_KEY = 'hitman-unsent';
/** How many the list holds. Past this, the oldest fall off on their own. */
const KEPT_MAX = 20;
/** The week a challenge lives, mirrored from the store so a row can count down. */
export const CHALLENGE_LIFE_MS = 7 * 24 * 3600_000;

/** One innings on a scoreline, as the endpoint sends it. */
export interface ChallengeRow extends Innings {
  playerId: string;
  name: string;
  avatar: number;
  /** The innings ball by ball. The challenger's copy of this is the ghost. */
  card: string;
  challenger: boolean;
  score: number;
}

export interface Challenge {
  code: string;
  state: 'open' | 'answered';
  host: string;
  size: number;
  /** Best first. One row while it is open, two once it is answered. */
  players: ChallengeRow[];
}

/** What every call answers with: a challenge, or a reason there is none. */
export interface ChallengeResult {
  ok: boolean;
  challenge?: Challenge;
  code?: string;
  /** Why it was turned down, in words the player can act on. */
  reason?: string;
  /** Whether waiting and trying again could fix it. A refusal never can. */
  retry?: boolean;
}

/**
 * A challenge this browser set, as it is remembered here.
 *
 * Enough to draw a row without asking the network: what was scored, when it was
 * set, and whether the last look found it answered. The state is a note rather
 * than a truth — the server is the record — so the list refreshes it on open and
 * the row says "nobody yet" rather than "nobody has answered", which would be a
 * claim this browser is in no position to make.
 */
export interface Kept {
  code: string;
  /** What was scored setting it, so a row reads without a fetch. */
  runs: number;
  /** When it was set, for the time left. */
  at: number;
  /** Whether the last look found an answer. Refreshed when the list opens. */
  answered?: boolean;
  /** Who answered and what they made, so a settled row reads with no network. */
  beat?: { name: string; runs: number; won: boolean };
}

/** An innings that finished while the network was not listening. */
export interface Unsent {
  code: string;
  card: string;
  name: string;
  avatar: number;
  at: number;
}

/** A challenge set from a finished innings. */
export function setChallenge(
  playerId: string, name: string, avatar: number, card: string,
): Promise<ChallengeResult> {
  return post({ action: 'create', playerId, name, avatar, card });
}

/** A challenge answered. Safe to call again: the server hands back the result. */
export function answerChallenge(
  code: string, playerId: string, name: string, avatar: number, card: string,
): Promise<ChallengeResult> {
  return post({ action: 'answer', code, playerId, name, avatar, card });
}

/**
 * A challenge read. The one call made before batting, and the one made on app
 * open to see whether anybody answered.
 */
export async function fetchChallenge(code: string): Promise<ChallengeResult> {
  const answer = await ask<Challenge & { error?: string; retry?: boolean }>(
    `${API}/api/challenge?code=${encodeURIComponent(code)}`,
  );
  return read(answer);
}

async function post(body: Record<string, unknown>): Promise<ChallengeResult> {
  return read(await ask<{ code: string; challenge: Challenge; error?: string; retry?: boolean }>(
    `${API}/api/challenge`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) },
  ));
}

/**
 * An answer turned into a result.
 *
 * A refusal is read out as it stands, because the player can act on it — the
 * challenge has closed, somebody already answered, you cannot chase yourself.
 * Nothing at all coming back is the only case this file words itself, because
 * the endpoint never got as far as writing a message.
 */
function read(answer: ({ code?: string; challenge?: Challenge; error?: string; retry?: boolean }) | null): ChallengeResult {
  if (!answer) return { ok: false, reason: 'Could not reach the challenge.', retry: true };
  if (answer.error) return { ok: false, reason: answer.error, retry: answer.retry === true };
  // A read answers with the challenge itself; a write wraps it. Both shapes are
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

/**
 * The message that goes out.
 *
 * It does not carry the score, and that is the point: the number is the one
 * thing the whole model hides until the thirtieth ball, so a share line reading
 * "I scored 102, beat that" would give away in the notification what the game
 * spends five overs withholding. The hook is the blindness, not the total.
 */
export function challengeText(url: string, runs?: number): string {
  return runs === undefined
    ? `I've set you a score on Hitman Cricket. You won't see it till your 30th ball. ${url}`
    : `I scored ${runs} on Hitman Cricket. Beat it — you'll find out at ball 30. ${url}`;
}

export const challengeWhatsapp = (url: string, runs?: number) =>
  `https://wa.me/?text=${encodeURIComponent(challengeText(url, runs))}`;

/** What the winner sends afterwards. The real notification, delivered by a human. */
export function resultText(mine: number, theirs: number, theirName: string, url: string): string {
  return mine > theirs
    ? `${mine} vs ${theirs}. Sit down, ${theirName}. ${url}`
    : `You got me — ${theirs} to ${mine}. Rematch? ${url}`;
}

/* ── What the browser keeps ──────────────────────────────────────────────── */

/**
 * The codes this browser set and has not seen answered.
 *
 * There is no push notification on the web worth having — on iOS it needs the
 * site added to the home screen, which nobody does — so this list is how a
 * challenger finds out they were beaten. It is a convenience and not a record:
 * Safari may clear it after a week of not visiting, which is the same week the
 * challenge lives, so the link in their own sent messages stays the durable copy
 * and the screens say "share again" rather than pretending this is a database.
 */
export function openChallenges(): Kept[] {
  try {
    const held = JSON.parse(localStorage.getItem(OPEN_KEY) ?? '[]') as unknown;
    if (!Array.isArray(held)) return [];
    return held.flatMap(one => {
      // The first version of this list held bare codes. A browser that still
      // has one is not made to throw its challenges away for the upgrade: the
      // code is all that was kept, so the row it draws is the thinner one until
      // the next refresh fills the rest in.
      if (typeof one === 'string') return [{ code: one, runs: 0, at: 0 }];
      const kept = one as Partial<Kept>;
      if (typeof kept.code !== 'string') return [];
      return [{
        code: kept.code,
        runs: Number(kept.runs) || 0,
        at: Number(kept.at) || 0,
        answered: kept.answered === true,
        beat: kept.beat,
      }];
    }).slice(0, KEPT_MAX);
  } catch { return []; }
}

/** Remembers a challenge, newest first, so the list and the badge can read it. */
export function rememberChallenge(kept: Kept) {
  const held = openChallenges().filter(one => one.code !== kept.code);
  write(OPEN_KEY, [kept, ...held].slice(0, KEPT_MAX));
}

/** Drops one, whether because its result has been seen or its owner removed it. */
export function forgetChallenge(code: string) {
  write(OPEN_KEY, openChallenges().filter(one => one.code !== code));
}

/** Notes what a refresh found, so the list and the badge agree without asking again. */
export function markChallenge(code: string, fields: Partial<Kept>) {
  write(OPEN_KEY, openChallenges().map(one => (one.code === code ? { ...one, ...fields } : one)));
}

/** How many are still out there waiting on somebody. What the card's badge counts. */
export function waitingCount(now = Date.now()): number {
  return openChallenges().filter(one => !one.answered && !closed(one, now)).length;
}

/** Whether a challenge's week is up. A stamp of nought is one we never knew. */
export function closed(kept: Kept, now = Date.now()): boolean {
  return kept.at > 0 && now - kept.at >= CHALLENGE_LIFE_MS;
}

/**
 * An innings that finished and could not be sent.
 *
 * Thirty balls is four minutes of somebody's attention and the one thing this
 * feature must never lose. It is held here and retried on the next app open,
 * so a tunnel, a dead spot or a closed laptop costs a delay rather than the
 * innings.
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
