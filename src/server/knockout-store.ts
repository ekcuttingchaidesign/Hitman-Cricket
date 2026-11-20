import { AVATARS, NAME_MAX, cleanName, isPlayerId } from './board-store.js';
import { HOW_MAX, HOWS_TOLD } from '../game/ball-how.js';
import { NAME_BLOCKED_REASON, nameBlocked } from './name-filter.js';
import { handleOf, isHandle } from '../game/handle.js';
import { MATCH_CODE_ALPHABET, MATCH_CODE_LENGTH, MATCH_SEATS, cleanMatchCode, namesOf } from '../game/match-code.js';
import { LIVE_RULES, PREVIEW_RULES, worthOf, type PointsRules } from '../game/knockout-points.js';
import { creditMatch, type KnockoutLedger } from './knockout-ledger.js';
import { resultOf, type MatchResult } from './knockout-result.js';

export { MATCH_CODE_ALPHABET, MATCH_CODE_LENGTH, MATCH_SEATS, cleanMatchCode, namesOf };

/**
 * Super Knockout with friends: a match a player hosts, a code their friends
 * type in, a lobby, and then everybody batting the same balls at their own
 * pace, held together at the end of every over (Figma Battle Royale page,
 * section 53, "real rooms, end to end").
 *
 * The store keeps only what the phones cannot agree on by themselves: who is
 * in, who hosts, when it started and in what order the seats are, and each
 * player's balls. Everything else — the subs in the empty seats, the cuts, the
 * free hits, who won — every phone works out for itself from the match's seed
 * and those balls, through the one engine (`game/knockout.ts`), so all twelve
 * come to the same answer without anybody being asked for it.
 *
 * Every ball is a field of its own, written only if it is not there yet
 * (`setOnce`, HSETNX in Redis). That is what makes a stalled player safe to
 * replace: the sub's balls are written into the same fields the same way, so
 * whichever of the two reaches a ball first owns it, and every phone reads the
 * same answer. Nothing is ever rewritten, so a phone that has already counted
 * a ball can never be told later that it was something else.
 *
 * Nothing in an answer is a player id. A match is read by its code by anybody
 * holding the link, so the members come back by handle (`game/handle.ts`), as
 * every board row does, and a browser finds itself by hashing its own id.
 *
 * Who won is the one thing the store does not leave to the phones. When a
 * match is over it plays the room back itself from the same seed and cards
 * (`knockout-result.ts`), keeps the result, and pays its points once
 * (`knockout-ledger.ts`): a phone can say a match is over, never how it ended.
 */

/**
 * How many real players a match needs before it pays. Production's are the
 * game's own; a preview and the dev server pay from two, on their own keys, so
 * a phone and a computer are enough to see points land.
 */
export const POINTS_RULES: PointsRules = typeof process !== 'undefined' && process.env?.VERCEL_ENV === 'production' ? LIVE_RULES : PREVIEW_RULES;

/** How long a match is kept: an evening, comfortably. Every write pushes it out again. */
export const MATCH_TTL_SECONDS = 6 * 3600;
/** From START NOW to the walk-out: the three seconds every phone counts together (3B). */
export const START_IN_MS = 3500;
/**
 * A player who has not been heard from for this long, with balls still to bat
 * in an over the room is waiting on, is away: a sub bats out the rest of their
 * over (4B). Their phone checks in every few seconds while they bat.
 */
export const AWAY_MS = 20_000;
/**
 * A player still checking in who has sent no ball for this long while the
 * room waits on them is stuck — a page whose game stopped, or balls lost on
 * the way — and is treated as away too, so one phone can never hold the
 * others at the over's end for good. A real ball takes a few seconds.
 */
export const STALL_MS = 90_000;
/** The balls in a match: five overs. */
export const MATCH_BALLS = 30;
export const OVER_BALLS = 6;
/** What a ball is written as: its runs, a wicket, or a sub's ball (`S`) where the player was away. */
export const MATCH_BALL_CHARS = '012346WS';
/** Removed twice, a player stays out until the match closes (2E). */
const REMOVALS_KEPT_OUT = 2;
/** Invites one member can send in one match. */
export const INVITES_MAX = 30;
/** An invite is offered for this long: after it the match it was for has long since been played. */
export const INVITE_FRESH_MS = 30 * 60_000;
export const CREATE_LIMIT = 30;
export const WRITE_LIMIT = 4000;
export const RATE_WINDOW_SECONDS = 3600;
const CODE_TRIES = 6;

export type MatchState = 'lobby' | 'live';

/** What somebody watching a match can send the batter they are watching (section 51's tray). */
export const REACTIONS = ['😂', '🔥', '👏', '😱', '🦆'] as const;
/** A reaction is news for this long: every phone it is for shows it once, and one that opens later never sees it. */
export const REACTION_FRESH_MS = 20_000;
/** A nudge from the host to somebody not ready, at most this often for each of them. */
export const NUDGE_GAP_MS = 10_000;
/** One a watcher at most this often. */
export const REACTION_GAP_MS = 350;
/** What a how is kept behind, under `h:<round>:<player>:<ball>`: a store that reads JSON back as an object leaves it a string. */
const HOW_MARK = '~';

/** One reaction as kept, under `rx:<round>:<when>:<who>`. */
export interface StoredReaction { to: string; by: string; from: string; face: number; e: number; at: number }
/** One reaction as any browser may be told: who it is for by handle, who sent it by name. */
export interface MatchReaction { id: string; to: string; by: string; from: string; face: number; emoji: string; at: number }

