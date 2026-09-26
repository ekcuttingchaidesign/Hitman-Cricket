import { GAME } from '../config/gameplay';
import type { Challenge, ChallengeRow } from './challenge-api';
import type { PlayerStatus } from '../server/challenge-store';
import { figuresOf } from './ball-string';

/**
 * Every state of the match room, on demand, with made-up people.
 *
 *   ?room=lobby      an empty room, link not yet sent
 *   ?room=sent       the link has gone, nobody has joined
 *   ?room=both       a friend is in, nobody has batted
 *   ?room=chase      the friend has batted; you have not
 *   ?room=live       the friend is batting right now; you have not started
 *   ?room=resume     your own innings, left on ball twelve
 *   ?room=waiting    your innings is in, theirs is not
 *   ?room=spectate   your innings is in, theirs is under way
 *   ?room=won ?room=lost ?room=draw ?room=forfeit   the four results
 *   ?room=away       a result found on open, one of two
 *   ?room=expired ?room=void ?room=spectator ?room=group
 *
 * It exists because the room has fourteen faces and two phones can show one
 * at a time. Nothing here touches the server or the browser's own records: it
 * is a picture of a state, drawn from a fixture, and the keys on it do what
 * they always do — which mostly means they try to reach a room that is not
 * there and say so.
 */

export const DEMO_PARAM = 'room';

export const DEMO_KINDS = [
  'lobby', 'sent', 'both', 'chase', 'live', 'resume', 'waiting', 'spectate',
  'won', 'lost', 'draw', 'forfeit', 'away', 'expired', 'void', 'spectator', 'group',
] as const;
export type DemoKind = (typeof DEMO_KINDS)[number];

export function demoWanted(search = location.search): DemoKind | null {
  const kind = new URLSearchParams(search).get(DEMO_PARAM);
  return (DEMO_KINDS as readonly string[]).includes(kind ?? '') ? kind as DemoKind : null;
}

/** Thirty balls that add up to something worth looking at. */
const CARDS = {
  fortySeven: '1402614W0116041202W0104112060'.slice(0, 30).padEnd(30, '1'),
  fortyTwo: '4011W0261402W11040121003120W',
  fiftyOne: '641021401W1062012004W110212041'.slice(0, 30),
  short: '0261410W1W2',
  duck: 'W0W1W',
};

const HOUR = 3600_000;
const DAY = 24 * HOUR;

function row(
  playerId: string, name: string, avatar: number, card: string, status: PlayerStatus,
  over: Partial<ChallengeRow> = {}, now = Date.now(),
): ChallengeRow {
  const figures = figuresOf(card);
  const played = figures.runs * 10_000 + figures.sixes * 100 + figures.fours;
  const score = status === 'done' ? 2_000_000_000 + played : status === 'forfeit' ? 1_000_000_000 + played : status === 'batting' ? 500_000_000 + figures.balls : 0;
  return {
    ...figures, playerId, name, avatar, card, host: false, status,
    joined: now - 2 * HOUR, at: now - HOUR, seen: false, score, ...over,
  };
}

