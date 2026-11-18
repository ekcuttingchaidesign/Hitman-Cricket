import { AVATARS, NAME_MAX, cleanName, isPlayerId } from './board-store.js';
import { NAME_BLOCKED_REASON, nameBlocked } from './name-filter.js';
import { handleOf, isHandle } from '../game/handle.js';
import { MATCH_CODE_ALPHABET, MATCH_CODE_LENGTH, MATCH_SEATS, cleanMatchCode } from '../game/match-code.js';

export { MATCH_CODE_ALPHABET, MATCH_CODE_LENGTH, MATCH_SEATS, cleanMatchCode };

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
 */

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
export const CREATE_LIMIT = 30;
export const WRITE_LIMIT = 4000;
export const RATE_WINDOW_SECONDS = 3600;
const CODE_TRIES = 6;

export type MatchState = 'lobby' | 'live';

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
}

/** The start, written once by the host: when everybody walks out, and the seats in order. */
export interface StoredStart { at: number; seats: string[] }

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
  /** Every ball written, by player id and ball. */
  balls: Record<string, Record<number, string>>;
  /** Who has been asked in, by handle. */
  invited: Record<string, StoredMatchInvite>;
}

export interface KnockoutStore {
  /** Makes a match on a fresh code: false if the code is taken. */
  claim(code: string, fields: Record<string, unknown>, ttlSeconds: number): Promise<boolean>;
  read(code: string): Promise<Record<string, unknown> | null>;
  set(code: string, fields: Record<string, unknown>, ttlSeconds: number): Promise<void>;
  /** Writes one field only if it is not there yet; true if this call wrote it. */
  setOnce(code: string, field: string, value: unknown): Promise<boolean>;
  drop(code: string, fields: string[]): Promise<void>;
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
  /** How long since they were heard from, by the store's clock. */
  quiet: number;
  /** How long since their last ball (or the walk-out, before one), by the store's clock; 0 in the lobby. */
  idle: number;
  left: boolean;
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
  const match: StoredMatch = { host: held.host, at: Number(held.at) || 0, seed: Number(held.seed) >>> 0, members: {}, removed: {}, start: null, balls: {}, invited: {} };
  for (const [field, raw] of Object.entries(held)) {
    const value = typeof raw === 'string' && raw.startsWith('{') ? safeJson(raw) : raw;
    if (field.startsWith('m:') && value && typeof value === 'object') match.members[field.slice(2)] = value as StoredMember;
    else if (field.startsWith('rm:')) match.removed[field.slice(3)] = Number(value) || 0;
    else if (field.startsWith('iv:') && value && typeof value === 'object') match.invited[field.slice(3)] = value as StoredMatchInvite;
    else if (field === 'start' && value && typeof value === 'object' && Array.isArray((value as StoredStart).seats)) match.start = value as StoredStart;
    else if (field.startsWith('b:')) {
      const cut = field.lastIndexOf(':'), id = field.slice(2, cut), ball = Number(field.slice(cut + 1));
      const char = String(value);
      if (Number.isInteger(ball) && ball >= 0 && ball < MATCH_BALLS && char.length === 1 && MATCH_BALL_CHARS.includes(char)) {
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

/** Members in the order they joined: the host first, then whoever came first. */
function joinOrder(match: StoredMatch): string[] {
  return Object.keys(match.members).sort((a, b) =>
    Number(b === match.host) - Number(a === match.host) || match.members[a].joined - match.members[b].joined || a.localeCompare(b));
}

export function viewOf(code: string, match: StoredMatch, now = Date.now()): MatchView {
  const seats = match.start?.seats ?? [];
  const members = joinOrder(match).map(id => {
    const m = match.members[id];
    const seat = seats.indexOf(id);
    return {
      handle: handleOf(id), name: m.name, avatar: m.avatar, joined: m.joined, ready: !!m.ready, host: id === match.host,
      seat: seat >= 0 ? seat : null, card: cardOf(match, id), quiet: Math.max(0, now - (m.seen || m.joined)),
      idle: match.start ? Math.max(0, now - Math.max(m.ballAt ?? 0, match.start.at)) : 0, left: !!m.left,
    };
  });
  const here = new Set(members.map(m => m.handle));
  return {
    code, state: match.start ? 'live' : 'lobby', at: match.at, seed: match.seed, host: handleOf(match.host),
    startAt: match.start?.at ?? null, seats: seats.map(id => handleOf(id)), members,
    invited: Object.keys(match.invited).filter(handle => !here.has(handle)), now,
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
    if (await store.claim(code, { host: input.playerId, at: now, seed, [`m:${input.playerId}`]: member }, MATCH_TTL_SECONDS)) return answer(store, code, now);
  }
  return refuse(503, 'No free code just now. Try again.');
}

/** JOIN: into the lobby, or back into a match already batting for somebody who holds a seat in it. */
export async function joinMatch(store: KnockoutStore, code: string, input: Member, now = Date.now()): Promise<MatchOutcome> {
  const me = who(input);
  if ('ok' in me) return me;
  const busy = await limited(store, 'write', input.address);
  if (busy) return busy;
  const match = await load(store, code);
  if ('ok' in match) return match;
  const clean = cleanMatchCode(code)!;
  const held = match.members[input.playerId];
  if (match.start) {
    if (!match.start.seats.includes(input.playerId)) return refuse(409, MATCH_UNDERWAY);
    await store.set(clean, { [`m:${input.playerId}`]: { ...held!, seen: now } }, MATCH_TTL_SECONDS);
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
  if (match.start) {
    await store.set(clean, { [`m:${input.playerId}`]: { ...held, left: true } }, MATCH_TTL_SECONDS);
    return answer(store, clean, now);
  }
  await store.drop(clean, [`m:${input.playerId}`]);
  if (match.host === input.playerId) {
    const next = joinOrder(match).find(id => id !== input.playerId);
    if (next) await store.set(clean, { host: next }, MATCH_TTL_SECONDS);
  }
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
  if (match.start) return refuse(409, MATCH_UNDERWAY);
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
  const seats = joinOrder(match).slice(0, MATCH_SEATS);
  if (seats.length < 2) return refuse(409, 'Wait for one friend to join.');
  await store.setOnce(clean, 'start', { at: now + START_IN_MS, seats } satisfies StoredStart);
  for (const handle of Object.keys(match.invited)) {
    const id = await store.idOf(handle);
    if (id) await store.uninvite(id, clean);
  }
  return answer(store, clean, now);
}

/**
 * A ball, as the player's phone saw it: its index and what it was worth. It
 * goes in only as the next ball of their card, never over one already there
 * — a sub's included — and nothing follows a wicket.
 */
export async function ballInMatch(store: KnockoutStore, code: string, input: Member, ball: unknown, value: unknown, now = Date.now()): Promise<MatchOutcome> {
  const busy = await limited(store, 'write', input.address);
  if (busy) return busy;
  const match = await load(store, code);
  if ('ok' in match) return match;
  const clean = cleanMatchCode(code)!;
  if (!match.start?.seats.includes(input.playerId)) return refuse(403, 'You are not batting in this match.');
  const index = Number(ball), char = String(value);
  if (!Number.isInteger(index) || index < 0 || index >= MATCH_BALLS) return refuse(400, 'That is not a ball of this match.');
  if (char.length !== 1 || !'012346W'.includes(char)) return refuse(400, 'That is not what a ball can be worth.');
  const card = cardOf(match, input.playerId);
  if (card.includes('W')) return refuse(409, 'You are out.');
  if (index > card.length) return refuse(409, 'A ball was missed. Send them in order.');
  const written = index === card.length && await store.setOnce(clean, `b:${input.playerId}:${index}`, char);
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
  const quiet = now - (held?.seen ?? 0);
  const card = cardOf(match, target);
  if (card.includes('W')) return answer(store, clean, now);
  const idle = now - Math.max(held?.ballAt ?? 0, match.start.at);
  if (!held?.left && quiet < AWAY_MS && idle < STALL_MS) return answer(store, clean, now);
  const end = Math.min(MATCH_BALLS, (which + 1) * OVER_BALLS);
  for (let i = card.length; i < end; i++) await store.setOnce(clean, `b:${target}:${i}`, 'S');
  return answer(store, clean, now);
}

export async function readMatch(store: KnockoutStore, code: string, now = Date.now()): Promise<MatchOutcome> {
  const match = await load(store, code);
  if ('ok' in match) return match;
  return { ok: true, match: viewOf(cleanMatchCode(code)!, match, now) };
}

/** A player's invites still open: matches in their lobby, newest first (1K to 1M). */
export async function readInvites(store: KnockoutStore, playerId: string): Promise<MatchInvitesAccepted | MatchRefusal> {
  if (!isPlayerId(playerId)) return refuse(400, 'That is not a player.');
  const kept = await store.invites(playerId);
  const open: MatchInviteView[] = [];
  for (const [code, invite] of Object.entries(kept)) {
    const match = parseMatch(await store.read(code));
    if (!match || match.start || match.members[playerId]) { await store.uninvite(playerId, code); continue; }
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