/** One member as kept, under `m:<playerId>`. */
export interface StoredMember {
  name: string;
  avatar: number;
  joined: number;
  ready: boolean;
  /** Last heard from: any write, and a check-in every few seconds while batting. */
  seen: number;
  /** Left a match that had started: ran away (5A). */
  left?: boolean;
  /** When their last ball was written. */
  ballAt?: number;
  /** The round they went back to the room from, having batted in it (BACK TO ROOM). */
  back?: number;
  /** When they last sent a reaction. */
  rxAt?: number;
}

/** The start, written once by the host: when everybody walks out, and the seats in order. */
export interface StoredStart { at: number; seats: string[]; round: number }

/** An invite, kept in the invited player's list (`koinv:<playerId>`) until the match starts. */
export interface StoredMatchInvite { by: string; byAvatar: number; at: number }

/** A match as read: everything in its hash, picked apart. */
export interface StoredMatch {
  host: string;
  at: number;
  seed: number;
  members: Record<string, StoredMember>;
  removed: Record<string, number>;
  start: StoredStart | null;
  /**
   * Which match of the room this is, from 1. A room outlives its matches: when
   * one is over the room goes back to its lobby under the same code and the
   * next is a round on (`settleMatch`). Balls are filed under their round, so
   * one that lands late from the round before can never be read as this one's.
   */
  round: number;
  /** The round somebody's phone has said is over (`doneMatch`): the room's result is in. */
  over: number;
  /** Every ball written this round, by player id and ball. */
  balls: Record<string, Record<number, string>>;
  /** How each of those balls was played, as its phone told it (`ball-how.ts`): for the picture a watcher is shown, and read by nothing else. */
  hows: Record<string, Record<number, string>>;
  /** Who has been asked in, by handle. */
  invited: Record<string, StoredMatchInvite>;
  /** Reactions sent this round, by their field. */
  reactions: Record<string, StoredReaction>;
  /** When the host last nudged each member, by player id (a field of its own each, so it never writes over their ready). */
  nudged: Record<string, number>;
  /** The last result the store worked out for this room (`res`): this round's once it is over, the round before's in the lobby. */
  result: MatchResult | null;
}

export interface KnockoutStore {
  /** Makes a match on a fresh code: false if the code is taken. */
  claim(code: string, fields: Record<string, unknown>, ttlSeconds: number): Promise<boolean>;
  read(code: string): Promise<Record<string, unknown> | null>;
  set(code: string, fields: Record<string, unknown>, ttlSeconds: number): Promise<void>;
  /** Writes one field only if it is not there yet; true if this call wrote it. */
  setOnce(code: string, field: string, value: unknown): Promise<boolean>;
  drop(code: string, fields: string[]): Promise<void>;
  /** Fields dropped and others set, in one step. */
  swap(code: string, fields: Record<string, unknown>, drop: string[], ttlSeconds: number): Promise<void>;
  hits(kind: string, address: string, windowSeconds: number): Promise<number>;
  invite(playerId: string, code: string, invite: StoredMatchInvite, ttlSeconds: number): Promise<void>;
  invites(playerId: string): Promise<Record<string, StoredMatchInvite>>;
  uninvite(playerId: string, code: string): Promise<void>;
  /** Handle to player id, as the profiles keep it. */
  idOf(handle: string): Promise<string | null>;
}

/** One member as any browser may be told. */
export interface MatchMember {
  handle: string;
  name: string;
  avatar: number;
  joined: number;
  ready: boolean;
  host: boolean;
  /** Their seat once the match has started, 0 to 11; null in the lobby or for a member who joined too late. */
  seat: number | null;
  /** Their balls so far, one character each, in order. */
  card: string;
  /** How their latest balls were played (`ball-how.ts`), from the ball at `from` on; null where their phone told none. */
  hows: { from: number; list: string[] } | null;
  /** How long since they were heard from, by the store's clock. */
  quiet: number;
  /** How long since their last ball (or the walk-out, before one), by the store's clock; 0 in the lobby. */
  idle: number;
  left: boolean;
  /** Batting in the match being played: seated, not gone back to the room, and the match not over. */
  playing: boolean;
  /** Back in the room from the match being played (BACK TO ROOM). */
  back: boolean;
  /** When the host last nudged them to say I'M READY, by the store's clock; 0 for never. */
  nudged: number;
}

export interface MatchView {
  code: string;
  state: MatchState;
  at: number;
  seed: number;
  host: string;
  /** When everybody walks out, once the host has started it. */
  startAt: number | null;
  /** Seat order once started, by handle; the rest of the twelve are subs. */
  seats: string[];
  members: MatchMember[];
  /** Who has been asked in and not yet come, by handle. */
  invited: string[];
  /** Which match of the room this is, from 1. */
  round: number;
  /** The match being played is over: its result is in. */
  over: boolean;
  /** How many are still batting it and being heard from: the room's next match waits for none. */
  busy: number;
  /** Reactions of the last few seconds, oldest first: each phone shows the ones for its player, or for whoever it watches. */
  reactions: MatchReaction[];
  /**
   * What first, second and third are worth as the room stands: by who is in it in the lobby, by who was seated once it
   * has started. All nothing where it is practice (too few real players).
   */
  worth: [number, number, number];
  /** How many real players a match needs before it pays at all. */
  pointsFrom: number;
  /** The last result the store worked out for this room: this round's once the match is over, the round before's in the lobby. */
  result: MatchResult | null;
  /** The store's clock, so every phone counts the walk-out to the same moment. */
  now: number;
}

export interface MatchAccepted { ok: true; match: MatchView }
export interface MatchInvitesAccepted { ok: true; invites: MatchInviteView[] }
export interface MatchInviteView { code: string; by: string; byAvatar: number; at: number; size: number }
export interface MatchRefusal { ok: false; status: number; reason: string }
export type MatchOutcome = MatchAccepted | MatchRefusal;

