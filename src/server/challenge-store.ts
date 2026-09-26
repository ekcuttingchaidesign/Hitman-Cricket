import type { Innings } from '../game/leaderboard.js';
import { BALL_CHARS, MAX_BALLS, ended, figuresOf } from '../game/ball-string.js';
import { AVATARS, NAME_MAX, cleanName } from './board-store.js';
import { NAME_BLOCKED_REASON, nameBlocked } from './name-filter.js';

/**
 * A match room: one link, and everybody who bats under it.
 *
 * The same code is the lobby, the live scores and the result, depending on
 * where the match is — there is no separate "challenge" and "answer". Whoever
 * opens the link joins the room; whoever taps Play bats; every ball is written
 * here as it happens, so a friend batting at the same time sees it land and a
 * friend batting on Thursday sees the same thing replayed. Nobody waits on
 * anybody: the room reads whatever has happened so far and says so.
 *
 * Roles are symmetric. The person who made the room is the host, and that buys
 * them nothing but the first row; whoever bats first is the ghost for whoever
 * bats second, and the host can send the link and never bat at all.
 *
 * What a player sends is thirty characters at most and nothing else — see
 * `ball-string.ts`. Each ball is the whole innings so far, and the store only
 * ever accepts a longer string that begins with the one it holds. That is what
 * makes a dropped connection cost a retry rather than an innings, and what
 * makes "bat it again for a better score" impossible: the balls already in
 * cannot be taken back. Scores are worked out from the characters, here, so a
 * client never states its own.
 *
 * Two things are borrowed from the board rather than restated: `cleanName` is
 * the same name cleaning, and the kits are the same five kits. What is not
 * borrowed is the permanent name registry — a room lasts a week, and burning a
 * forever-name on one would cost the board a name every time two friends
 * played.
 */

/**
 * How many people one link can carry. Two is the match; the rest is a group
 * chat forwarding one link, and twenty rows is where a room stops being
 * readable on a phone.
 */
export const PLAYERS_MAX = 20;

/** How long a room takes innings for. A week, because the friend was busy. */
export const CHALLENGE_LIFE_MS = 7 * 24 * 3600_000;

/**
 * How long the record is kept: the week it is open, and a week after that so
 * a link opened late still says what happened rather than nothing at all.
 */
export const CHALLENGE_TTL_SECONDS = 14 * 24 * 3600;

/**
 * An innings started and then left for a day is given up, not paused. Without
 * this, walking out on a bad over would leave the other player waiting forever
 * with no result; with it, the walk-out is a loss and the wait is a day.
 */
export const FORFEIT_AFTER_MS = 24 * 3600_000;

/**
 * Bumped when the scoring changes enough that two innings played either side
 * of the change are not comparable. A room made under an older number is void
 * rather than decided — a result nobody can trust is worse than none.
 */
export const SCORING_VERSION = 1;

/**
 * The alphabet a code is drawn from: digits and capitals, less the four that get
 * misread aloud or retyped wrong — `0` and `O`, `1` and `I`.
 */
export const CODE_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

/**
 * Six characters: a billion codes, which is not a keyspace anybody can walk in
 * the fortnight one lives, and it still reads aloud in one breath.
 */
export const CODE_LENGTH = 6;

/** How many codes are tried before giving up. A billion makes five plenty. */
const CODE_TRIES = 5;

/**
 * Rooms made from one address an hour, and writes from one an hour.
 *
 * Reads are not counted at all, deliberately: a room read is the same answer for
 * everybody who holds the link and is served from the edge cache, so counting
 * them would spend a database command per read to police the very thing the
 * cache exists to make free. A write is a ball, a join or a dismissal — thirty
 * balls an innings — so the ceiling is high enough for an evening of rematches
 * and low enough that a script gets bored.
 */
export const CREATE_LIMIT = 30;
export const WRITE_LIMIT = 1500;
export const RATE_WINDOW_SECONDS = 3600;

