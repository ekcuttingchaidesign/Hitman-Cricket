import { packScore, type Innings } from '../game/leaderboard.js';
import { completedInnings } from '../game/ball-string.js';
import { AVATARS, NAME_MAX, cleanName } from './board-store.js';

/**
 * A challenge: one finished innings, shared as a link, answered by one friend.
 *
 * It is not a room and nobody waits. The challenger bats their thirty balls,
 * the innings becomes a code, and whoever opens the link bats their own thirty
 * whenever they get round to it — tonight, or on Thursday. The result exists the
 * moment the second innings ends.
 *
 * Two players, deliberately. Four made sense while everyone was batting at once;
 * once they are not, a third and fourth person are each just another private
 * duel against the same recorded innings, and a table of four people who never
 * met is a worse thing to look at than a scoreline between two who did.
 *
 * What the challenger sent is stored as thirty characters and nothing else —
 * see `ball-string.ts`. The figures are worked out from those characters here,
 * on the way in, so a client never states its own score: it states what happened
 * ball by ball and is told what that was worth.
 *
 * Two things are borrowed from the board rather than restated, because a second
 * copy would drift: `packScore` puts the two innings in order, so a challenge is
 * decided on the same ladder the fifty are ranked on, and `cleanName` is the
 * same name cleaning. What is deliberately *not* borrowed is the permanent name
 * registry — a challenge lasts a week, and burning a forever-name on one would
 * cost the board a name every time two friends played.
 */

/** How many innings one challenge holds: the challenger's, and one answer. */
export const OPPONENTS = 1;

/**
 * How long a challenge lives. The whole premise is that the friend was busy and
 * played in the evening — or on Wednesday — so this is a week rather than the
 * couple of hours a play-together room wanted.
 */
export const CHALLENGE_TTL_SECONDS = 7 * 24 * 60 * 60;

/**
 * The alphabet a code is drawn from: digits and capitals, less the four that get
 * misread aloud or retyped wrong — `0` and `O`, `1` and `I`.
 */
export const CODE_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

/**
 * Six characters, not four.
 *
 * Four would be a million codes, and a challenge now lives for a week rather
 * than two hours, with reads deliberately uncounted so that polling stays free.
 * A million live-for-a-week codes and no read limit is a keyspace somebody can
 * simply walk, and what they would find is other people's names. Six is a
 * billion, which is not walkable, and still reads aloud in one breath.
 */
export const CODE_LENGTH = 6;

/** How many codes are tried before giving up. A billion makes five plenty. */
const CODE_TRIES = 5;

/**
 * Challenges made from one address an hour, and writes from one an hour.
 *
 * Reads are not counted at all, deliberately: a challenge read is the same
 * answer for everybody who holds the link and is served from the edge cache, so
 * counting them would spend a database command per read to police the very thing
 * the cache exists to make free. Creating is what makes keys, so it is the one
 * held down hard.
 */
export const CREATE_LIMIT = 30;
export const WRITE_LIMIT = 600;
export const RATE_WINDOW_SECONDS = 3600;

/** Where a challenge is in its life. Derived, never stored — see `stateOf`. */
export type ChallengeState = 'open' | 'answered';

/**
 * One innings as it is kept: who batted it, and the thirty characters.
 *
 * The figures are not here. They are worked out from `balls` every time they are
 * needed, which is what stops a stored score and a stored innings ever being two
 * different things.
 */
export interface StoredPlayer {
  name: string;
  avatar: number;
  /** The innings, one character per ball. See `ball-string.ts`. */
  card: string;
  /** When the store stamped it. Never a browser's clock: it settles ties. */
  at: number;
}

/**
 * A challenge as it is kept.
 *
 * In Redis this is one hash, which is what makes a whole challenge one command
 * to read and one to write. `at` and `host` are its own fields and every other
 * field is a player id holding that player's innings. The two cannot collide: a
 * player id always carries a dash and neither reserved name does.
 */
export interface StoredChallenge {
  at: number;
  /** Whoever set it. They cannot answer their own. */
  host: string;
  players: Record<string, StoredPlayer>;
}

/** The fields of a challenge a write may change. Only ever one player's innings. */
export interface ChallengeChange {
  players?: Record<string, StoredPlayer>;
}