export function matchRefused(outcome: unknown): outcome is MatchRefusal {
  return !!outcome && typeof outcome === 'object' && (outcome as MatchRefusal).ok === false;
}

/** Who is calling. */
export interface Member { playerId: string; name: unknown; avatar: unknown; address: string }

export const NO_MATCH = 'No match with that code.';
export const MATCH_FULL = 'This match is full.';
export const MATCH_UNDERWAY = 'This match has started.';
export const MATCH_OVER = 'That match is over.';

export function newMatchCode(random: () => number = Math.random): string {
  let code = '';
  for (let i = 0; i < MATCH_CODE_LENGTH; i++) code += MATCH_CODE_ALPHABET[Math.floor(random() * MATCH_CODE_ALPHABET.length)];
  return code;
}


function refuse(status: number, reason: string): MatchRefusal { return { ok: false, status, reason }; }

/** The checks every call shares: a real player, a face that exists, a usable name. */
function who(input: Member): { name: string; avatar: number } | MatchRefusal {
  if (!isPlayerId(input.playerId)) return refuse(400, 'That is not a player.');
  const avatar = Number(input.avatar);
  if (!Number.isInteger(avatar) || avatar < 0 || avatar >= AVATARS) return refuse(400, 'Pick one of the kits.');
  const name = cleanName(input.name);
  if (!name) return refuse(400, `A name, up to ${NAME_MAX} characters.`);
  if (nameBlocked(name)) return refuse(400, NAME_BLOCKED_REASON);
  return { name, avatar };
}

/** The hash, picked apart. Anything not understood is left out rather than trusted. */
export function parseMatch(held: Record<string, unknown> | null): StoredMatch | null {
  if (!held || typeof held.host !== 'string') return null;
  const round = Math.max(1, Math.floor(Number(held.round)) || 1);
  const match: StoredMatch = { host: held.host, at: Number(held.at) || 0, seed: Number(held.seed) >>> 0, members: {}, removed: {}, start: null, round,
    over: Math.floor(Number(held.over)) || 0, balls: {}, hows: {}, invited: {}, reactions: {}, nudged: {}, result: null };
  for (const [field, raw] of Object.entries(held)) {
    const value = typeof raw === 'string' && raw.startsWith('{') ? safeJson(raw) : raw;
    if (field.startsWith('m:') && value && typeof value === 'object') match.members[field.slice(2)] = value as StoredMember;
    else if (field.startsWith('rm:')) match.removed[field.slice(3)] = Number(value) || 0;
    else if (field === 'res' && value && typeof value === 'object' && Array.isArray((value as MatchResult).rows)) match.result = value as MatchResult;
    else if (field.startsWith('ng:')) match.nudged[field.slice(3)] = Number(value) || 0;
    else if (field.startsWith('iv:') && value && typeof value === 'object') match.invited[field.slice(3)] = value as StoredMatchInvite;
    else if (field === 'start' && value && typeof value === 'object' && Array.isArray((value as StoredStart).seats)) {
      // A start is this round's or nobody's: one left behind by a room going back to its lobby is not a match.
      const start = { ...(value as StoredStart), round: Number((value as StoredStart).round) || round };
      if (start.round === round) match.start = start;
    }
    else if (field.startsWith('rx:')) {
      const rx = value as StoredReaction | null;
      if (Number(field.split(':')[1]) === round && rx && typeof rx === 'object' && typeof rx.to === 'string' && REACTIONS[rx.e] !== undefined) match.reactions[field] = rx;
    }
    else if (field.startsWith('h:')) {
      // `h:<round>:<player>:<ball>`: how that ball was played, kept behind a mark so it is never read as an object.
      const [, of, id, at] = field.split(':'), ball = Number(at);
      if (Number(of) === round && id && Number.isInteger(ball) && ball >= 0 && ball < MATCH_BALLS && typeof raw === 'string' && raw.startsWith(HOW_MARK) && raw.length <= HOW_MAX + 1) {
        (match.hows[id] ??= {})[ball] = raw.slice(1);
      }
    }
    else if (field.startsWith('b:')) {
      // `b:<round>:<player>:<ball>`: only this round's are the match's.
      const [, of, id, at] = field.split(':'), ball = Number(at);
      const char = String(value);
      if (Number(of) === round && id && Number.isInteger(ball) && ball >= 0 && ball < MATCH_BALLS && char.length === 1 && MATCH_BALL_CHARS.includes(char)) {
        (match.balls[id] ??= {})[ball] = char;
      }
    }
  }
  return match;
}

function safeJson(raw: string): unknown { try { return JSON.parse(raw); } catch { return null; } }

/** A player's balls in order, as far as they run unbroken. */
export function cardOf(match: StoredMatch, playerId: string): string {
  const balls = match.balls[playerId] ?? {};
  let card = '';
  for (let i = 0; i < MATCH_BALLS && balls[i] !== undefined; i++) card += balls[i];
  return card;
}

/**
 * How a player's latest balls were played, for whoever is watching them: the last `HOWS_TOLD` of their card and no more,
 * since a story never shows an older one and every answer carries these. Null where none was told.
 */
function howsOf(match: StoredMatch, playerId: string): { from: number; list: string[] } | null {
  const told = match.hows[playerId], length = cardOf(match, playerId).length;
  if (!told || !length) return null;
  const from = Math.max(0, length - HOWS_TOLD);
  const list = Array.from({ length: length - from }, (_, i) => told[from + i] ?? '');
  return list.some(Boolean) ? { from, list } : null;
}

/** Members in the order they joined: the host first, then whoever came first. */
function joinOrder(match: StoredMatch): string[] {
  return Object.keys(match.members).sort((a, b) =>
    Number(b === match.host) - Number(a === match.host) || match.members[a].joined - match.members[b].joined || a.localeCompare(b));
}

