import { packScore, plausible, underway, type Innings } from '../game/leaderboard.js';
import { AVATARS, NAME_MAX, cleanName, foldName } from './board-store.js';

/**
 * A room: a few friends batting at the same time, with one ladder between them.
 *
 * What a room is *not* is a shared innings. Everybody gets their own thirty
 * balls off their own random seed, exactly as they would playing alone — so
 * nothing in the game engine knows this file exists, and nothing here can break
 * an innings played by somebody who never opened a room. The whole feature is
 * one Redis hash and the rules below.
 *
 * Two things are borrowed from the global board rather than restated, and both
 * for the same reason: a second copy would drift. `packScore` puts the room in
 * order, so a room ranks its four the way the fifty are ranked — runs, then
 * sixes, then fours, then wickets, then dots, then who got there first. And
 * `underway`/`plausible` are the floor a submitted figure has to clear.
 *
 * What is deliberately *not* borrowed is the name registry. A name claimed on
 * the board is claimed for good, because letting one go free would let the next
 * person pick up somebody else's reputation. A room lasts two hours. Burning a
 * permanent name on one would mean four friends could cost the board four names
 * every time they played, so a room checks names only against its own members
 * and the global registry is left alone.
 */

/** How many players one room holds. */
export const ROOM_SIZE = 4;
/** How few it can start with. One player in a room is a game of catch. */
export const ROOM_MIN = 2;
/**
 * How long a room lives without being touched. Long enough that a friend can
 * take twenty minutes to read the message and still get in, short enough that
 * abandoned rooms are not a storage bill. Every read and write pushes it out.
 */
export const ROOM_TTL_SECONDS = 7200;

/**
 * The alphabet a code is drawn from: digits and capitals, less the four that
 * get misread aloud or retyped wrong — `0` and `O`, `1` and `I`. A code is
 * meant to be said across a room as much as it is tapped into a link.
 */
export const CODE_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
export const CODE_LENGTH = 4;
/**
 * How many codes are tried before giving up. Thirty-two to the fourth is a
 * million, and a room lives two hours, so a collision needs a great many rooms
 * open at once; five tries is far past the point where that stops being luck
 * and starts being a full keyspace.
 */
const CODE_TRIES = 5;

/**
 * Writes allowed from one address an hour, and rooms made from one an hour.
 *
 * Reads are not counted at all, deliberately. A room is polled every few
 * seconds by every player in it, the answer is the same for all of them, and it
 * is served from the edge cache — so counting reads would cost a Redis command
 * per poll to police the very thing the cache exists to stop costing anything.
 *
 * Creating is the one that makes a new key, so it is the one held down hard.
 */
export const ROOM_CREATE_LIMIT = 30;
export const ROOM_WRITE_LIMIT = 600;
export const ROOM_RATE_WINDOW_SECONDS = 3600;

/** Where a room is in its life. A room that has started can no longer be joined. */
export type RoomState = 'lobby' | 'live' | 'done';

/** One player's place in a room: their running figures, and who they are. */
export type StoredPlayer = Innings & {
  name: string;
  avatar: number;
  /** Whether their innings has ended. Set by the last push, never guessed. */
  done: boolean;
  /** When the store stamped their latest push. Never the browser's clock. */
  at: number;
};

/**
 * A room as it is kept.
 *
 * In Redis this is one hash, which is what makes a whole room one command to
 * read and one to write. `state`, `at` and `host` are its own fields and every
 * other field is a player id holding that player's JSON. The two cannot collide:
 * a player id always carries a dash — `mintPlayerId` builds it that way and
 * `isPlayerId` enforces it — and none of the three reserved names does.
 */
export interface StoredRoom {
  state: RoomState;
  /** When the room was made. */
  at: number;
  /** Whoever made it. The only one who can start the innings. */
  host: string;
  players: Record<string, StoredPlayer>;
}

/** The fields of a room a write may change: its state, its players, or both. */
export interface RoomChange {
  state?: RoomState;
  players?: Record<string, StoredPlayer>;
}

