import { handleOf } from './handle';
import type { MatchInviteView, MatchMember, MatchView } from '../server/knockout-store';
import type { KnockoutBoards, KnockoutStanding } from '../server/knockout-ledger';

export type { MatchInviteView, MatchMember, MatchView } from '../server/knockout-store';
export type { MatchResult as StoredResult, MatchResultRow } from '../server/knockout-result';
export type { KnockoutBoards, KnockoutCareer, KnockoutStanding } from '../server/knockout-ledger';

/**
 * Super Knockout with friends, from the browser's side (`knockout-store.ts`
 * keeps every rule). The calls, and `MatchLink`, which keeps one match fresh
 * while it is on screen: the lobby, the walk-out, and the balls the room is
 * waiting on, a poll every second and a half.
 */
const API = import.meta.env.VITE_BOARD_API ?? '';
const TIMEOUT_MS = 10_000;
/** How often an open match asks what has changed. */
export const MATCH_POLL_MS = 1500;
/** How often a player batting or waiting in a match says they are still here (the store calls them away after twenty seconds). */
export const MATCH_BEAT_MS = 5000;
/** The link's parameter: a match's code, which opens it (`?k=K7Q2`). */
export const MATCH_PARAM = 'k';

export interface Me { playerId: string; name: string; avatar: number }

export interface MatchResult {
  ok: boolean;
  match?: MatchView;
  reason?: string;
  status?: number;
  /** Whether trying again could fix it: the network, never a refusal. */
  retry?: boolean;
}

async function ask<T>(url: string, init?: RequestInit): Promise<T | null> {
  const abort = new AbortController();
  const timer = window.setTimeout(() => abort.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, { ...init, signal: abort.signal, cache: 'no-store' });
    return await response.json() as T;
  } catch { return null; } finally { window.clearTimeout(timer); }
}

function result(answer: { ok?: boolean; match?: MatchView; error?: string; status?: number; retry?: boolean } | null): MatchResult {
  if (!answer) return { ok: false, retry: true, reason: 'The match could not be reached. Check your connection.' };
  if (answer.error || !answer.match) return { ok: false, reason: answer.error ?? 'Something went wrong.', status: answer.status, retry: answer.retry === true };
  return { ok: true, match: answer.match };
}

function post(body: Record<string, unknown>): Promise<MatchResult> {
  return ask<{ match?: MatchView; error?: string; status?: number; retry?: boolean }>(`${API}/api/challenge?knockout=1`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  }).then(result);
}

const as = (me: Me) => ({ playerId: me.playerId, name: me.name, avatar: me.avatar });

export const hostMatch = (me: Me) => post({ action: 'host', ...as(me) });
export const joinMatch = (code: string, me: Me) => post({ action: 'join', code, ...as(me) });
export const readyMatch = (code: string, me: Me, ready: boolean) => post({ action: 'ready', code, ready, ...as(me) });
export const leaveMatch = (code: string, me: Me) => post({ action: 'leave', code, ...as(me) });
export const removeFromMatch = (code: string, me: Me, handle: string) => post({ action: 'remove', code, handle, ...as(me) });
export const inviteToMatch = (code: string, me: Me, handle: string) => post({ action: 'invite', code, handle, ...as(me) });
export const startMatch = (code: string, me: Me) => post({ action: 'start', code, ...as(me) });
export const ballInMatch = (code: string, me: Me, ball: number, value: string, round: number, how?: string) => post({ action: 'ball', code, ball, value, round, ...(how ? { how } : {}), ...as(me) });
/** BACK TO ROOM: batting done, back to the room under the same code. */
export const backToRoom = (code: string, me: Me) => post({ action: 'back', code, ...as(me) });
/** The match is over on this phone: nobody is PLAYING it any more. */
export const doneMatch = (code: string, me: Me, round: number) => post({ action: 'done', code, round, ...as(me) });
/** Asks the room back to its lobby; the store does it only once nobody is still batting. */
export const settleMatch = (code: string, me: Me) => post({ action: 'settle', code, ...as(me) });
export const beatInMatch = (code: string, me: Me) => post({ action: 'beat', code, ...as(me) });
/** The host's nudge to somebody not ready (by handle), or to everybody who is not. */
export const nudgeInMatch = (code: string, me: Me, handle?: string) => post({ action: 'nudge', code, handle, ...as(me) });
/** A reaction to whoever is being watched, by their handle. */
export const reactInMatch = (code: string, me: Me, to: string, emoji: string) => post({ action: 'react', code, to, emoji, ...as(me) });
export const awayInMatch = (code: string, me: Me, handle: string, over: number) => post({ action: 'away', code, handle, over, ...as(me) });