/** Batting in the match being played: seated in it, not gone back to the room or away from it, and the match not over. */
function playingIn(match: StoredMatch, id: string): boolean {
  const m = match.members[id];
  return !!match.start && !!m && match.over !== match.round && match.start.seats.includes(id) && !m.left && m.back !== match.round;
}

/**
 * When a member was last heard from, for judging who has gone quiet in a match: never before its walk-out. A phone
 * checks in only once it is batting, so a guest who said I'M READY and waited half a minute for the host to start was
 * already "quiet" as the match began, and if the host's phone asked before the guest's first check-in landed a sub
 * batted the guest's first over (seen in friends-check, 19 November 2026). Everybody seated is taken as there at the
 * walk-out, and has `AWAY_MS` from it.
 */
function heardAt(match: StoredMatch, id: string): number {
  const m = match.members[id];
  return Math.max(m?.seen || m?.joined || 0, match.start?.seats.includes(id) ? match.start.at : 0);
}

/** How many are still batting the match and being heard from: the room goes back to its lobby when it is none. */
function busyIn(match: StoredMatch, now: number): number {
  return Object.keys(match.members).filter(id => playingIn(match, id) && now - heardAt(match, id) < AWAY_MS).length;
}

export function viewOf(code: string, match: StoredMatch, now = Date.now()): MatchView {
  const seats = match.start?.seats ?? [];
  const members = joinOrder(match).map(id => {
    const m = match.members[id];
    const seat = seats.indexOf(id);
    return {
      handle: handleOf(id), name: m.name, avatar: m.avatar, joined: m.joined, ready: !!m.ready, host: id === match.host,
      seat: seat >= 0 ? seat : null, card: cardOf(match, id), hows: howsOf(match, id), quiet: Math.max(0, now - heardAt(match, id)),
      idle: match.start ? Math.max(0, now - Math.max(m.ballAt ?? 0, match.start.at)) : 0, left: !!m.left,
      playing: playingIn(match, id), back: !!match.start && seat >= 0 && m.back === match.round,
      nudged: match.nudged[id] ?? 0,
    };
  });
  const here = new Set(members.map(m => m.handle));
  return {
    code, state: match.start ? 'live' : 'lobby', at: match.at, seed: match.seed, host: handleOf(match.host),
    startAt: match.start?.at ?? null, seats: seats.map(id => handleOf(id)), members,
    invited: Object.keys(match.invited).filter(handle => !here.has(handle)),
    round: match.round, over: !!match.start && match.over === match.round, busy: busyIn(match, now),
    worth: worthOf(match.start ? seats.length : members.filter(m => !m.left).length, POINTS_RULES), pointsFrom: POINTS_RULES.pointsFrom,
    result: match.result,
    reactions: Object.entries(match.reactions).filter(([, rx]) => now - rx.at < REACTION_FRESH_MS).sort((a, b) => a[1].at - b[1].at)
      .map(([id, rx]) => ({ id, to: rx.to, by: String(rx.by ?? ''), from: String(rx.from).slice(0, 14), face: Number(rx.face) || 0, emoji: REACTIONS[rx.e], at: rx.at })),
    now,
  };
}

async function load(store: KnockoutStore, code: string): Promise<StoredMatch | MatchRefusal> {
  const clean = cleanMatchCode(code);
  if (!clean) return refuse(400, 'A code is four letters and numbers.');
  const match = parseMatch(await store.read(clean));
  return match ?? refuse(404, NO_MATCH);
}

async function limited(store: KnockoutStore, kind: 'create' | 'write', address: string): Promise<MatchRefusal | null> {
  const most = kind === 'create' ? CREATE_LIMIT : WRITE_LIMIT;
  return (await store.hits(kind, address, RATE_WINDOW_SECONDS)) > most ? refuse(429, 'Too many matches from here. Try again in a while.') : null;
}

async function answer(store: KnockoutStore, code: string, now: number): Promise<MatchOutcome> {
  const match = parseMatch(await store.read(code));
  return match ? { ok: true, match: viewOf(code, match, now) } : refuse(404, NO_MATCH);
}

/** HOST A MATCH: a fresh code with the host in the first seat. */
export async function hostMatch(store: KnockoutStore, input: Member, now = Date.now(), random: () => number = Math.random): Promise<MatchOutcome> {
  const me = who(input);
  if ('ok' in me) return me;
  const busy = await limited(store, 'create', input.address);
  if (busy) return busy;
  const member: StoredMember = { name: me.name, avatar: me.avatar, joined: now, ready: true, seen: now };
  const seed = Math.floor(random() * 2 ** 32) >>> 0;
  for (let i = 0; i < CODE_TRIES; i++) {
    const code = newMatchCode(random);
    if (await store.claim(code, { host: input.playerId, at: now, seed, round: 1, [`m:${input.playerId}`]: member }, MATCH_TTL_SECONDS)) return answer(store, code, now);
  }
  return refuse(503, 'No free code just now. Try again.');
}

/**
 * JOIN: into the lobby; back into a match already batting for somebody who
 * holds a seat in it; or, with a match being played, into the room to wait
 * for the next one (they are shown who is still PLAYING).
 */
