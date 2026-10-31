import { ownsHandle } from './handle';
import type { Challenge, ChallengeMode, InviteView, RivalryEntry } from './challenge-api';

/**
 * A challenge sent from a profile (Figma section 23), as the screens tell it:
 * what a Rival Matches row says, what a profile's foot offers, which
 * challenges wait on this player, the aim on the card before the first ball,
 * the record between two players in one mode, and the seed both innings are
 * bowled from. The rules are the store's (`server/challenge-store.ts`); this
 * only reads the rooms it answered with.
 */

const HOUR = 3_600_000;
/** From the store: a nudge waits three hours, and a decline makes the sender wait a day. */
export const NUDGE_AFTER_MS = 3 * HOUR;
export const DECLINE_WAIT_MS = 24 * HOUR;
export const INVITES_OPEN = 5;

export const MODE_WORD: Record<ChallengeMode, string> = { classic: 'The Blast', super10: 'Super10' };
/** The most a mode can score: the aim is never above it. */
const MODE_MOST: Record<ChallengeMode, number> = { classic: 180, super10: 360 };

/** Hours, rounded up, as a row says them: 5h, 23h; under an hour, 45m. */
export function left(ms: number): string {
  if (ms <= 0) return '0m';
  if (ms < HOUR) return `${Math.max(1, Math.ceil(ms / 60_000))}m`;
  return `${Math.ceil(ms / HOUR)}h`;
}

const hostOf = (room: Challenge) => room.players.find(one => one.host) ?? null;
const sentByMe = (room: Challenge, me: string) => { const host = hostOf(room); return !!host && ownsHandle(host.handle, me); };
const forMe = (room: Challenge, me: string) => !!room.invite && ownsHandle(room.invite.to, me);

/** The challenges waiting on this player to answer: nudged first, then the soonest to run out. */
export function waitingOnMe(rooms: readonly Challenge[], me: string): Challenge[] {
  return rooms
    .filter(room => forMe(room, me) && room.invite!.state === 'waiting')
    .sort((a, b) => Number(!!b.invite!.nudged) - Number(!!a.invite!.nudged) || (a.invite!.answerBy ?? 0) - (b.invite!.answerBy ?? 0));
}

/** Their total, the one this player chases. */
export function totalOf(room: Challenge): number | null {
  const host = hostOf(room);
  return host && host.status === 'done' ? host.runs : null;
}

/** What a Rival Matches row says about a challenge from a profile, over what the room alone would say. */
export interface InviteRow {
  note: string;
  /** ANSWER on the row: opens the invite sheet. */
  answer?: boolean;
  /** NUDGE on the row, ready or not yet, or done. */
  nudge?: { ready: boolean; label: string };
  /** AGAIN on the row: their profile, to challenge them again. */
  again?: boolean;
  outcome?: 'W' | 'L' | 'D' | '—';
  verdict?: string;
}

export function inviteRow(room: Challenge, me: string, now = Date.now()): InviteRow | null {
  const invite = room.invite;
  if (!invite) return null;
  const mode = room.mode === 'super10' ? 'Super10 · ' : '';
  const mine = sentByMe(room, me);
  const total = totalOf(room);
  switch (invite.state) {
    case 'waiting':
      if (!mine) return { note: `${mode}chase ${total ?? '—'} · ${left((invite.answerBy ?? now) - now)} left${invite.nudged ? ' · nudged' : ''}`, answer: true };
      return { note: `${mode}challenge sent · ${left((invite.answerBy ?? now) - now)} left`, nudge: nudgeOf(invite, now) };
    case 'setting': return mine ? { note: `${mode}your innings · finish to send it` } : null;
    case 'declined': {
      if (!mine) return { note: `${mode}you declined`, outcome: '—', verdict: 'Declined' };
      const wait = declineWait(room, now);
      return { note: wait > 0 ? `${mode}again in ${left(wait)}` : `${mode}challenge them again`, outcome: '—', verdict: 'Declined', again: wait <= 0 };
    }
    case 'unanswered': return mine ? { note: `${mode}no answer`, outcome: '—', verdict: 'No answer', again: true } : { note: `${mode}ran out`, outcome: '—', verdict: 'Ran out' };
    case 'withdrawn': return mine ? { note: `${mode}not sent`, outcome: '—', verdict: 'Not sent' } : null;
    default: return null;
  }
}