/** Where a room is in its life. Derived, never stored — see `stateOf`. */
export type ChallengeState = 'open' | 'live' | 'done' | 'expired' | 'void';

/** Where one player is in theirs. Derived from their balls and their clock. */
export type PlayerStatus = 'joined' | 'batting' | 'done' | 'forfeit';

/**
 * One player as they are kept: who they are, the balls so far, and two clocks.
 *
 * The figures are not here. They are worked out from `card` every time they are
 * needed, which is what stops a stored score and a stored innings ever being two
 * different things.
 */
export interface StoredPlayer {
  name: string;
  avatar: number;
  /** The innings so far, one character per ball. Empty until the first ball. */
  card: string;
  /** When they opened the room. */
  joined: number;
  /** When they last wrote — a join, a ball. What forfeit is judged on. */
  at: number;
  /** Whether they have been shown the result. */
  seen?: boolean;
}

/**
 * A room as it is kept.
 *
 * In Redis this is one hash, which is what makes a whole room one command to
 * read. `at`, `host`, `v` and `rematchOf` are its own fields and every other
 * field is a player id holding that player's innings. The two cannot collide: a
 * player id always carries a dash and none of the reserved names does.
 */
export interface StoredChallenge {
  at: number;
  host: string;
  /** The scoring version it was made under. */
  v: number;
  /** The room this one is a rematch of, if it is one. */
  rematchOf: string | null;
  players: Record<string, StoredPlayer>;
}

/** The fields of a room a write may change. Only ever some players' rows. */
export interface ChallengeChange {
  players?: Record<string, StoredPlayer>;
}

/** Everything a room needs from whatever is keeping it. */
export interface ChallengeStore {
  /**
   * Takes this code if nobody holds it, and says whether it did. One call rather
   * than a read then a write, or two rooms made in the same second would both be
   * told the code was free and the second would flatten the first.
   */
  claim(code: string, challenge: StoredChallenge, ttlSeconds: number): Promise<boolean>;
  /** The whole room in one read, or null if there is none under that code. */
  read(code: string): Promise<StoredChallenge | null>;
  /** Writes these fields. Fields left out are left alone. */
  write(code: string, change: ChallengeChange, ttlSeconds: number): Promise<void>;
  /** How many of this kind of call this address has made in the window, counting this one. */
  hits(kind: 'create' | 'write', address: string, windowSeconds: number): Promise<number>;
  /** Notes that this player is in this room, so their list can find it. */
  index(playerId: string, code: string, ttlSeconds: number): Promise<void>;
  /** The codes this player is in. Order is not promised. */
  indexed(playerId: string): Promise<string[]>;
  /** Forgets a code that no longer opens anything. */
  unindex(playerId: string, code: string): Promise<void>;
}

/** One innings in the room, as the endpoint sends it. */
export interface ChallengeRow extends Innings {
  playerId: string;
  name: string;
  avatar: number;
  /** The innings so far, ball by ball. Another player's copy of this is the ghost. */
  card: string;
  /** Whether this is the player who made the room. */
  host: boolean;
  status: PlayerStatus;
  joined: number;
  at: number;
  seen: boolean;
  /** The number the room is ordered on. Higher first; equal is a draw. */
  score: number;
}

/**
 * What the endpoint answers with, and it carries nothing about who is asking.
 *
 * That is what lets it sit in the edge cache: everyone holding the link gets the
 * same bytes, and each client finds its own row by player id. It does carry
 * every innings ball by ball, because those strings *are* the ghost the next
 * batter plays against — so a total is in the response from the first ball, and
 * keeping it off the screen until the thirtieth is the client's job, not the
 * wire's.
 */
export interface ChallengePayload {
  code: string;
  state: ChallengeState;
  host: string;
  at: number;
  /** When the room stops taking innings. */
  expiresAt: number;
  v: number;
  rematchOf: string | null;
  size: number;
  /** Finished innings first, best first; then the ones still going; then the rest. */
  players: ChallengeRow[];
}