export async function joinMatch(store: KnockoutStore, code: string, input: Member, now = Date.now()): Promise<MatchOutcome> {
  const me = who(input);
  if ('ok' in me) return me;
  const busy = await limited(store, 'write', input.address);
  if (busy) return busy;
  const match = await load(store, code);
  if ('ok' in match) return match;
  const clean = cleanMatchCode(code)!;
  const held = match.members[input.playerId];
  if (match.start && held && match.start.seats.includes(input.playerId)) {
    // Somebody who ran away and came back waits in the room: their seat is a sub's by now.
    const member: StoredMember = held.left ? { ...held, left: false, back: match.round, seen: now } : { ...held, seen: now };
    await store.set(clean, { [`m:${input.playerId}`]: member }, MATCH_TTL_SECONDS);
    return answer(store, clean, now);
  }
  if (!held) {
    if ((match.removed[input.playerId] ?? 0) >= REMOVALS_KEPT_OUT) return refuse(403, 'The host has taken you out of this match.');
    if (Object.keys(match.members).length >= MATCH_SEATS) return refuse(409, MATCH_FULL);
  }
  const member: StoredMember = { name: me.name, avatar: me.avatar, joined: held?.joined ?? now, ready: held?.ready ?? false, seen: now };
  await store.set(clean, { [`m:${input.playerId}`]: member }, MATCH_TTL_SECONDS);
  await store.uninvite(input.playerId, clean);
  return answer(store, clean, now);
}

/** I'M READY, or not (2D): a guest's say before the host starts. */
export async function readyMatch(store: KnockoutStore, code: string, input: Member, ready: boolean, now = Date.now()): Promise<MatchOutcome> {
  const match = await load(store, code);
  if ('ok' in match) return match;
  const held = match.members[input.playerId];
  if (!held) return refuse(403, 'Join the match first.');
  if (match.start) return answer(store, cleanMatchCode(code)!, now);
  await store.set(cleanMatchCode(code)!, { [`m:${input.playerId}`]: { ...held, ready, seen: now } }, MATCH_TTL_SECONDS);
  return answer(store, cleanMatchCode(code)!, now);
}

/**
 * Leaving. From the lobby the seat empties, and a host who leaves hands the
 * match to whoever has waited longest (2F). From a match that has started it
 * is running away (5A): the seat stays, a sub bats it, and the standings say so.
 */
export async function leaveMatch(store: KnockoutStore, code: string, input: Member, now = Date.now()): Promise<MatchOutcome> {
  const match = await load(store, code);
  if ('ok' in match) return match;
  const clean = cleanMatchCode(code)!;
  const held = match.members[input.playerId];
  if (!held) return answer(store, clean, now);
  // The room is somebody else's to start from here on: whoever has waited longest and is still in it.
  if (match.host === input.playerId) {
    const next = joinOrder(match).find(id => id !== input.playerId && !match.members[id].left);
    if (next) await store.set(clean, { host: next }, MATCH_TTL_SECONDS);
  }
  // Still to bat in a match being played: that is running away (5A), and a sub bats the seat.
  if (match.start?.seats.includes(input.playerId) && match.over !== match.round && held.back !== match.round) {
    await store.set(clean, { [`m:${input.playerId}`]: { ...held, left: true } }, MATCH_TTL_SECONDS);
    return answer(store, clean, now);
  }
  // From the lobby, or from the room while others play: the seat simply empties.
  await store.drop(clean, [`m:${input.playerId}`]);
  return answer(store, clean, now);
}

/** The host takes somebody out of the lobby (2E): back with the link once, kept out the second time. */
export async function removeFromMatch(store: KnockoutStore, code: string, input: Member, handle: unknown, now = Date.now()): Promise<MatchOutcome> {
  const match = await load(store, code);
  if ('ok' in match) return match;
  const clean = cleanMatchCode(code)!;
  if (match.host !== input.playerId) return refuse(403, 'Only the host can do that.');
  if (match.start) return refuse(409, MATCH_UNDERWAY);
  const target = Object.keys(match.members).find(id => handleOf(id) === handle && id !== input.playerId);
  if (!target) return answer(store, clean, now);
  await store.drop(clean, [`m:${target}`]);
  await store.set(clean, { [`rm:${target}`]: (match.removed[target] ?? 0) + 1 }, MATCH_TTL_SECONDS);
  return answer(store, clean, now);
}

/**
 * INVITE somebody around now (2B, and the lobby's own row): the match goes into
 * their list of invites, which their game reads for the banner and the bell,
 * and the lobby shows them as SENT.
 */
export async function inviteToMatch(store: KnockoutStore, code: string, input: Member, handle: unknown, now = Date.now()): Promise<MatchOutcome> {
  const busy = await limited(store, 'write', input.address);
  if (busy) return busy;
  const match = await load(store, code);
  if ('ok' in match) return match;
  const clean = cleanMatchCode(code)!;
  const held = match.members[input.playerId];
  if (!held) return refuse(403, 'Join the match first.');
  if (typeof handle !== 'string' || !isHandle(handle)) return refuse(400, 'That is not a player.');
  if (Object.keys(match.invited).length >= INVITES_MAX) return refuse(429, 'That is a lot of invites for one match.');
  const id = await store.idOf(handle);
  if (!id) return refuse(404, 'That player could not be found.');
  if (match.members[id]) return answer(store, clean, now);
  const invite: StoredMatchInvite = { by: held.name, byAvatar: held.avatar, at: now };
  await store.set(clean, { [`iv:${handle}`]: invite }, MATCH_TTL_SECONDS);
  await store.invite(id, clean, invite, MATCH_TTL_SECONDS);
  return answer(store, clean, now);
}

/**
 * START NOW (3B): the host's word, with at least one friend in. The seats are
 * fixed in join order and the walk-out set a few seconds ahead, written once,
 * so two taps cannot start it twice.
 */