function nudgeOf(invite: InviteView, now: number): { ready: boolean; label: string } {
  if (invite.nudged) return { ready: false, label: 'Nudged' };
  const wait = (invite.sentAt ?? now) + NUDGE_AFTER_MS - now;
  return wait > 0 ? { ready: false, label: `Nudge in ${left(wait)}` } : { ready: true, label: 'Nudge' };
}

/** How long the sender still waits after a decline. */
function declineWait(room: Challenge, now: number): number {
  const them = room.players.find(one => !one.host);
  return (them?.at ?? 0) + DECLINE_WAIT_MS - now;
}

/** What a profile's foot offers, between this player and the one on show (Figma 23, D3). */
export type FootState =
  | { kind: 'challenge' }
  | { kind: 'answer'; room: Challenge }
  | { kind: 'sent'; room: Challenge; nudge: { ready: boolean; label: string } }
  | { kind: 'batting'; room: Challenge }
  | { kind: 'declined'; wait: number }
  | { kind: 'full' };

export function footState(rooms: readonly Challenge[], me: string, handle: string, now = Date.now()): FootState {
  let open = 0;
  let declined = 0;
  for (const room of rooms) {
    const invite = room.invite;
    if (!invite) continue;
    const mine = sentByMe(room, me);
    if (mine && (invite.state === 'setting' || invite.state === 'waiting')) open++;
    const pair = mine ? invite.to === handle : forMe(room, me) && hostOf(room)?.handle === handle;
    if (!pair) continue;
    if (invite.state === 'waiting') return mine ? { kind: 'sent', room, nudge: nudgeOf(invite, now) } : { kind: 'answer', room };
    if (invite.state === 'accepted' && room.state === 'live') return { kind: 'batting', room };
    if (invite.state === 'declined' && mine) declined = Math.max(declined, declineWait(room, now));
  }
  if (declined > 0) return { kind: 'declined', wait: declined };
  return open >= INVITES_OPEN ? { kind: 'full' } : { kind: 'challenge' };
}

/**
 * The aim on the card before the first ball: a little past what they average
 * in the mode, to the next ten, near the setter's own best and never past what
 * the mode can score. Only a suggestion: their total is the only target.
 */
export function aimFor(theirAverage: number | null, myBest: number | null, mode: ChallengeMode): number | null {
  if (!theirAverage || theirAverage <= 0) return null;
  const aim = Math.ceil((theirAverage * 1.25) / 10) * 10;
  const near = myBest && myBest > 0 ? Math.ceil((myBest + 20) / 10) * 10 : aim;
  return Math.max(10, Math.min(aim, near, MODE_MOST[mode]));
}

/** The record between this player and one other in one mode, as this browser saw the results land. */
export function recordIn(entries: readonly RivalryEntry[], handle: string, mode: ChallengeMode): { won: number; lost: number; drawn: number; form: ('W' | 'L' | 'D')[] } {
  const here = entries.filter(one => one.them.handle === handle && (one.mode ?? 'classic') === mode).sort((a, b) => b.at - a.at);
  return {
    won: here.filter(one => one.outcome === 'W').length,
    lost: here.filter(one => one.outcome === 'L').length,
    drawn: here.filter(one => one.outcome === 'D').length,
    form: here.slice(0, 5).map(one => one.outcome),
  };
}

/** The seed both innings of a challenge are bowled from, so the chaser faces the same balls. */
export function roomSeed(code: string): number {
  let h = 2166136261;
  for (const char of code) { h ^= char.charCodeAt(0); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

/**
 * Innings in a challenge that this player left without saying so: the game
 * was closed or reloaded mid-innings. Leaving is a loss, settled when they
 * next open the game; for the challenger it is a total never set.
 */
export function leftBehind(rooms: readonly Challenge[], me: string, playing: string | null): Challenge[] {
  return rooms.filter(room => room.invite && room.code !== playing
    && room.players.some(one => ownsHandle(one.handle, me) && one.status === 'batting'));
}