/** A call the room took. */
export interface ChallengeAccepted {
  ok: true;
  code: string;
  challenge: ChallengePayload;
}

/** A call it turned down, and what to tell the player. */
export interface ChallengeRefusal {
  ok: false;
  status: number;
  reason: string;
}

/**
 * Both halves are named rather than written inline, and `challengeRefused` below
 * is a real type predicate rather than an `if (!outcome.ok)` that leans on
 * inference. TypeScript only narrows a `true | false` discriminant under
 * `strictNullChecks`, and `api/` is built by a compiler this repository does not
 * configure — the board's own union not narrowing there failed three deployments
 * while `tsc --noEmit` passed every time locally.
 */
export type ChallengeOutcome = ChallengeAccepted | ChallengeRefusal;

/** The list a player asks for on open: every room they are in. */
export interface ChallengeListOutcome {
  ok: true;
  challenges: ChallengePayload[];
}

/** Whether the room turned this call down. */
export function challengeRefused(outcome: ChallengeOutcome | ChallengeListOutcome): outcome is ChallengeRefusal {
  return !outcome.ok;
}

/** Who is calling. */
export interface Batter {
  playerId: string;
  name: string;
  avatar: number;
  /** Whoever the edge says is asking. Used to rate limit, never as identity. */
  address: string;
}

/** A fresh code. Random is injected so a test can make it collide on purpose. */
export function newCode(random: () => number = Math.random): string {
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += CODE_ALPHABET[Math.floor(random() * CODE_ALPHABET.length)];
  }
  return code;
}

/**
 * A code as typed, or null if it is not one.
 *
 * Lower case is raised, because somebody reading a code off a phone types it in
 * lower case. Nothing else is repaired: a character outside the alphabet means
 * the code was misheard or the link was mangled, and which character was meant
 * is a guess. A room opened by a guess is somebody else's room.
 */
export function cleanCode(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const code = raw.trim().toUpperCase();
  if (code.length !== CODE_LENGTH) return null;
  return [...code].every(char => CODE_ALPHABET.includes(char)) ? code : null;
}

/** Where one player is. Read off their balls and their last write, never stored. */
export function statusOf(player: StoredPlayer, now = Date.now()): PlayerStatus {
  if (!player.card) return 'joined';
  if (ended(figuresOf(player.card))) return 'done';
  return now - player.at > FORFEIT_AFTER_MS ? 'forfeit' : 'batting';
}

/**
 * Where the room is.
 *
 * Void beats everything: a result under the wrong rules is not a result.
 * Done beats expired, because a match that finished on Tuesday is still a
 * match on Friday week. Done means at least two innings are settled and
 * nobody who joined is still to bat — a third friend who has opened the link
 * and not yet played keeps the room live for them.
 */
export function stateOf(challenge: StoredChallenge, now = Date.now()): ChallengeState {
  if (challenge.v !== SCORING_VERSION) return 'void';
  const statuses = Object.values(challenge.players).map(player => statusOf(player, now));
  const settled = statuses.filter(status => status === 'done' || status === 'forfeit').length;
  const batting = statuses.some(status => status === 'batting');
  const waiting = statuses.some(status => status === 'joined');
  if (settled >= 2 && !batting && !waiting) return 'done';
  if (now >= challenge.at + CHALLENGE_LIFE_MS) return 'expired';
  return settled > 0 || batting ? 'live' : 'open';
}

/** The checks every call shares: a real player, a kit that exists, a usable name. */
function batter(input: Batter): { name: string } | ChallengeRefusal {
  if (!isPlayerId(input.playerId)) return { ok: false, status: 400, reason: 'That is not a player.' };
  if (!Number.isInteger(input.avatar) || input.avatar < 0 || input.avatar >= AVATARS) {
    return { ok: false, status: 400, reason: 'Pick one of the kits.' };
  }
  const name = cleanName(input.name);
  if (!name) return { ok: false, status: 400, reason: `A name, up to ${NAME_MAX} characters.` };
  if (nameBlocked(name)) return { ok: false, status: 400, reason: NAME_BLOCKED_REASON };
  return { name };
}

