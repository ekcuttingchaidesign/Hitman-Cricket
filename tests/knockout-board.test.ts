import { describe, expect, it } from 'vitest';
import { handleOf } from '../src/game/handle';
import { foldName } from '../src/server/board-store';
import { creditMatch, knockoutBoards, knockoutStanding, memoryLedger, type KnockoutCredit, type KnockoutStanding } from '../src/server/knockout-ledger';
import { modeMenuMarkup } from '../src/ui/Board';
import { KNOCKOUT_PICKS, finishWord, knockoutBoardView } from '../src/ui/KnockoutBoard';

/**
 * Super Knockout's leaderboard as drawn (`KnockoutBoard.ts`, Figma K13 and
 * L1 to L3): each ladder's figure and line, and what the dock says of the
 * player on it, off the store's own answers.
 */
const ids = Array.from({ length: 4 }, (_, i) => `abcd${String(i).padStart(2, '0')}-abcdefghijkl${i}`);
const names = ['Mojo', 'Tanvi', 'Farhan', 'Gauri'];
const now = Date.UTC(2026, 10, 18, 12);
const credit = (i: number, over: Partial<KnockoutCredit>): KnockoutCredit => ({ id: ids[i], name: names[i], avatar: i, place: 5, runs: 40, points: 0, win: false, stood: false, ran: false, ...over });

async function world() {
  const owners = new Map(ids.map((id, i) => [foldName(names[i]), id]));
  const ledger = memoryLedger(folded => owners.get(folded) ?? null);
  await creditMatch(ledger, [credit(0, { place: 1, runs: 96, points: 10, win: true }), credit(1, { place: 2, runs: 81, points: 5 }), credit(2, { place: 3, runs: 70, points: 2 }), credit(3, { place: 9 })], now);
  await creditMatch(ledger, [credit(1, { place: 1, runs: 88, points: 3, win: true }), credit(0, { place: 6, runs: 30 })], now + 3600_000);
  const boards = await knockoutBoards(ledger, now + 7200_000);
  const standing = async (i: number) => await knockoutStanding(ledger, ids[i], now + 7200_000) as KnockoutStanding;
  return { boards, standing };
}

describe('the Super Knockout leaderboard', () => {
  it('offers the four ladders, the two with a week both ways, points this week first', () => {
    expect(KNOCKOUT_PICKS.map(p => p.key)).toEqual(['points-week', 'points-all', 'wins-week', 'wins-all', 'best', 'rate']);
  });

  it('ranks points with wins and matches under each name', async () => {
    const { boards, standing } = await world();
    const view = knockoutBoardView(boards, await standing(1), 'points-week', { playerId: ids[1], avatar: 1 }, 3);
    expect(view.ladder).toBe('Points · This week');
    expect(view.rows.map(r => [r.place, r.name, r.score, r.sub])).toEqual([
      [1, 'Mojo', '10', '1 win · 2 matches'], [2, 'Tanvi', '8', '1 win · 2 matches'], [3, 'Farhan', '2', '0 wins · 1 match'],
    ]);
    expect(view.rows.map(r => !!r.you)).toEqual([false, true, false]);
    expect(view.rows[0].handle).toBe(handleOf(ids[0]));
    expect(view.rows[0].podiumSub).toBe('1 win');
  });

  it('swaps the figure for the ladder picked', async () => {
    const { boards, standing } = await world();
    const me = { playerId: ids[0], avatar: 0 }, mine = await standing(0);
    expect(knockoutBoardView(boards, mine, 'wins-all', me, 3).rows[0]).toMatchObject({ score: '1', sub: '10 points · 2 matches' });
    expect(knockoutBoardView(boards, mine, 'best', me, 3).rows.map(r => [r.name, r.score])).toEqual([['Mojo', '96'], ['Tanvi', '88'], ['Farhan', '70'], ['Gauri', '40']]);
    expect(knockoutBoardView(boards, mine, 'rate', me, 3).rows).toEqual([]);
  });

  it('says where the player stands, and how far the place above is this week', async () => {
    const { boards, standing } = await world();
    const farhan = knockoutBoardView(boards, await standing(2), 'points-week', { playerId: ids[2], avatar: 2 }, 3);
    expect(farhan.dock).toMatchObject({ sentence: 'You are <em>#3</em> this week', detail: '2 pts · 0 wins · 6 behind #2', score: '2' });
    const top = knockoutBoardView(boards, await standing(0), 'points-all', { playerId: ids[0], avatar: 0 }, 3);
    expect(top.dock!.sentence).toBe('You are <em>#1</em>');
    expect(top.dock!.detail).toBe('10 pts · 1 win');
    // Level on points with the place above: said as level.
    const level = knockoutBoardView(boards, { ...(await standing(2)), behind: 0 }, 'points-week', { playerId: ids[2], avatar: 2 }, 3);
    expect(level.dock!.detail).toBe('2 pts · 0 wins · level with #2');
  });

  it('says how many more matches a win rate takes, and how the first points come', async () => {
    const { boards, standing } = await world();
    const rate = knockoutBoardView(boards, await standing(0), 'rate', { playerId: ids[0], avatar: 0 }, 3);
    expect(rate.dock).toMatchObject({ sentence: 'You are <em>not ranked</em>', detail: '8 more matches for a win rate', score: '50%' });
    const fresh = knockoutBoardView(boards, { ok: true, week: boards.week, career: null, places: { points: { week: null, all: null }, wins: { week: null, all: null }, best: null, rate: null }, behind: null },
      'points-week', { playerId: 'zzzz99-abcdefghijklm', avatar: 3 }, 3);
    expect(fresh.dock).toMatchObject({ sentence: 'You are <em>not on the board</em> yet', detail: 'Finish top 3 in a match of 3 or more real players for your first points.' });
    // A guest has no line of their own.
    expect(knockoutBoardView(boards, null, 'points-week', null, 3).dock).toBeNull();
  });

  it('draws nothing but the picker’s name while the store has not answered', () => {
    const view = knockoutBoardView(null, null, 'wins-week', { playerId: ids[0], avatar: 0 }, 3);
    expect(view).toMatchObject({ rows: [], ladder: 'Wins · This week' });
  });

  it('is offered on the Leaderboard’s mode menu, as a board that opens over it', () => {
    const menu = modeMenuMarkup('classic', [{ mode: 'classic', rank: '#4' }, { mode: 'super10', rank: 'Not on this board yet' }],
      [{ id: 'knockout', name: 'Super Knockout', colour: '#ee2a2a', art: 'art.webp', line: 'Points, wins and totals with friends' }]);
    expect((menu.match(/data-mode="/g) ?? []).length).toBe(2);
    expect(menu).toMatch(/data-also="knockout"[^>]*>[\s\S]*Super Knockout[\s\S]*Points, wins and totals with friends/);
    expect(modeMenuMarkup('classic', [{ mode: 'classic', rank: '#4' }])).not.toContain('data-also');
  });

  it('names a finish for the last five', () => {
    expect([1, 2, 3, 9, 11, 12, 0].map(finishWord)).toEqual(['1st', '2nd', '3rd', '9th', '11th', '12th', 'ran']);
  });
});