/** Everything a challenge needs from whatever is keeping it. */
export interface ChallengeStore {
  /**
   * Takes this code if nobody holds it, and says whether it did. One call rather
   * than a read then a write, or two challenges made in the same second would
   * both be told the code was free and the second would flatten the first.
   */
  claim(code: string, challenge: StoredChallenge, ttlSeconds: number): Promise<boolean>;
  /** The whole challenge in one read, or null if there is none under that code. */
  read(code: string): Promise<StoredChallenge | null>;
  /** Writes these fields and pushes the expiry out. Fields left out are left alone. */
  write(code: string, change: ChallengeChange, ttlSeconds: number): Promise<void>;
  /** How many of this kind of call this address has made in the window, counting this one. */
  hits(kind: 'create' | 'write', address: string, windowSeconds: number): Promise<number>;
}

/** One innings on the scoreline. */
export interface ChallengeRow extends Innings {
  playerId: string;
  name: string;
  avatar: number;
  /** The innings itself, ball by ball. The opponent's copy of this is the ghost. */
  card: string;
  /** Whether this is the innings the challenge was built from. */
  challenger: boolean;
  /** The packed number the row is sorted on — the board's own. */
  score: number;
}

/**
 * What the endpoint answers with, and it carries nothing about who is asking.
 *
 * That is what lets it sit in the edge cache: everyone holding the link gets the
 * same bytes, and each client finds its own row by player id. It does carry the
 * challenger's `balls`, because that string *is* the ghost the opponent bats
 * against — so the score is in the response from the first ball, and keeping it
 * off the screen until the thirtieth is the client's job, not the wire's. That
 * is a deliberate trade and not an oversight: a per-ball reveal leaks the total
 * to anyone counting anyway.
 */
export interface ChallengePayload {
  code: string;
  state: ChallengeState;
  /** The challenger's player id, so a client knows which row set it. */
  host: string;
  /** How many innings this challenge holds in total, the challenger's included. */
  size: number;
  /** Best first. Two rows once answered, one before that. */
  players: ChallengeRow[];
}

/** A call the challenge took. */
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

/** Whether the challenge turned this call down. */
export function challengeRefused(outcome: ChallengeOutcome): outcome is ChallengeRefusal {
  return !outcome.ok;
}