function isRefusal(value: unknown): value is ChallengeRefusal {
  return !!value && typeof value === 'object' && (value as ChallengeRefusal).ok === false;
}

/**
 * A room, made.
 *
 * Usually empty: the host has a link before anybody has batted, which is what
 * lets two friends bat at once. It can also be made from an innings that has
 * just ended — the end card offers that — in which case the host's innings is
 * in from the start and the friend bats second whenever they open it.
 */
export async function createChallenge(
  store: ChallengeStore,
  input: Batter & { card?: unknown; rematchOf?: unknown },
  now = Date.now(),
  random: () => number = Math.random,
): Promise<ChallengeOutcome> {
  if (await store.hits('create', input.address, RATE_WINDOW_SECONDS) > CREATE_LIMIT) {
    return { ok: false, status: 429, reason: 'Too many matches from here. Try again in an hour.' };
  }
  const who = batter(input);
  if (isRefusal(who)) return who;

  let card = '';
  if (input.card !== undefined && input.card !== '') {
    const innings = cleanCard(input.card);
    if (!innings || !ended(figuresOf(innings))) {
      return { ok: false, status: 400, reason: 'That innings could not have happened.' };
    }
    card = innings;
  }
  const rematchOf = cleanCode(input.rematchOf);

  const player: StoredPlayer = { name: who.name, avatar: input.avatar, card, joined: now, at: now };
  for (let attempt = 0; attempt < CODE_TRIES; attempt++) {
    const code = newCode(random);
    const challenge: StoredChallenge = {
      at: now, host: input.playerId, v: SCORING_VERSION, rematchOf, players: { [input.playerId]: player },
    };
    if (await store.claim(code, challenge, CHALLENGE_TTL_SECONDS)) {
      await store.index(input.playerId, code, CHALLENGE_TTL_SECONDS);
      return { ok: true, code, challenge: challengePayload(code, challenge, now) };
    }
  }
  return { ok: false, status: 503, reason: 'Could not make a match just now. Try again.' };
}

/**
 * Somebody opening the link.
 *
 * Idempotent: the same person opening it twice is in the room once. A room
 * takes joiners until it closes or fills, and a finished match still takes one
 * — a third friend forwarded the link can bat against both, which is how a
 * group chat turns one link into a leaderboard.
 */
export async function joinChallenge(
  store: ChallengeStore, code: string, input: Batter, now = Date.now(),
): Promise<ChallengeOutcome> {
  if (await store.hits('write', input.address, RATE_WINDOW_SECONDS) > WRITE_LIMIT) {
    return { ok: false, status: 429, reason: 'Too many requests from here. Try again in an hour.' };
  }
  const found = await load(store, code);
  if (isRefusal(found)) return found;
  const { code: key, challenge } = found;
  const who = batter(input);
  if (isRefusal(who)) return who;

  if (challenge.players[input.playerId]) {
    return { ok: true, code: key, challenge: challengePayload(key, challenge, now) };
  }
  const state = stateOf(challenge, now);
  if (state === 'void') return { ok: false, status: 409, reason: 'This match was made on an older version of the game.' };
  if (state === 'expired') return { ok: false, status: 410, reason: 'This match has closed. Start a fresh one.' };
  if (Object.keys(challenge.players).length >= PLAYERS_MAX) {
    return { ok: false, status: 409, reason: 'This room is full.' };
  }

  const player: StoredPlayer = { name: who.name, avatar: input.avatar, card: '', joined: now, at: now };
  await store.write(key, { players: { [input.playerId]: player } }, CHALLENGE_TTL_SECONDS);
  await store.index(input.playerId, key, CHALLENGE_TTL_SECONDS);
  challenge.players[input.playerId] = player;
  return { ok: true, code: key, challenge: challengePayload(key, challenge, now) };
}