/** Everything a room needs from whatever is keeping it. */
export interface RoomStore {
  /**
   * Takes this code if nobody holds it, and says whether it did. One call rather
   * than a read then a write, or two people making a room in the same second
   * would both be told the code was free and the second would flatten the first.
   */
  claim(code: string, room: StoredRoom, ttlSeconds: number): Promise<boolean>;
  /** The whole room in one read, or null if there is none under that code. */
  read(code: string): Promise<StoredRoom | null>;
  /**
   * Writes these fields and pushes the room's expiry out. Fields left out are
   * left alone: two players finishing an over at the same moment must not
   * overwrite each other, and each only ever names themselves.
   */
  write(code: string, change: RoomChange, ttlSeconds: number): Promise<void>;
  /** How many of this kind of call this address has made in the window, counting this one. */
  hits(kind: 'create' | 'write', address: string, windowSeconds: number): Promise<number>;
}

/** One row of a room's ladder. */
export interface RoomRow extends Innings {
  playerId: string;
  name: string;
  avatar: number;
  done: boolean;
  /** The packed number the row is sorted on, the board's own. */
  score: number;
}

/**
 * What the room endpoint answers with — and it carries nothing about who is
 * asking, for the same reason `GET /api/board` does not: an answer that is the
 * same for everybody can sit in the edge cache, so four players polling every
 * three seconds cost one pair of Redis commands every couple of seconds rather
 * than four of them a second. Each player finds their own row by player id.
 */
export interface RoomPayload {
  code: string;
  state: RoomState;
  host: string;
  size: number;
  /** Best first. Mid-innings the order is provisional; at the end it is the result. */
  players: RoomRow[];
}

/** A call the room took. */
export interface RoomAccepted {
  ok: true;
  code: string;
  room: RoomPayload;
}

/** A call it turned down, and what to tell the player. */
export interface RoomRefusal {
  ok: false;
  status: number;
  reason: string;
}

/**
 * Both halves are named rather than written inline, and `roomRefused` below is a
 * real type predicate rather than an `if (!outcome.ok)` that leans on inference.
 * TypeScript only narrows a `true | false` discriminant under `strictNullChecks`,
 * and `api/` is built by a compiler this repository does not configure — the
 * board's own union not narrowing there failed three deployments while
 * `tsc --noEmit` passed every time locally. See `refused` in `board-store.ts`.
 */
export type RoomOutcome = RoomAccepted | RoomRefusal;

/** Whether the room turned this call down. */
export function roomRefused(outcome: RoomOutcome): outcome is RoomRefusal {
  return !outcome.ok;
}

