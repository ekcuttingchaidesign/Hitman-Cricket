import type { Challenge } from './challenge-api';
import { ownsHandle } from './handle';
import { DECLINE_WAIT_MS, left, totalOf } from './invite';
import type { OwnActivity } from './profile-api';

/**
 * The Notifications screen (Figma section 23, lane E): the latest of what
 * happened to this player, gathered from the two things the store already
 * answers — their rooms (`/api/challenge?player=`) and their profile's
 * activity (`/api/profile?player=`) — so nothing new is kept for it.
 *
 * Every item is one of three kinds, which are the screen's filters:
 * challenges (one waiting on you, theirs being batted, declined, unanswered),
 * results (a match settled), and the board (chased, beaten, surpassed). A
 * challenge waiting on you is in NEEDS YOU at the top; the rest are TODAY and
 * EARLIER. Thirty days, newest fifty.
 *
 * Seen is this browser's, by time (`hitman-notices-seen`): an item newer than
 * the last time the screen was opened is new. The bell counts the new ones
 * and every challenge still waiting on you, so opening clears the first and
 * answering the second.
 */

export type NoticeFilter = 'all' | 'challenges' | 'results' | 'board';
export type NoticeMode = 'classic' | 'super10' | 'marathon' | 'survive';

export interface Notice {
  /** Stable across reads, for the row's key and a test. */
  id: string;
  kind: Exclude<NoticeFilter, 'all'>;
  at: number;
  /** A challenge waiting on this player: NEEDS YOU, and in the bell's count until answered. */
  needsYou: boolean;
  face: { handle: string; name: string; avatar: number };
  title: string;
  mode: NoticeMode;
  /** After the mode: what it left, or how long. */
  sub: string;
  /** The one key on the row. */
  key: { kind: 'answer'; code: string } | { kind: 'again'; handle: string } | { kind: 'winback'; event: number } | null;
  /** A settled match's verdict. */
  chip: 'W' | 'L' | 'D' | null;
  /** The room a challenge or result opens. */
  code: string | null;
}

export const NOTICE_DAYS = 30;
export const NOTICES_KEPT = 50;
const HOUR = 3_600_000, DAY = 24 * HOUR;
export const SEEN_KEY = 'hitman-notices-seen';

export const MODE_NAME: Record<NoticeMode, string> = { classic: 'The Blast', super10: 'Super10', marathon: 'Test Marathon', survive: 'Test Survival' };

/** How long ago, as the row says it: now, 5m, 3h, 2d. */
export function agoOf(at: number, now: number): string {
  const gap = Math.max(0, now - at);
  if (gap < 60_000) return 'now';
  if (gap < HOUR) return `${Math.floor(gap / 60_000)}m`;
  if (gap < DAY) return `${Math.floor(gap / HOUR)}h`;
  return `${Math.floor(gap / DAY)}d`;
}

/** One room, as the notice it makes for this player, or none. */
function roomNotice(room: Challenge, me: string, now: number): Notice | null {
  const mode: NoticeMode = room.mode === 'super10' ? 'super10' : 'classic';
  const host = room.players.find(one => one.host) ?? null;
  const mine = !!host && ownsHandle(host.handle, me);
  const other = room.players.find(one => !ownsHandle(one.handle, me)) ?? null;
  const invite = room.invite ?? null;
  const base = { mode, code: room.code, chip: null, key: null, needsYou: false } as const;

  // A settled match is a result, whichever way it was made.
  if (room.state === 'done') {
    // The room's own order decides it: the rival the line is about is the best of the others.
    const mineRow = room.players.find(one => ownsHandle(one.handle, me));
    const them = room.players.filter(one => !ownsHandle(one.handle, me)).sort((a, b) => b.score - a.score)[0];
    if (!mineRow || !them) return null;
    const view = { outcome: (mineRow.score > them.score ? 'W' : mineRow.score < them.score ? 'L' : 'D') as 'W' | 'L' | 'D' };
    const at = Math.max(...room.players.map(one => one.at));
    const score = ` · ${mineRow.runs}–${them.runs}`;
    const title = mineRow.status === 'forfeit' ? `You walked out on ${them.name}`
      : them.status === 'forfeit' ? `${them.name} walked out`
        : view.outcome === 'W' ? `You beat ${them.name}${score}`
          : view.outcome === 'L' ? `${them.name} beat you${score}` : `Dead heat with ${them.name}${score}`;
    return { ...base, id: `room:${room.code}:done`, kind: 'results', at, face: face(them), title, sub: agoOf(at, now), chip: view.outcome };
  }
  if (!invite) return null;

  switch (invite.state) {
    case 'waiting': {
      if (mine || !host) return null;
      const total = totalOf(room);
      return {
        ...base, id: `room:${room.code}:waiting`, kind: 'challenges', at: invite.sentAt ?? room.at, needsYou: true,
        face: face(host), title: `${host.name} challenged you`,
        sub: `chase ${total ?? '—'} · ${left((invite.answerBy ?? now) - now)} left${invite.nudged ? ' · nudged' : ''}`,
        key: { kind: 'answer', code: room.code },
      };
    }
    case 'accepted': {
      // Theirs, being batted: the setter is told; the chaser is batting it.
      if (!mine || !other || room.state !== 'live') return null;
      return { ...base, id: `room:${room.code}:batting`, kind: 'challenges', at: other.joined, face: face(other), title: `${other.name} is batting your challenge`, sub: agoOf(other.joined, now) };
    }
    case 'declined': {
      if (!mine || !other) return null;
      const wait = other.at + DECLINE_WAIT_MS - now;
      return {
        ...base, id: `room:${room.code}:declined`, kind: 'challenges', at: other.at, face: face(other),
        title: `${other.name} declined your challenge`, sub: wait > 0 ? `again in ${left(wait)}` : agoOf(other.at, now),
        key: wait > 0 ? null : { kind: 'again', handle: other.handle },
      };
    }
    case 'unanswered': {
      if (!mine) return null;
      const at = invite.answerBy ?? room.at;
      return {
        ...base, id: `room:${room.code}:unanswered`, kind: 'challenges', at, face: { handle: invite.to, name: invite.name, avatar: invite.avatar },
        title: `${invite.name} didn’t answer`, sub: agoOf(at, now), key: { kind: 'again', handle: invite.to },
      };
    }
    default: return null;
  }
}