/**
 * A ball, or several. The client sends its whole innings so far every time.
 *
 * The store takes a longer string that begins with the one it holds, and hands
 * back the room unchanged for anything shorter or equal — which is the retry
 * path and the reopened-tab path at once, and both want the room rather than an
 * error. What it refuses is a string that *disagrees* with the one it holds:
 * that is an innings being replayed for a better score, and it is the one cheat
 * worth blocking.
 */
export async function recordBalls(
  store: ChallengeStore, code: string, input: Batter & { card: unknown }, now = Date.now(),
): Promise<ChallengeOutcome> {
  if (await store.hits('write', input.address, RATE_WINDOW_SECONDS) > WRITE_LIMIT) {
    return { ok: false, status: 429, reason: 'Too many requests from here. Try again in an hour.' };
  }
  const found = await load(store, code);
  if (isRefusal(found)) return found;
  const { code: key, challenge } = found;
  if (!isPlayerId(input.playerId)) return { ok: false, status: 400, reason: 'That is not a player.' };
  const held = challenge.players[input.playerId];
  if (!held) return { ok: false, status: 409, reason: 'Join the match before batting in it.' };

  const card = cleanCard(input.card);
  if (card === null) return { ok: false, status: 400, reason: 'That innings could not have happened.' };

  // Nothing new: the same balls again, or fewer. The room as it stands.
  if (card.length <= held.card.length) {
    if (held.card.startsWith(card)) return { ok: true, code: key, challenge: challengePayload(key, challenge, now) };
    return { ok: false, status: 409, reason: 'That innings does not match the one already in.' };
  }
  if (!card.startsWith(held.card)) {
    return { ok: false, status: 409, reason: 'That innings does not match the one already in.' };
  }
  const status = statusOf(held, now);
  if (status === 'done') return { ok: false, status: 409, reason: 'That innings is already over.' };
  if (status === 'forfeit') return { ok: false, status: 409, reason: 'That innings was given up a day ago.' };
  const state = stateOf(challenge, now);
  if (state === 'void') return { ok: false, status: 409, reason: 'This match was made on an older version of the game.' };
  if (state === 'expired') return { ok: false, status: 410, reason: 'This match has closed.' };

  const player: StoredPlayer = { ...held, card, at: now };
  await store.write(key, { players: { [input.playerId]: player } }, CHALLENGE_TTL_SECONDS);
  challenge.players[input.playerId] = player;
  return { ok: true, code: key, challenge: challengePayload(key, challenge, now) };
}

/** The result has been looked at, so the next open need not show it again. */
export async function markSeen(
  store: ChallengeStore, code: string, input: Batter, now = Date.now(),
): Promise<ChallengeOutcome> {
  if (await store.hits('write', input.address, RATE_WINDOW_SECONDS) > WRITE_LIMIT) {
    return { ok: false, status: 429, reason: 'Too many requests from here. Try again in an hour.' };
  }
  const found = await load(store, code);
  if (isRefusal(found)) return found;
  const { code: key, challenge } = found;
  const held = challenge.players[input.playerId];
  if (held && !held.seen) {
    const player: StoredPlayer = { ...held, seen: true };
    await store.write(key, { players: { [input.playerId]: player } }, CHALLENGE_TTL_SECONDS);
    challenge.players[input.playerId] = player;
  }
  return { ok: true, code: key, challenge: challengePayload(key, challenge, now) };
}

/** A room, read. The same answer for everybody, which is why it caches. */
export async function readChallenge(store: ChallengeStore, code: string, now = Date.now()): Promise<ChallengeOutcome> {
  const found = await load(store, code);
  if (isRefusal(found)) return found;
  return { ok: true, code: found.code, challenge: challengePayload(found.code, found.challenge, now) };
}

/**
 * Every room this player is in, newest first.
 *
 * One read per room, and a code that no longer opens anything is dropped from
 * the index as it is found, so a busy player's list does not grow forever.
 */
