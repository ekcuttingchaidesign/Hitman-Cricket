import { handleOf, isHandle } from '../game/handle.js';
import { whenOf } from '../game/recap.js';
import { isPlayerId } from './board-store.js';
import { bioProblem, cleanBio } from './bio-rules.js';
import type { SurviveResult } from '../game/chase.js';
import type { Tally } from './tally.js';

/**
 * What a player's profile collects about them that no board does: the handle
 * their rows go by, the line they wrote about themselves, how many people
 * looked this week, and who chased or passed them.
 *
 * Looking is private and acting is public. A view is a count and nothing else
 * — who looked is never kept past the day it is counted in, and never shown —
 * while a chase or a pass carries the name, the way a score on a board does.
 *
 * The rules live here and the keeping is behind `PlayerStore`, so the tests run
 * them against `memoryPlayers()` and the deployed endpoint against Redis
 * (`upstashPlayers` in `upstash.ts`) with nothing in between.
 */

export type ProfileMode = 'classic' | 'survive' | 'marathon';

/** One thing another player did to this one. */
export interface ActivityEvent {
  /** `beat`: a chase that went past them. `short`: a chase that fell short. `passed`: any innings that moved above them. */
  kind: 'beat' | 'short' | 'passed';
  /** Who did it, by public handle, with their name and kit as they were. */
  handle: string;
  name: string;
  avatar: number;
  mode: ProfileMode;
  /** The runs their innings made. */
  runs: number;
  /** The best of this player's they went after, or the score they went past. */
  target: number;
  /** Where this player stood once it happened, where it moved them. */
  place: number | null;
  /**
   * On a beat, whether it moved them down a place: a chaser already above them
   * beats their best without passing them. Missing on a pass, which always
   * does, and on beats noted before it was kept, which are taken to have.
   */
  dropped?: boolean;
  at: number;
  /** A Test Survival chase is of a result, not runs: the chaser's, and this player's that it went after. */
  result?: { mine: SurviveResult; theirs: SurviveResult };
}

/** A bio as it is kept. */
export interface StoredBio { text: string; at: number }

export interface PlayerStore {
  /** Notes which player a handle belongs to. */
  rememberHandle(handle: string, id: string): Promise<void>;
  /** The player a handle belongs to, or null for one never seen. */
  idOf(handle: string): Promise<string | null>;
  readBio(id: string): Promise<StoredBio | null>;
  /** Writes a bio, or takes it away with null. */
  writeBio(id: string, bio: StoredBio | null): Promise<void>;
  /** Counts a viewer once on one of this player's days; kept a little over a week, then forgotten. Answers whether they were new that day. */
  addView(id: string, day: string, viewer: string): Promise<boolean>;
  /** How many viewers this player had over these days, a viewer counted once a day. */
  views(id: string, days: readonly string[]): Promise<number>;
  /** Puts an event at the front of this player's list, keeping the newest `keep`. */
  addEvent(id: string, event: ActivityEvent, keep: number, ttlSeconds: number): Promise<void>;
  /** This player's events, newest first. */
  events(id: string): Promise<ActivityEvent[]>;
  /** Calls from one address inside the window, counting this one. */
  hits(address: string, windowSeconds: number): Promise<number>;
  /** One event raised on the store's tally (`tally.ts`). Never throws. */
  tally(event: Tally): Promise<void>;
}

/** The days a view count covers. */
export const VIEW_DAYS = 7;
/** How many events a player keeps, and for how long. */
export const EVENTS_KEPT = 10;
export const EVENT_DAYS = 30;
const DAY_MS = 86_400_000;
/** Bio saves from one address an hour. A save is a tap on SAVE; this is for a loop, not a player. */
export const BIO_LIMIT = 60;
/** Profile reads from one address an hour: a board opened and every row on it tapped, twenty times over. */
export const READ_LIMIT = 1000;
export const WINDOW_SECONDS = 3600;

/** India's day an instant falls in, as the views are counted by. */
export function dayKey(at: number): string {
  const { year, day } = whenOf(at);
  return `${year}-${day}`;
}

/** The last `n` days, today first. */
export function recentDays(now: number, n = VIEW_DAYS): string[] {
  return Array.from({ length: n }, (_, i) => dayKey(now - i * DAY_MS));
}

/** Notes the handle of a player who just wrote something, so their rows can open a profile. Never fails what it rides on. */
export async function rememberHandle(store: PlayerStore, playerId: unknown): Promise<void> {
  if (!isPlayerId(playerId)) return;
  await store.rememberHandle(handleOf(playerId), playerId).catch(() => undefined);
}

/**
 * A look at somebody's profile, counted for them. Only a viewer the store
 * knows — one who has written something, so a handle that belongs to a
 * player — and never a player looking at themselves. Answers whether it counted.
 */