const face = (row: { handle: string; name: string; avatar: number }) => ({ handle: row.handle, name: row.name, avatar: row.avatar });

type Event = OwnActivity['events'][number];

/** What a board event says, in a line. */
export function boardTitle(event: Event): string {
  if (event.result && event.kind === 'beat') {
    const theirs = event.result.theirs.kind;
    return theirs === 'won' ? `${event.name} won faster than you` : theirs === 'drawn' ? `${event.name} beat your draw` : `${event.name} outlasted you`;
  }
  if (event.result && event.kind === 'short') return `${event.name} chased your result`;
  if (event.kind === 'short') return `${event.name} chased your ${event.target}`;
  // Every pass moves them down one, and so does a beat unless the chaser was already above.
  const dropped = event.kind === 'passed' || event.dropped !== false;
  if (dropped && event.place === 2) return `${event.name} took #1 from you`;
  return event.kind === 'beat' ? `${event.name} beat your ${event.target} with ${event.runs}` : `${event.name} surpassed you`;
}

function boardSub(event: Event): string {
  if (event.result && event.kind === 'short') return 'Fell short';
  if (event.kind === 'short') return `Fell ${Math.max(1, event.target - event.runs)} short`;
  return event.place ? `You’re #${event.place} now` : 'Off your place';
}

/** Every notice for this player, newest first and NEEDS YOU before everything, thirty days and fifty at most. */
export function noticesOf(rooms: readonly Challenge[], activity: OwnActivity | null, me: string, now = Date.now()): Notice[] {
  const out: Notice[] = [];
  for (const room of rooms) {
    const notice = roomNotice(room, me, now);
    if (notice) out.push(notice);
  }
  (activity?.events ?? []).forEach((event, at) => {
    const winnable = (event.kind === 'beat' || event.kind === 'passed') && !event.wonBack;
    out.push({
      id: `event:${event.handle}:${event.at}:${event.kind}`, kind: 'board', at: event.at, needsYou: false,
      face: { handle: event.handle, name: event.name, avatar: event.avatar }, title: boardTitle(event),
      mode: event.mode, sub: `${boardSub(event)} · ${agoOf(event.at, now)}`, key: winnable ? { kind: 'winback', event: at } : null,
      chip: null, code: null,
    });
  });
  return out
    .filter(one => one.needsYou || now - one.at < NOTICE_DAYS * DAY)
    .sort((a, b) => Number(b.needsYou) - Number(a.needsYou) || b.at - a.at)
    .slice(0, NOTICES_KEPT);
}

/** The bell's count: everything newer than the last look, and every challenge still waiting on you. */
export function unseenCount(notices: readonly Notice[], seenAt: number): number {
  return notices.filter(one => one.needsYou || one.at > seenAt).length;
}

/** The count as the bell shows it: nothing at none, 1 to 9, then 9+. */
export const bellLabel = (count: number): string => (count <= 0 ? '' : count > 9 ? '9+' : String(count));

/** The screen's groups under one filter: NEEDS YOU, TODAY, EARLIER, each only where it has something. */
export function noticeGroups(notices: readonly Notice[], filter: NoticeFilter, now = Date.now()): { title: string; notices: Notice[] }[] {
  const shown = notices.filter(one => filter === 'all' || one.kind === filter);
  return [
    { title: 'NEEDS YOU', notices: shown.filter(one => one.needsYou) },
    { title: 'TODAY', notices: shown.filter(one => !one.needsYou && now - one.at < DAY) },
    { title: 'EARLIER', notices: shown.filter(one => !one.needsYou && now - one.at >= DAY) },
  ].filter(group => group.notices.length);
}

export function readSeen(): number {
  try { return Number(localStorage.getItem(SEEN_KEY)) || 0; } catch { return 0; }
}
export function writeSeen(at: number) {
  try { localStorage.setItem(SEEN_KEY, String(at)); } catch { /* Then the bell counts them again next visit. */ }
}