/** Who is calling, and the innings they bring. */
export interface Batter {
  playerId: string;
  name: string;
  avatar: number;
  /** Whoever the edge says is asking. Used to rate limit, never as identity. */
  address: string;
  /** The innings, one character per ball, as it arrived. Checked in the store. */
  card: unknown;
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
 * is a guess. A challenge opened by a guess is somebody else's challenge.
 */
export function cleanCode(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const code = raw.trim().toUpperCase();
  if (code.length !== CODE_LENGTH) return null;
  return [...code].every(char => CODE_ALPHABET.includes(char)) ? code : null;
}

/** Whether anybody has answered. Derived from the innings themselves, never stored. */
export function stateOf(challenge: StoredChallenge): ChallengeState {
  return Object.keys(challenge.players).some(id => id !== challenge.host) ? 'answered' : 'open';
}

/** The checks every call shares: a real player, a kit that exists, a usable name. */
function batter(input: Batter): { name: string } | ChallengeRefusal {
  if (!isPlayerId(input.playerId)) return { ok: false, status: 400, reason: 'That is not a player.' };
  if (!Number.isInteger(input.avatar) || input.avatar < 0 || input.avatar >= AVATARS) {
    return { ok: false, status: 400, reason: 'Pick one of the kits.' };
  }
  const name = cleanName(input.name);
  if (!name) return { ok: false, status: 400, reason: `A name, up to ${NAME_MAX} characters.` };
  return { name };
}

function isRefusal(value: unknown): value is ChallengeRefusal {
  return !!value && typeof value === 'object' && (value as ChallengeRefusal).ok === false;
}

/**
 * A challenge, made from a finished innings.
 *
 * There is no such thing as a half-made one: the innings has to be over before a
 * code exists, which is what removes every "waiting for the other player" state
 * this feature could otherwise have had.
 */
export async function createChallenge(
  store: ChallengeStore, input: Batter, now = Date.now(), random: () => number = Math.random,
): Promise<ChallengeOutcome> {
  if (await store.hits('create', input.address, RATE_WINDOW_SECONDS) > CREATE_LIMIT) {
    return { ok: false, status: 429, reason: 'Too many challenges from here. Try again in an hour.' };
  }
  const who = batter(input);
  if (isRefusal(who)) return who;
  const innings = completedInnings(input.card);
  if (!innings) return { ok: false, status: 400, reason: 'That innings could not have happened.' };

  const player: StoredPlayer = { name: who.name, avatar: input.avatar, card: innings.balls, at: now };
  for (let attempt = 0; attempt < CODE_TRIES; attempt++) {
    const code = newCode(random);
    const challenge: StoredChallenge = { at: now, host: input.playerId, players: { [input.playerId]: player } };
    if (await store.claim(code, challenge, CHALLENGE_TTL_SECONDS)) {
      return { ok: true, code, challenge: challengePayload(code, challenge) };
    }
  }
  return { ok: false, status: 503, reason: 'Could not make a challenge just now. Try again.' };
}

/**
 * An answer to a challenge.
 *
 * Idempotent, and it has to be: a submission whose response was lost is retried
 * by a browser that has just finished thirty balls, and the one thing that must
 * never happen is that the retry is refused and the innings is gone. A player
 * who has already answered is handed the result they already have.
 */
export async function answerChallenge(
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

  // Answering your own challenge is the one thing a challenger cannot do. It is
  // not a failure worth a scary message — the screen makes a joke of it — but it
  // is a refusal, because a scoreline against yourself is not a result.
  if (challenge.host === input.playerId) {
    return { ok: false, status: 409, reason: 'You cannot chase yourself.' };
  }

  // Already answered by this player: hand back what they already have. This is
  // the retry path and the reopened-link path at once, and both want the result
  // rather than an error.
  if (challenge.players[input.playerId]) {
    return { ok: true, code: key, challenge: challengePayload(key, challenge) };
  }

  // Answered by somebody else. Two innings is the whole challenge, so a second
  // friend opening the same link has arrived too late.
  if (stateOf(challenge) === 'answered') {
    return { ok: false, status: 409, reason: 'Somebody has already answered this one.' };
  }

  const innings = completedInnings(input.card);
  if (!innings) return { ok: false, status: 400, reason: 'That innings could not have happened.' };

  const player: StoredPlayer = { name: who.name, avatar: input.avatar, card: innings.balls, at: now };
  await store.write(key, { players: { [input.playerId]: player } }, CHALLENGE_TTL_SECONDS);
  challenge.players[input.playerId] = player;
  return { ok: true, code: key, challenge: challengePayload(key, challenge) };
}

/** A challenge, read. The same answer for everybody, which is why it caches. */
export async function readChallenge(store: ChallengeStore, code: string): Promise<ChallengeOutcome> {
  const found = await load(store, code);
  if (isRefusal(found)) return found;
  return { ok: true, code: found.code, challenge: challengePayload(found.code, found.challenge) };
}

/** The code checked and the challenge behind it, or the refusal to hand back. */
async function load(
  store: ChallengeStore, raw: string,
): Promise<{ code: string; challenge: StoredChallenge } | ChallengeRefusal> {
  const code = cleanCode(raw);
  if (!code) return { ok: false, status: 400, reason: 'That is not a challenge code.' };
  const challenge = await store.read(code);
  // A challenge that has expired and a code that was never one are the same
  // thing from here, and are told the same way: there is nothing to chase.
  if (!challenge) return { ok: false, status: 404, reason: 'No challenge under that code. It may have closed.' };
  return { code, challenge };
}

/**
 * The scoreline, best first.
 *
 * `packScore` is the board's own, so a challenge is decided the way the fifty
 * are ranked — runs, then sixes, then fours, then wickets, then dots, then whose
 * stamp is earlier. That last step is what hands a dead-level challenge to the
 * challenger: they batted first, so their stamp is earlier, so the chaser had to
 * beat the score rather than match it. It costs no code and it is the right rule.
 */
export function challengePayload(code: string, challenge: StoredChallenge): ChallengePayload {
  const players = Object.entries(challenge.players)
    .map(([playerId, player]) => ({
      ...completedFigures(player.card),
      playerId,
      name: player.name,
      avatar: player.avatar,
      card: player.card,
      challenger: playerId === challenge.host,
      score: packScore(completedFigures(player.card), player.at),
    }))
    .sort((a, b) => b.score - a.score);
  return { code, state: stateOf(challenge), host: challenge.host, size: OPPONENTS + 1, players };
}

/** The six figures of a stored innings. Worked out, never read off a field. */
function completedFigures(card: string): Innings {
  return completedInnings(card)?.figures
    // A stored innings was checked on the way in, so this cannot happen — but a
    // row that somehow held junk should read as a duck rather than throw and
    // take the whole scoreline down with it.
    ?? { runs: 0, sixes: 0, fours: 0, wickets: 0, dots: 0, balls: 0 };
}

/** The ids this game mints: a base-36 stamp, a dash, and a random tail. */
function isPlayerId(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-z]{6,10}-[0-9a-z]{12,}$/.test(value);
}