export async function startMatch(store: KnockoutStore, code: string, input: Member, now = Date.now()): Promise<MatchOutcome> {
  const match = await load(store, code);
  if ('ok' in match) return match;
  const clean = cleanMatchCode(code)!;
  if (match.host !== input.playerId) return refuse(403, 'Only the host can start the match.');
  if (match.start) return answer(store, clean, now);
  const seats = joinOrder(match).filter(id => !match.members[id].left).slice(0, MATCH_SEATS);
  if (seats.length < 2) return refuse(409, 'Wait for one friend to join.');
  // Everybody, or nobody (Figma section 56): the owner started a match from the computer while the phone had not said
  // I'M READY. The host's own ready is pressing START; every friend in the room has to have said theirs.
  const waiting = notReady(match);
  if (waiting.length) return refuse(409, `Waiting for ${namesOf(waiting.map(id => match.members[id].name))} to be ready.`);
  // Invites stand through a match: somebody asked in late joins the room and waits for the next one.
  await store.setOnce(clean, 'start', { at: now + START_IN_MS, seats, round: match.round } satisfies StoredStart);
  return answer(store, clean, now);
}

/** Friends in the room who have not said I'M READY, in the order they joined. The host is never one: START is theirs. */
function notReady(match: StoredMatch): string[] {
  return joinOrder(match).filter(id => id !== match.host && !match.members[id].left && !match.members[id].ready);
}

/**
 * The host's nudge (section 56, A2 and A3): somebody in the room who has not said I'M READY is told the room is waiting,
 * one of them by handle or all of them at once, each no more often than `NUDGE_GAP_MS`. Only the time is kept, under a
 * field of its own for each of them; their phone shows it when it is newer than the last it showed.
 */
export async function nudgeInMatch(store: KnockoutStore, code: string, input: Member, handle: unknown, now = Date.now()): Promise<MatchOutcome> {
  const match = await load(store, code);
  if ('ok' in match) return match;
  const clean = cleanMatchCode(code)!;
  if (match.host !== input.playerId) return refuse(403, 'Only the host can nudge.');
  if (match.start) return answer(store, clean, now);
  const targets = notReady(match).filter(id => (handle ? handleOf(id) === handle : true) && now - (match.nudged[id] ?? 0) >= NUDGE_GAP_MS);
  if (!targets.length) return answer(store, clean, now);
  const limit = await limited(store, 'write', input.address);
  if (limit) return limit;
  await store.set(clean, Object.fromEntries(targets.map(id => [`ng:${id}`, now])), MATCH_TTL_SECONDS);
  return answer(store, clean, now);
}

/**
 * A ball, as the player's phone saw it: its index and what it was worth. It
 * goes in only as the next ball of their card, never over one already there
 * — a sub's included — and nothing follows a wicket.
 */
export async function ballInMatch(store: KnockoutStore, code: string, input: Member, ball: unknown, value: unknown, now = Date.now(), round?: unknown, how?: unknown): Promise<MatchOutcome> {
  const busy = await limited(store, 'write', input.address);
  if (busy) return busy;
  const match = await load(store, code);
  if ('ok' in match) return match;
  const clean = cleanMatchCode(code)!;
  if (!match.start?.seats.includes(input.playerId)) return refuse(403, 'You are not batting in this match.');
  if (round !== undefined && Number(round) !== match.round) return refuse(410, MATCH_OVER);
  const index = Number(ball), char = String(value);
  if (!Number.isInteger(index) || index < 0 || index >= MATCH_BALLS) return refuse(400, 'That is not a ball of this match.');
  if (char.length !== 1 || !'012346W'.includes(char)) return refuse(400, 'That is not what a ball can be worth.');
  const card = cardOf(match, input.playerId);
  if (card.includes('W')) return refuse(409, 'You are out.');
  if (index > card.length) return refuse(409, 'A ball was missed. Send them in order.');
  // How it was played goes in first, and once, so nobody reads the ball without it. It is only the picture: a watcher holds
  // it to the ball's own figure, so one left beside a ball a sub got to first reads as nothing (`readHow`).
  if (index === card.length && typeof how === 'string' && how.length > 0 && how.length <= HOW_MAX) await store.setOnce(clean, `h:${match.round}:${input.playerId}:${index}`, HOW_MARK + how);
  const written = index === card.length && await store.setOnce(clean, `b:${match.round}:${input.playerId}:${index}`, char);
  const member = match.members[input.playerId];
  await store.set(clean, { [`m:${input.playerId}`]: { ...member, seen: now, ballAt: written ? now : member?.ballAt } }, MATCH_TTL_SECONDS);
  return answer(store, clean, now);
}

/** Still here: a check-in every few seconds while batting or waiting, so the room knows who is away. */
export async function beatInMatch(store: KnockoutStore, code: string, input: Member, now = Date.now()): Promise<MatchOutcome> {
  const match = await load(store, code);
  if ('ok' in match) return match;
  const clean = cleanMatchCode(code)!;
  const held = match.members[input.playerId];
  if (!held) return refuse(403, 'Join the match first.');
  await store.set(clean, { [`m:${input.playerId}`]: { ...held, seen: now } }, MATCH_TTL_SECONDS);
  return answer(store, clean, now);
}

/**
 * A reaction from somebody in the match to a player batting in it (section 51's
 * tray): kept a few seconds under a field of its own, so two sent at once never
 * overwrite each other, and told in every answer while it is fresh. To a real
 * player seated in this match only, never to oneself, and no faster than
 * `REACTION_GAP_MS`. The stale ones are swept as new ones arrive.
 */