export async function countView(
  store: PlayerStore, input: { playerId: string; viewer: unknown }, now = Date.now(),
): Promise<boolean> {
  const viewer = input.viewer;
  if (!isHandle(viewer) || viewer === handleOf(input.playerId)) return false;
  if (!(await store.idOf(viewer))) return false;
  if (await store.addView(input.playerId, dayKey(now), viewer)) await store.tally('profile-view');
  return true;
}

/** What a player's own profile has collected: views this week, the events still fresh, and their bio. */
export interface Activity {
  views: number;
  events: ActivityEvent[];
  bio: string | null;
}

export async function readActivity(store: PlayerStore, playerId: string, now = Date.now()): Promise<Activity | null> {
  if (!isPlayerId(playerId)) return null;
  const [views, events, bio] = await Promise.all([
    store.views(playerId, recentDays(now)),
    store.events(playerId),
    store.readBio(playerId),
  ]);
  const fresh = events.filter(one => now - one.at < EVENT_DAYS * DAY_MS).slice(0, EVENTS_KEPT);
  return { views, events: fresh, bio: bio?.text ?? null };
}

/** Puts an event on a player's list. Never fails what it rides on. */
export async function noteEvent(store: PlayerStore, playerId: string, event: ActivityEvent): Promise<void> {
  if (!isPlayerId(playerId)) return;
  await store.addEvent(playerId, event, EVENTS_KEPT, EVENT_DAYS * 86_400).catch(() => undefined);
}

export type BioSaved = { ok: true; bio: string | null } | BioRefusal;
export type BioRefusal = { ok: false; status: number; reason: string };
export const refusedBio = (outcome: BioSaved): outcome is BioRefusal => !outcome.ok;

/**
 * A bio sent from Your details. Only a named player has a profile to show it
 * on, which the caller knows and says; the rules are `bioProblem`'s, the same
 * ones the screen ran, and an empty field takes the bio away.
 */
export async function saveBio(
  store: PlayerStore, input: { playerId: unknown; bio: unknown; named: boolean; address: string }, now = Date.now(),
): Promise<BioSaved> {
  if (!isPlayerId(input.playerId)) return { ok: false, status: 400, reason: 'That is not a player.' };
  if (!input.named) return { ok: false, status: 403, reason: 'Claim a name first: a bio goes on your profile.' };
  if (await store.hits(input.address, WINDOW_SECONDS) > BIO_LIMIT) return { ok: false, status: 429, reason: 'Too many saves. Try again in a while.' };
  const problem = bioProblem(input.bio);
  if (problem) return { ok: false, status: 422, reason: problem };
  const text = cleanBio(input.bio);
  await store.writeBio(input.playerId, text ? { text, at: now } : null);
  await rememberHandle(store, input.playerId);
  return { ok: true, bio: text || null };
}

/** In memory, for the dev server and the tests. */
export function memoryPlayers(): PlayerStore & { clear(): void; tallied: Map<Tally, number> } {
  const handles = new Map<string, string>();
  const bios = new Map<string, StoredBio>();
  const seen = new Map<string, Set<string>>();
  const events = new Map<string, ActivityEvent[]>();
  const rate = new Map<string, { count: number; until: number }>();
  const tallied = new Map<Tally, number>();
  return {
    tallied,
    async rememberHandle(handle, id) { handles.set(handle, id); },
    async idOf(handle) { return handles.get(handle) ?? null; },
    async readBio(id) { return bios.get(id) ?? null; },
    async writeBio(id, bio) { if (bio) bios.set(id, bio); else bios.delete(id); },
    async addView(id, day, viewer) {
      const key = `${id}:${day}`;
      if (!seen.has(key)) seen.set(key, new Set());
      const fresh = !seen.get(key)!.has(viewer);
      seen.get(key)!.add(viewer);
      return fresh;
    },
    async views(id, days) { return days.reduce((sum, day) => sum + (seen.get(`${id}:${day}`)?.size ?? 0), 0); },
    async addEvent(id, event, keep) { events.set(id, [event, ...(events.get(id) ?? [])].slice(0, keep)); },
    async events(id) { return structuredClone(events.get(id) ?? []); },
    async hits(address, windowSeconds) {
      const now = Date.now(), was = rate.get(address);
      const next = was && was.until > now ? { count: was.count + 1, until: was.until } : { count: 1, until: now + windowSeconds * 1000 };
      rate.set(address, next);
      return next.count;
    },
    async tally(event) { tallied.set(event, (tallied.get(event) ?? 0) + 1); },
    clear() { handles.clear(); bios.clear(); seen.clear(); events.clear(); rate.clear(); tallied.clear(); },
  };
}