/** Who is making the call. `address` is used to rate limit and never as identity. */
export interface RoomCaller {
  playerId: string;
  name: string;
  avatar: number;
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
 * Lower case is raised, because somebody reading `K7QP` off a phone screen types
 * `k7qp`. Nothing else is repaired: a character outside the alphabet means the
 * code was misheard or the link was mangled, and which real character was meant
 * is a guess. A room opened by a guess is somebody else's room, so a code that
 * does not read cleanly is refused rather than approximated.
 */
export function cleanCode(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const code = raw.trim().toUpperCase();
  if (code.length !== CODE_LENGTH) return null;
  return [...code].every(char => CODE_ALPHABET.includes(char)) ? code : null;
}

/** An innings that has not started: what a player's row holds on joining. */
const NO_INNINGS: Innings = { runs: 0, sixes: 0, fours: 0, wickets: 0, dots: 0, balls: 0 };

/** The six figures alone, so a stored row never carries a field nobody ranks on. */
function figures(from: Innings): Innings {
  return {
    runs: from.runs, sixes: from.sixes, fours: from.fours,
    wickets: from.wickets, dots: from.dots, balls: from.balls,
  };
}

/** The checks every call shares: a real player, a kit that exists, a usable name. */
function caller(input: RoomCaller): { name: string } | RoomRefusal {
  if (!isPlayerId(input.playerId)) return { ok: false, status: 400, reason: 'That is not a player.' };
  if (!Number.isInteger(input.avatar) || input.avatar < 0 || input.avatar >= AVATARS) {
    return { ok: false, status: 400, reason: 'Pick one of the kits.' };
  }
  const name = cleanName(input.name);
  if (!name) return { ok: false, status: 400, reason: `A name, up to ${NAME_MAX} characters.` };
  return { name };
}

function isRefusal(value: unknown): value is RoomRefusal {
  return !!value && typeof value === 'object' && (value as RoomRefusal).ok === false;
}

/**
 * A new room, with its maker in it.
 *
 * The code is drawn rather than counted up, and claimed with a set-if-absent, so
 * two rooms made in the same second cannot land on one key. A draw that collides
 * is simply redrawn; a keyspace so full that five draws all collide is a
 * different problem and says so rather than looping.
 */
export async function createRoom(
  store: RoomStore, input: RoomCaller, now = Date.now(), random: () => number = Math.random,
): Promise<RoomOutcome> {
  if (await store.hits('create', input.address, ROOM_RATE_WINDOW_SECONDS) > ROOM_CREATE_LIMIT) {
    return { ok: false, status: 429, reason: 'Too many rooms from here. Try again in an hour.' };
  }
  const who = caller(input);
  if (isRefusal(who)) return who;

  const player: StoredPlayer = { ...NO_INNINGS, name: who.name, avatar: input.avatar, done: false, at: now };
  for (let attempt = 0; attempt < CODE_TRIES; attempt++) {
    const code = newCode(random);
    const room: StoredRoom = {
      state: 'lobby', at: now, host: input.playerId, players: { [input.playerId]: player },
    };
    if (await store.claim(code, room, ROOM_TTL_SECONDS)) return { ok: true, code, room: roomPayload(code, room) };
  }
  return { ok: false, status: 503, reason: 'Could not make a room just now. Try again.' };
}

/**
 * A player into a room.
 *
 * Joining twice is the same as joining once, and has to be: a reload, a dropped
 * connection or a tapped link opened again all arrive here, and treating the
 * second one as a new player would fill a four-person room with one person and
 * lose the innings they had already played. So a player already in the room
 * keeps their figures and only their name and kit are taken again.
 */
export async function joinRoom(
  store: RoomStore, code: string, input: RoomCaller, now = Date.now(),
): Promise<RoomOutcome> {
  if (await store.hits('write', input.address, ROOM_RATE_WINDOW_SECONDS) > ROOM_WRITE_LIMIT) {
    return { ok: false, status: 429, reason: 'Too many requests from here. Try again in an hour.' };
  }
  const found = await load(store, code);
  if (isRefusal(found)) return found;
  const { code: key, room } = found;
  const who = caller(input);
  if (isRefusal(who)) return who;

  const held = room.players[input.playerId];
  // A room that has started is closed: everybody's five overs begin together, so
  // walking in halfway would be joining a race a minute after the gun.
  if (!held && room.state !== 'lobby') {
    return { ok: false, status: 409, reason: 'That game has already started.' };
  }
  if (!held && Object.keys(room.players).length >= ROOM_SIZE) {
    return { ok: false, status: 409, reason: `That room is full — ${ROOM_SIZE} players is the most.` };
  }
  // Names are checked against this room and nowhere else. Two Rohits on one
  // ladder is unreadable; a Rohit in this room and another in somebody else's is
  // nobody's business.
  const folded = foldName(who.name);
  const clash = Object.entries(room.players)
    .some(([id, player]) => id !== input.playerId && foldName(player.name) === folded);
  if (clash) return { ok: false, status: 409, reason: 'Somebody in this room already bats under that name.' };

  const player: StoredPlayer = held
    ? { ...held, name: who.name, avatar: input.avatar }
    : { ...NO_INNINGS, name: who.name, avatar: input.avatar, done: false, at: now };
  await store.write(key, { players: { [input.playerId]: player } }, ROOM_TTL_SECONDS);
  room.players[input.playerId] = player;
  return { ok: true, code: key, room: roomPayload(key, room) };
}

/** The host starting the innings. Nobody else can, and not with one player. */
export async function startRoom(
  store: RoomStore, code: string, playerId: string, address: string,
): Promise<RoomOutcome> {
  if (await store.hits('write', address, ROOM_RATE_WINDOW_SECONDS) > ROOM_WRITE_LIMIT) {
    return { ok: false, status: 429, reason: 'Too many requests from here. Try again in an hour.' };
  }
  const found = await load(store, code);
  if (isRefusal(found)) return found;
  const { code: key, room } = found;
  if (room.host !== playerId) return { ok: false, status: 403, reason: 'Only whoever made the room can start it.' };
  if (room.state !== 'lobby') return { ok: false, status: 409, reason: 'That game has already started.' };
  if (Object.keys(room.players).length < ROOM_MIN) {
    return { ok: false, status: 409, reason: `Wait for ${ROOM_MIN} players.` };
  }
  await store.write(key, { state: 'live' }, ROOM_TTL_SECONDS);
  room.state = 'live';
  return { ok: true, code: key, room: roomPayload(key, room) };
}

/** A running score, and whether that was the last ball of it. */
export interface InningsPush {
  innings: Innings;
  done: boolean;
}

/**
 * A player's score, pushed as their innings runs.
 *
 * Three things are checked beyond the arithmetic, and each of them is a way the
 * ladder could otherwise be made to lie. A score may not go backwards, because a
 * request that set out before the last one and arrived after it would otherwise
 * undo an over. A player who has finished may not push again, because the ladder
 * is settled the moment the last innings ends. And a claim to have finished has
 * to clear `plausible` rather than `underway` — the innings ends at thirty balls
 * or three wickets and nowhere else, so a final figure of twelve balls is not a
 * result, whatever it adds up to.
 */
export async function pushInnings(
  store: RoomStore, code: string, input: RoomCaller & InningsPush, now = Date.now(),
): Promise<RoomOutcome> {
  if (await store.hits('write', input.address, ROOM_RATE_WINDOW_SECONDS) > ROOM_WRITE_LIMIT) {
    return { ok: false, status: 429, reason: 'Too many requests from here. Try again in an hour.' };
  }
  const found = await load(store, code);
  if (isRefusal(found)) return found;
  const { code: key, room } = found;

  const held = room.players[input.playerId];
  if (!held) return { ok: false, status: 403, reason: 'You are not in that room.' };
  if (room.state === 'lobby') return { ok: false, status: 409, reason: 'That game has not started.' };
  if (held.done) return { ok: false, status: 409, reason: 'Your innings is already in.' };

  const offered = figures(input.innings);
  // The floor the global board uses, asked of a score that is still being made.
  if (!underway(offered)) return { ok: false, status: 400, reason: 'That innings could not have happened.' };
  // And the whole of it, once the innings is said to be over.
  if (input.done && !plausible(offered)) {
    return { ok: false, status: 400, reason: 'That innings could not have ended there.' };
  }
  if (offered.balls < held.balls) return { ok: false, status: 409, reason: 'That score is older than the one already in.' };

  const player: StoredPlayer = { ...offered, name: held.name, avatar: held.avatar, done: input.done, at: now };
  const players = { ...room.players, [input.playerId]: player };
  // The room is over when the last innings is, and that is worked out here rather
  // than asked for: a browser that closed on the final ball must not be what
  // decides whether everybody else sees a result.
  const ending = Object.values(players).every(one => one.done);
  const change: RoomChange = { players: { [input.playerId]: player } };
  if (ending && room.state !== 'done') change.state = 'done';
  await store.write(key, change, ROOM_TTL_SECONDS);

  room.players = players;
  if (change.state) room.state = change.state;
  return { ok: true, code: key, room: roomPayload(key, room) };
}

/** A room, read. The answer every player in it gets, which is why it is cacheable. */
export async function readRoom(store: RoomStore, code: string): Promise<RoomOutcome> {
  const found = await load(store, code);
  if (isRefusal(found)) return found;
  return { ok: true, code: found.code, room: roomPayload(found.code, found.room) };
}

/** The code checked and the room behind it, or the refusal to hand back. */
async function load(
  store: RoomStore, raw: string,
): Promise<{ code: string; room: StoredRoom } | RoomRefusal> {
  const code = cleanCode(raw);
  if (!code) return { ok: false, status: 400, reason: 'That is not a room code.' };
  const room = await store.read(code);
  // A room that has expired and a code that was never a room are the same thing
  // from here, and are told the same way: there is nothing to join.
  if (!room) return { ok: false, status: 404, reason: 'No room under that code. It may have expired.' };
  return { code, room };
}

/**
 * The room in ladder order.
 *
 * `packScore` is the board's own, so a room ranks its four exactly as the fifty
 * are ranked, down to the tiebreak: identical figures are split by whose stamp
 * is earlier, which in a room means whoever got there first. Mid-innings that
 * order is provisional and says so in the type's comment — a player three balls
 * in has avoided twenty-seven dots and will drift down as they use them up.
 */
export function roomPayload(code: string, room: StoredRoom): RoomPayload {
  const players = Object.entries(room.players)
    .map(([playerId, player]) => ({
      ...figures(player),
      playerId,
      name: player.name,
      avatar: player.avatar,
      done: player.done,
      score: packScore(player, player.at),
    }))
    .sort((a, b) => b.score - a.score);
  return { code, state: room.state, host: room.host, size: ROOM_SIZE, players };
}

/** The ids this game mints: a base-36 stamp, a dash, and a random tail. */
function isPlayerId(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-z]{6,10}-[0-9a-z]{12,}$/.test(value);
}
