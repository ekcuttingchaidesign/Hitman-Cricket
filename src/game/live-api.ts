import type { LiveMode, LivePayload, LivePlayer, LiveState } from '../server/live-store';

/**
 * The browser's side of `/api/live` (`server/live-store.ts`): checking in while
 * the game is open, and the list of who else is.
 *
 * A check-in goes every `CHECK_IN_MS` while the page is on screen and at once
 * when an innings starts or ends, so a bat badge goes up with the first ball
 * and comes off with the last. The list is asked for every `LIST_MS` while the
 * page is on screen and the player is not batting; it is the same answer for
 * everybody and sits in the edge cache, so asking costs a busy board nothing.
 */

export type { LiveMode, LivePlayer, LiveState };

const API = import.meta.env.VITE_BOARD_API ?? '';
const TIMEOUT_MS = 5000;
export const CHECK_IN_MS = 2 * 60_000;
export const LIST_MS = 45_000;
/** Two check-ins closer than this are one: a phase flickering at the start of an innings. */
const SETTLE_MS = 8_000;

export interface Me { playerId: string; name: string; avatar: number }
export interface Doing { state: LiveState; mode: LiveMode | null }

let list: LivePlayer[] = [];
let listAt = 0;
const listeners = new Set<() => void>();

/** Who is around, as last heard, by handle. Empty until the store first answers. */
export function liveNow(): ReadonlyMap<string, LivePlayer> {
  return new Map(list.map(player => [player.handle, player]));
}
export function livePlayers(): readonly LivePlayer[] { return list; }
/** Calls back whenever a new list arrives. Answers the way to stop. */
export function onLive(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

async function timed(url: string, init?: RequestInit): Promise<Response> {
  const abort = new AbortController();
  const timer = window.setTimeout(() => abort.abort(), TIMEOUT_MS);
  try { return await fetch(url, { ...init, signal: abort.signal }); } finally { window.clearTimeout(timer); }
}

/** Asks for the list, unless one arrived in the last few seconds. Never throws: an outage only means no marks. */
export async function refreshLive(force = false): Promise<void> {
  if (!force && Date.now() - listAt < 10_000) return;
  listAt = Date.now();
  try {
    const response = await timed(`${API}/api/live`);
    if (!response.ok) throw new Error(`The live list answered ${response.status}.`);
    list = (await response.json() as LivePayload).players ?? [];
  } catch {
    // Marks that cannot be refreshed come off rather than going stale.
    list = [];
  }
  for (const listener of listeners) listener();
}

/**
 * Keeps this player checked in and the list fresh while the page is on
 * screen. `me` answers null for a player who should not show (no name, a
 * private window, a build with no board); `doing` says what they are up to.
 */
export class Presence {
  private timer = 0;
  private listTimer = 0;
  private last: { key: string; at: number } | null = null;
  private stopped = false;
  private readonly onVisible = () => { if (document.visibilityState === 'visible') { this.send(true); void refreshLive(); } };

  constructor(private readonly me: () => Me | null, private readonly doing: () => Doing) {}

  start() {
    document.addEventListener('visibilitychange', this.onVisible);
    this.timer = window.setInterval(() => this.send(true), CHECK_IN_MS);
    this.listTimer = window.setInterval(() => {
      if (document.visibilityState === 'visible' && this.doing().state !== 'batting') void refreshLive();
    }, LIST_MS);
    this.send(true);
    void refreshLive(true);
  }

  /** Says what this player is doing now, if it changed: an innings starting or ending. */
  changed() { this.send(false); }

  stop() {
    this.stopped = true;
    window.clearInterval(this.timer);
    window.clearInterval(this.listTimer);
    document.removeEventListener('visibilitychange', this.onVisible);
  }

  private send(beat: boolean) {
    if (this.stopped || document.visibilityState !== 'visible') return;
    const me = this.me();
    if (!me) return;
    const doing = this.doing();
    const key = `${me.name}|${me.avatar}|${doing.state}|${doing.mode ?? ''}`;
    const now = Date.now();
    if (this.last && this.last.key === key && (!beat || now - this.last.at < SETTLE_MS)) return;
    this.last = { key, at: now };
    void timed(`${API}/api/live`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playerId: me.playerId, name: me.name, avatar: me.avatar, state: doing.state, mode: doing.mode }),
    }).then(() => { if (!beat) void refreshLive(true); }).catch(() => undefined);
  }
}