export async function readMatch(code: string): Promise<MatchResult> {
  return result(await ask(`${API}/api/challenge?knockout=1&code=${encodeURIComponent(code)}`));
}

/** This player's open invites to matches, newest first; empty when the store cannot be reached. */
export async function readMatchInvites(playerId: string): Promise<MatchInviteView[]> {
  const answer = await ask<{ invites?: MatchInviteView[] }>(`${API}/api/challenge?knockout=1&invites=${encodeURIComponent(playerId)}`);
  return Array.isArray(answer?.invites) ? answer!.invites : [];
}

/** Super Knockout's ladders, every one at once; null when the store cannot be reached. */
export async function readKnockoutBoards(): Promise<KnockoutBoards | null> {
  const answer = await ask<KnockoutBoards>(`${API}/api/challenge?knockout=1&board=1`);
  return answer?.ok && answer.boards ? answer : null;
}

/** One player's Knockout record and where they stand on each ladder; null when the store cannot be reached. */
export async function readKnockoutStanding(playerId: string): Promise<KnockoutStanding | null> {
  const answer = await ask<KnockoutStanding>(`${API}/api/challenge?knockout=1&standing=${encodeURIComponent(playerId)}`);
  return answer?.ok && answer.places ? answer : null;
}

/** What a ball is written as: its runs, or W. A free hit's wicket was turned not out before it gets here. */
export function ballChar(runs: number, wicket: boolean): string { return wicket ? 'W' : String(runs); }

/** This player in a match, by their own handle. */
export function meIn(match: MatchView, playerId: string): MatchMember | null {
  const handle = handleOf(playerId);
  return match.members.find(m => m.handle === handle) ?? null;
}

/**
 * One match kept fresh while it is on screen: a poll every `MATCH_POLL_MS`,
 * and every answer — a poll's or a write's — handed to `onMatch`. The store's
 * clock comes with each answer, so `serverNow` counts the walk-out to the same
 * moment on every phone.
 */
export class MatchLink {
  match: MatchView | null = null;
  /** When the store last answered (this page's clock), for `?matchlog=1`. */
  heardAt = Date.now();
  private timer = 0;
  private offset = 0;
  private stopped = false;
  private busy = false;
  constructor(readonly code: string, private readonly onMatch: (match: MatchView) => void, private readonly onGone?: (reason: string) => void) {}
  start() { this.stopped = false; void this.poll(); }
  stop() { this.stopped = true; window.clearTimeout(this.timer); }
  serverNow() { return Date.now() + this.offset; }
  /** An answer from anywhere (a write's, too) taken as the match's latest. */
  take(answer: MatchResult) {
    // A link put away hears nothing more: an answer still on its way is not this screen's.
    if (this.stopped) return;
    if (!answer.ok || !answer.match) {
      if (answer.status === 404) this.onGone?.(answer.reason ?? 'This match has closed.');
      return;
    }
    this.heardAt = Date.now();
    // Answers can land out of order (a poll asked before a ball landed, answered after it): an older one never
    // takes the match back.
    if (this.match && answer.match.code === this.match.code && answer.match.now < this.match.now) return;
    this.offset = answer.match.now - Date.now();
    this.match = answer.match;
    this.onMatch(answer.match);
  }
  private async poll() {
    if (this.stopped) return;
    if (!this.busy && !document.hidden) {
      this.busy = true;
      try { this.take(await readMatch(this.code)); } finally { this.busy = false; }
    }
    if (!this.stopped) this.timer = window.setTimeout(() => this.poll(), MATCH_POLL_MS);
  }
}

/** The match this browser is in, kept for a reload in the lobby or mid-match. */
const MATCH_KEY = 'hitman-match';
export function keptMatch(): string | null { try { return sessionStorage.getItem(MATCH_KEY); } catch { return null; } }
export function keepMatch(code: string | null) {
  try { if (code) sessionStorage.setItem(MATCH_KEY, code); else sessionStorage.removeItem(MATCH_KEY); } catch { /* Kept for this page only. */ }
}