/** The room for one state, seen by `me`. */
export function demoRoom(kind: DemoKind, me: string, now = Date.now()): { room: Challenge; interstitial?: { index: number; total: number }; sent?: boolean } {
  const you = (card: string, status: PlayerStatus, over: Partial<ChallengeRow> = {}) => row(me, 'You', 3, card, status, { host: true, ...over }, now);
  const rahul = (card: string, status: PlayerStatus, over: Partial<ChallengeRow> = {}) => row('demo01-rahulrahulrahul', 'Rahul', 1, card, status, over, now);
  const priya = (card: string, status: PlayerStatus, over: Partial<ChallengeRow> = {}) => row('demo02-priyapriyapriya', 'Priya', 0, card, status, over, now);
  const amit = (card: string, status: PlayerStatus, over: Partial<ChallengeRow> = {}) => row('demo03-amitamitamitam', 'Amit', 4, card, status, over, now);
  const base = (players: ChallengeRow[], state: Challenge['state'], over: Partial<Challenge> = {}): Challenge => ({
    code: 'DEMO42', state, host: players.find(one => one.host)?.playerId ?? me,
    at: now - 6 * HOUR, expiresAt: now + 7 * DAY - 6 * HOUR, v: 1, rematchOf: null, size: 20,
    players: [...players].sort((a, b) => b.score - a.score || a.joined - b.joined), ...over,
  });
  switch (kind) {
    case 'lobby': return { room: base([you('', 'joined')], 'open'), sent: false };
    case 'sent': return { room: base([you('', 'joined')], 'open'), sent: true };
    case 'both': return { room: base([you('', 'joined'), rahul('', 'joined', { at: now - 20_000 })], 'open'), sent: true };
    case 'chase': return { room: base([you('', 'joined', { host: false }), rahul(CARDS.fortySeven, 'done', { host: true, at: now - DAY })], 'live') };
    case 'live': return { room: base([you('', 'joined', { host: false }), rahul(CARDS.fortySeven.slice(0, 14), 'batting', { host: true, at: now - 4000 })], 'live') };
    case 'resume': return { room: base([you(CARDS.fortySeven.slice(0, 12), 'batting', { at: now - 20 * 60_000 }), rahul('', 'joined')], 'live') };
    case 'waiting': return { room: base([you(CARDS.fortySeven, 'done'), rahul('', 'joined')], 'live'), sent: true };
    case 'spectate': return { room: base([you(CARDS.fortySeven, 'done'), rahul(CARDS.fiftyOne.slice(0, 26), 'batting', { at: now - 3000 })], 'live') };
    case 'won': return { room: base([you(CARDS.fortySeven, 'done', { at: now - DAY }), rahul(CARDS.fortyTwo, 'done')], 'done') };
    case 'lost': return { room: base([you(CARDS.fortyTwo, 'done'), rahul(CARDS.fortySeven, 'done', { at: now - DAY })], 'done') };
    case 'draw': return { room: base([you(CARDS.fortySeven, 'done', { at: now - DAY }), rahul(CARDS.fortySeven, 'done')], 'done') };
    case 'forfeit': return { room: base([you(CARDS.fortySeven, 'done', { at: now - 2 * DAY }), rahul(CARDS.short, 'forfeit', { at: now - 30 * HOUR })], 'done') };
    case 'away': return { room: base([you(CARDS.fortySeven, 'done', { at: now - 2 * DAY }), rahul(CARDS.fiftyOne, 'done')], 'done'), interstitial: { index: 1, total: 2 } };
    case 'expired': return { room: base([you(CARDS.fortySeven, 'done', { at: now - 7 * DAY }), rahul('', 'joined', { at: now - 7 * DAY })], 'expired', { at: now - 8 * DAY, expiresAt: now - DAY }) };
    case 'void': return { room: base([you(CARDS.fortySeven, 'done'), rahul(CARDS.fortyTwo, 'done')], 'void', { v: 0 }) };
    case 'spectator': return { room: base([rahul(CARDS.fortySeven, 'done', { host: true, at: now - 2 * DAY }), priya(CARDS.fortyTwo, 'done', { at: now - DAY })], 'expired', { at: now - 8 * DAY, expiresAt: now - DAY }) };
    case 'group': return {
      room: base([
        amit(CARDS.fiftyOne, 'done', { at: now - 3 * HOUR }), you(CARDS.fortySeven, 'done', { at: now - 2 * HOUR }),
        priya(CARDS.duck, 'done', { at: now - HOUR }), rahul(CARDS.fortyTwo.slice(0, 9), 'batting', { at: now - 5000 }),
      ], 'live'),
    };
  }
}

/** The balls in a demo card, for anything that wants to check the fixture adds up. */
export const DEMO_TOTAL_BALLS = GAME.totalBalls;