export async function readMine(
  store: ChallengeStore, playerId: string, now = Date.now(),
): Promise<ChallengeListOutcome | ChallengeRefusal> {
  if (!isPlayerId(playerId)) return { ok: false, status: 400, reason: 'That is not a player.' };
  const codes = (await store.indexed(playerId)).slice(0, PLAYERS_MAX * 2);
  const rooms = await Promise.all(codes.map(async code => {
    const challenge = await store.read(code);
    if (!challenge) { await store.unindex(playerId, code); return null; }
    return challengePayload(code, challenge, now);
  }));
  const challenges = rooms
    .filter((room): room is ChallengePayload => room !== null)
    .sort((a, b) => b.at - a.at)
    .slice(0, PLAYERS_MAX);
  return { ok: true, challenges };
}

/** The code checked and the room behind it, or the refusal to hand back. */
async function load(
  store: ChallengeStore, raw: string,
): Promise<{ code: string; challenge: StoredChallenge } | ChallengeRefusal> {
  const code = cleanCode(raw);
  if (!code) return { ok: false, status: 400, reason: 'That is not a match code.' };
  const challenge = await store.read(code);
  // A room that has gone and a code that was never one are the same thing from
  // here, and are told the same way: there is nothing to open.
  if (!challenge) return { ok: false, status: 404, reason: 'No match under that code. It may have closed.' };
  return { code, challenge };
}

/**
 * The room as the endpoint sends it.
 *
 * Finished innings first, best first. The order inside "best" is runs, then
 * sixes, then fours — and nothing after that, so two innings level on all
 * three sit level, and the client calls it a draw. Wickets deliberately do not
 * count: a reckless forty-seven is the same forty-seven. A forfeited innings
 * ranks under every finished one whatever it made, because walking out is the
 * loss. Then whoever is still batting, then whoever has only opened the link.
 */
export function challengePayload(code: string, challenge: StoredChallenge, now = Date.now()): ChallengePayload {
  const players = Object.entries(challenge.players)
    .map(([playerId, player]) => {
      const figures = figuresOf(player.card);
      const status = statusOf(player, now);
      return {
        ...figures,
        playerId,
        name: player.name,
        avatar: player.avatar,
        card: player.card,
        host: playerId === challenge.host,
        status,
        joined: player.joined,
        at: player.at,
        seen: player.seen === true,
        score: rankOf(status, figures),
      };
    })
    .sort((a, b) => b.score - a.score || a.joined - b.joined);
  return {
    code,
    state: stateOf(challenge, now),
    host: challenge.host,
    at: challenge.at,
    expiresAt: challenge.at + CHALLENGE_LIFE_MS,
    v: challenge.v,
    rematchOf: challenge.rematchOf,
    size: PLAYERS_MAX,
    players,
  };
}

/** The room's order, as one number. See `challengePayload`. */
export function rankOf(status: PlayerStatus, figures: Innings): number {
  const played = figures.runs * 10_000 + figures.sixes * 100 + figures.fours;
  switch (status) {
    case 'done': return 2_000_000_000 + played;
    case 'forfeit': return 1_000_000_000 + played;
    case 'batting': return 500_000_000 + figures.balls;
    default: return 0;
  }
}

/**
 * A card as sent, or null if it is not one.
 *
 * Empty is a card — a player who has joined and not batted — and so is any run
 * of the seven ball characters up to thirty long, provided the innings had not
 * already ended before the last one: three wickets by ball nine and a tenth
 * ball is not an innings this game can bowl.
 */
export function cleanCard(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  if (raw.length > MAX_BALLS) return null;
  if (![...raw].every(char => BALL_CHARS.includes(char))) return null;
  if (raw.length > 1 && ended(figuresOf(raw.slice(0, -1)))) return null;
  return raw;
}

/** The ids this game mints: a base-36 stamp, a dash, and a random tail. */
function isPlayerId(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-z]{6,10}-[0-9a-z]{12,}$/.test(value);
}