export async function reactInMatch(store: KnockoutStore, code: string, input: Member, to: unknown, emoji: unknown, now = Date.now()): Promise<MatchOutcome> {
  const match = await load(store, code);
  if ('ok' in match) return match;
  const clean = cleanMatchCode(code)!;
  const held = match.members[input.playerId];
  if (!held) return refuse(403, 'Join the match first.');
  const e = REACTIONS.indexOf(emoji as typeof REACTIONS[number]);
  const mine = handleOf(input.playerId);
  const target = match.start?.seats.find(id => handleOf(id) === to);
  if (!match.start || e < 0 || !target || to === mine) return refuse(400, 'Nobody to send that to.');
  if (now - (held.rxAt ?? 0) < REACTION_GAP_MS) return answer(store, clean, now);
  const limit = await limited(store, 'write', input.address);
  if (limit) return limit;
  const stale = Object.entries(match.reactions).filter(([, rx]) => now - rx.at > REACTION_FRESH_MS * 2).map(([field]) => field);
  if (stale.length) await store.drop(clean, stale);
  await store.set(clean, {
    [`m:${input.playerId}`]: { ...held, seen: now, rxAt: now },
    [`rx:${match.round}:${now}:${mine.slice(0, 6)}`]: { to: String(to), by: mine, from: held.name, face: held.avatar, e, at: now } satisfies StoredReaction,
  }, MATCH_TTL_SECONDS);
  return answer(store, clean, now);
}

/**
 * Somebody the room is waiting on has gone quiet (4B, 4C): any phone in the
 * match may say so, and the store decides by its own clock. A sub bats out the
 * rest of that player's over, written ball by ball into the fields they would
 * have written, so a ball of theirs that lands first is kept and every phone
 * reads one answer either way. Somebody who ran away is away at once.
 */
export async function awayInMatch(store: KnockoutStore, code: string, input: Member, handle: unknown, over: unknown, now = Date.now()): Promise<MatchOutcome> {
  const match = await load(store, code);
  if ('ok' in match) return match;
  const clean = cleanMatchCode(code)!;
  if (!match.start?.seats.includes(input.playerId)) return refuse(403, 'You are not batting in this match.');
  const target = match.start.seats.find(id => handleOf(id) === handle);
  const which = Number(over);
  if (!target || !Number.isInteger(which) || which < 0 || which * OVER_BALLS >= MATCH_BALLS) return refuse(400, 'That is not somebody in this match.');
  const held = match.members[target];
  const quiet = now - heardAt(match, target);
  const card = cardOf(match, target);
  if (card.includes('W')) return answer(store, clean, now);
  const idle = now - Math.max(held?.ballAt ?? 0, match.start.at);
  // Gone back to the room without being out (somebody who ran away and came back): their seat is a sub's.
  if (!held?.left && held?.back !== match.round && quiet < AWAY_MS && idle < STALL_MS) return answer(store, clean, now);
  const end = Math.min(MATCH_BALLS, (which + 1) * OVER_BALLS);
  for (let i = card.length; i < end; i++) await store.setOnce(clean, `b:${match.round}:${target}:${i}`, 'S');
  return answer(store, clean, now);
}

/**
 * BACK TO ROOM: somebody whose batting is done (out, knocked out, or the match
 * over) goes back to the room under the same code, where everybody still
 * batting is tagged PLAYING and the host starts the next match once nobody is.
 */
export async function backToRoom(store: KnockoutStore, code: string, input: Member, now = Date.now(), ledger: KnockoutLedger | null = null): Promise<MatchOutcome> {
  const match = await load(store, code);
  if ('ok' in match) return match;
  const clean = cleanMatchCode(code)!;
  const held = match.members[input.playerId];
  if (!held) return refuse(403, 'Join the match first.');
  if (match.start?.seats.includes(input.playerId) && held.back !== match.round) {
    await store.set(clean, { [`m:${input.playerId}`]: { ...held, back: match.round, seen: now } }, MATCH_TTL_SECONDS);
  }
  return settleMatch(store, clean, input, now, Math.random, ledger);
}

/**
 * The result of the round being played, kept and paid: the room played back from the cards the store holds, its points
 * written once (`paid:<round>`, set if absent, so two phones saying so at once pay once), and the result kept under `res`
 * for every phone to read. Null where the match is not at its end on those cards. A ledger out of reach never fails the
 * match it rides on: the result is still kept.
 */
async function settleResult(store: KnockoutStore, clean: string, match: StoredMatch, now: number, ledger: KnockoutLedger | null, fill: boolean): Promise<MatchResult | null> {
  const found = resultOf(match, id => cardOf(match, id), POINTS_RULES, now, fill);
  if (!found) return null;
  const first = await store.setOnce(clean, `paid:${match.round}`, now);
  if (first && ledger && found.credits.length) {
    try { await creditMatch(ledger, found.credits, now); } catch { /* the match is not held up for the ledger */ }
  }
  return found.result;
}

/**
 * The match is over, as a phone that has batted it to the end says. The store checks: it plays the room back from the
 * cards it holds, and only if that comes to a winner is the match over, its result kept and its points paid. Said too
 * soon, nothing changes.
 */
export async function doneMatch(store: KnockoutStore, code: string, input: Member, round: unknown, now = Date.now(), ledger: KnockoutLedger | null = null): Promise<MatchOutcome> {
  const match = await load(store, code);
  if ('ok' in match) return match;
  const clean = cleanMatchCode(code)!;
  if (!match.start?.seats.includes(input.playerId)) return refuse(403, 'You are not batting in this match.');
  if (Number(round) !== match.round) return refuse(410, MATCH_OVER);
  if (match.over !== match.round) {
    const result = await settleResult(store, clean, match, now, ledger, false);
    if (result) await store.set(clean, { over: match.round, res: result }, MATCH_TTL_SECONDS);
  }
  return answer(store, clean, now);
}

/**
 * The room back to its lobby, once nobody is still batting the match (every
 * seat back, away, or the match over): the next match is a round on, on a new
 * seed, with everybody still in the room and nobody who ran away. Any phone in
 * the room may ask; the store decides. Asked while somebody is still batting,
 * nothing happens.
 */
