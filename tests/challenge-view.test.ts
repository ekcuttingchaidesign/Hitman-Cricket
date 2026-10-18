import { handleOf } from '../src/game/handle';
import { beforeAll, describe, expect, it } from 'vitest';
import type { Challenge, ChallengeRow } from '../src/game/challenge-api';
import type { PlayerStatus } from '../src/server/challenge-store';
import { figuresOf } from '../src/game/ball-string';
import { resultView, roomView, sortList } from '../src/game/Challenge';

/**
 * The room as one person reads it, in a group. Two people is easy: whoever
 * scored more won. Three found the bug this file exists for: the headline was
 * written against the nearest rival, so a person who lost to two others was
 * told the nearer of them had won, while the fire and the rows named the top.
 */

const HOUR = 3600_000;
const me = 'me0000-meeeeeeeeeeee';

function row(playerId: string, name: string, card: string, status: PlayerStatus, joined: number): ChallengeRow {
  const figures = figuresOf(card);
  const played = figures.runs * 10_000 + figures.sixes * 100 + figures.fours;
  const score = status === 'done' ? 2_000_000_000 + played : status === 'batting' ? 500_000_000 + figures.balls : 0;
  return { ...figures, handle: handleOf(playerId), name, avatar: 1, card, host: false, status, joined, at: joined + HOUR, seen: false, score };
}

function room(players: ChallengeRow[], state: Challenge['state'] = 'done'): Challenge {
  return { code: 'ABCDEF', state, host: players[0].handle, at: 0, expiresAt: 7 * 24 * HOUR, v: 1, rematchOf: null, size: 20, players };
}

const thirty = (runs: string) => runs.padEnd(30, '0');
const p1 = () => row('p10000-p1p1p1p1p1p1p1', 'Shashank', thirty('66664444'), 'done', 1);     // 40
const p2 = () => row(me, 'Me', thirty('444'), 'done', 2);                                    // 12
const p3 = () => row('p30000-p3p3p3p3p3p3p3', 'Long user name', thirty('666666666'), 'done', 3); // 54

beforeAll(() => {
  // The view builds a share link off the page's address.
  Object.defineProperty(globalThis, 'location', {
    value: { pathname: '/', origin: 'https://example.test', search: '' }, configurable: true,
  });
});

describe('a group result', () => {
  it('names whoever finished top, not the nearest rival', () => {
    const view = resultView(room([p1(), p2(), p3()]), me)!;
    expect(view.title).toBe('Long user name Wins');
    expect(view.winner?.handle).toBe(p3().handle);
    expect(view.players.map(one => one.name)).toEqual(['Long user name', 'Shashank', 'Me']);
    expect(view.outcome).toBe('L');
    expect(view.them?.name).toBe('Long user name');
  });

  it('is yours when you finished top, and the words are about the runner-up', () => {
    const mine = { ...p2(), ...figuresOf(thirty('666666666666')), score: 2_000_000_000 + 72 * 10_000 + 12 * 100 };
    const view = resultView(room([p1(), mine, p3()]), me)!;
    expect(view.title).toBe('You Win');
    expect(view.winner?.handle).toBe(handleOf(me));
    expect(view.them?.name).toBe('Long user name');
  });

  it('has no winner to burn for when the top is shared', () => {
    const level = { ...p1(), ...figuresOf(p3().card), score: p3().score };
    const view = resultView(room([level, p2(), p3()]), me)!;
    expect(view.winner).toBeNull();
    expect(view.title).toBe('Dead Heat');
  });
});

describe('the room while a third person is still batting', () => {
  it('shows no result until the last innings is in', () => {
    const batting = row('p30000-p3p3p3p3p3p3p3', 'Long user name', '6666', 'batting', 3);
    const view = roomView(room([p1(), p2(), batting], 'live'), me, true);
    expect(view.kind).toBe('spectate');
    expect(view.result).toBeNull();
    // What they need is measured off the leader, not off this person.
    expect(view.live?.needs).toBe('needs 17 off 26 balls');
  });

  it('and gives the result once they are done', () => {
    const view = roomView(room([p1(), p2(), p3()]), me, true);
    expect(view.kind).toBe('result');
    expect(view.result?.title).toBe('Long user name Wins');
  });
});

describe('the list', () => {
  const room2 = (code: string, players: ChallengeRow[], state: Challenge['state']) => ({ ...room(players, state), code, host: players[0].handle });

  it('leaves off a room nobody joined and this person never batted in', () => {
    const empty = room2('EMPTY1', [row(me, 'Me', '', 'joined', 1)], 'open');
    const batted = room2('SOLO01', [row(me, 'Me', thirty('444'), 'done', 1)], 'live');
    const fromThem = room2('THEIRS', [row('p10000-p1p1p1p1p1p1p1', 'Shashank', thirty('6'), 'done', 1), row(me, 'Me', '', 'joined', 2)], 'live');
    const list = sortList([empty, batted, fromThem], me);
    expect(list.yourMove.map(one => one.code)).toEqual(['THEIRS']);
    // Batted alone, still waiting for somebody to come: that one stays.
    expect(list.waitingOnThem.map(one => one.code)).toEqual(['SOLO01']);
    expect([...list.yourMove, ...list.waitingOnThem, ...list.done].map(one => one.code)).not.toContain('EMPTY1');
  });
});