export async function settleMatch(store: KnockoutStore, code: string, input: Member, now = Date.now(), random: () => number = Math.random, ledger: KnockoutLedger | null = null): Promise<MatchOutcome> {
  const match = await load(store, code);
  if ('ok' in match) return match;
  const clean = cleanMatchCode(code)!;
  if (!match.members[input.playerId]) return refuse(403, 'Join the match first.');
  if (!match.start || busyIn(match, now) > 0) return answer(store, clean, now);
  const held = await store.read(clean) ?? {};
  // Nobody said it was over (everybody went back, or away): the store brings it to its end itself, a sub batting every
  // ball never sent, so the places the match had already settled are still paid.
  const result = match.over === match.round ? null : await settleResult(store, clean, match, now, ledger, true);
  const stay = joinOrder(match).filter(id => !match.members[id].left);
  const host = stay.includes(match.host) ? match.host : stay[0] ?? match.host;
  const fields: Record<string, unknown> = { round: match.round + 1, seed: Math.floor(random() * 2 ** 32) >>> 0, host, ...(result ? { res: result } : {}) };
  for (const id of stay) {
    const { back: _back, ballAt: _ballAt, rxAt: _rxAt, ...member } = match.members[id];
    fields[`m:${id}`] = { ...member, ready: id === host };
  }
  // In one step, so no phone reads the old start under the new round: a ball of the old round landing after it is filed
  // under that round, where nobody reads it.
  // `paid:` of this round stays: a second phone settling off the same read must find it there and pay nothing.
  await store.swap(clean, fields, ['start', 'over', ...Object.keys(held).filter(field => field.startsWith('b:') || field.startsWith('h:') || field.startsWith('rx:')
    || field.startsWith('paid:') && Number(field.slice(5)) < match.round),
    ...Object.keys(match.members).filter(id => match.members[id].left).map(id => `m:${id}`)], MATCH_TTL_SECONDS);
  return answer(store, clean, now);
}

export async function readMatch(store: KnockoutStore, code: string, now = Date.now()): Promise<MatchOutcome> {
  const match = await load(store, code);
  if ('ok' in match) return match;
  return { ok: true, match: viewOf(cleanMatchCode(code)!, match, now) };
}

/** A player's invites still open: matches in their lobby, newest first (1K to 1M). */
export async function readInvites(store: KnockoutStore, playerId: string, now = Date.now()): Promise<MatchInvitesAccepted | MatchRefusal> {
  if (!isPlayerId(playerId)) return refuse(400, 'That is not a player.');
  const kept = await store.invites(playerId);
  const open: MatchInviteView[] = [];
  for (const [code, invite] of Object.entries(kept)) {
    const match = parseMatch(await store.read(code));
    if (!match || match.members[playerId] || now - invite.at > INVITE_FRESH_MS) { await store.uninvite(playerId, code); continue; }
    open.push({ code, by: invite.by, byAvatar: invite.byAvatar, at: invite.at, size: Object.keys(match.members).length });
  }
  return { ok: true, invites: open.sort((a, b) => b.at - a.at) };
}

/**
 * The store in memory, for the tests and the dev server: kept the way Redis
 * keeps it (a hash of fields, set-if-absent on one field, values cloned on the
 * way in and out), so a rule that leans on Redis's shape fails here first.
 */
export function memoryKnockouts(handles: (handle: string) => string | null | Promise<string | null> = () => null): KnockoutStore & { clear(): void } {
  const matches = new Map<string, { fields: Record<string, unknown>; until: number }>();
  const rate = new Map<string, { count: number; until: number }>();
  const asked = new Map<string, Map<string, { invite: StoredMatchInvite; until: number }>>();
  const live = (code: string) => {
    const held = matches.get(code);
    if (!held) return null;
    if (held.until <= Date.now()) { matches.delete(code); return null; }
    return held;
  };
  return {
    async claim(code, fields, ttl) {
      if (live(code)) return false;
      matches.set(code, { fields: structuredClone(fields), until: Date.now() + ttl * 1000 });
      return true;
    },
    async read(code) { const held = live(code); return held ? structuredClone(held.fields) : null; },
    async set(code, fields, ttl) {
      const held = live(code);
      if (!held) return;
      Object.assign(held.fields, structuredClone(fields));
      held.until = Date.now() + ttl * 1000;
    },
    async setOnce(code, field, value) {
      const held = live(code);
      if (!held || field in held.fields) return false;
      held.fields[field] = structuredClone(value);
      return true;
    },
    async drop(code, fields) { const held = live(code); if (held) for (const f of fields) delete held.fields[f]; },
    async swap(code, fields, drop, ttl) {
      const held = live(code);
      if (!held) return;
      for (const f of drop) delete held.fields[f];
      Object.assign(held.fields, structuredClone(fields));
      held.until = Date.now() + ttl * 1000;
    },
    async hits(kind, address, windowSeconds) {
      const key = `${kind}:${address}`, now = Date.now(), held = rate.get(key);
      if (!held || held.until <= now) { rate.set(key, { count: 1, until: now + windowSeconds * 1000 }); return 1; }
      return ++held.count;
    },
    async invite(playerId, code, invite, ttl) {
      const list = asked.get(playerId) ?? new Map();
      list.set(code, { invite: structuredClone(invite), until: Date.now() + ttl * 1000 });
      asked.set(playerId, list);
    },
    async invites(playerId) {
      const out: Record<string, StoredMatchInvite> = {};
      for (const [code, held] of asked.get(playerId) ?? []) if (held.until > Date.now()) out[code] = structuredClone(held.invite);
      return out;
    },
    async uninvite(playerId, code) { asked.get(playerId)?.delete(code); },
    async idOf(handle) { return (await handles(handle)) ?? null; },
    clear() { matches.clear(); rate.clear(); asked.clear(); },
  };
}
