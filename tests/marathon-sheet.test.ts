import { describe, expect, it } from 'vitest';
import { LAUNCH_MS } from '../src/game/leaderboard';
import { MARATHON_BOARD_SIZE, packSolo, packTeam, type SoloRow, type TeamRow } from '../src/game/marathon-board';
import { demoMarathon } from '../src/game/demo-board';
import { marathonBoardMarkup, marathonLaddersMarkup, marathonOffer } from '../src/ui/MarathonBoard';

/**
 * The Test Marathon's board as a screen: the toggle, a row on each ladder, the
 * line under the title, the innings just played under the list, and the
 * fifty `?demo=1` makes up.
 */

const ME = 'mfj2k1-abcdefghijkl';
const AT = LAUNCH_MS + 10 * 86_400_000;
const team = (over: Partial<TeamRow> = {}): TeamRow => {
  const row = { runs: 412, balls: 377, boundaries: 58, ending: 'ALL_OUT' as const, playerId: 'aaaaaa-bbbbbbbbbbbb', name: 'Rohit', avatar: 1, score: 0, ...over };
  return { ...row, score: over.score ?? packTeam(row, AT) };
};
const solo = (over: Partial<SoloRow> = {}): SoloRow => {
  const row = { runs: 143, balls: 210, out: false, order: 1, left: false, playerId: 'aaaaaa-bbbbbbbbbbbb', name: 'Rohit', avatar: 1, score: 0, ...over };
  return { ...row, score: over.score ?? packSolo(row, AT) };
};

describe('the toggle', () => {
  it('offers Team and Individual, the one up lit', () => {
    const html = marathonLaddersMarkup('solo');
    expect(html).toContain('id="board-ladder-team" class="ladder-tab"');
    expect(html).toContain('id="board-ladder-solo" class="ladder-tab is-on"');
    expect(html).toMatch(/>Team<[\s\S]*>Individual</);
  });
});

describe('the team ladder', () => {
  it('reads place, how it ended, name, and runs, balls, strike rate and boundaries', () => {
    const html = marathonBoardMarkup({ ladder: 'team', team: [team()], solo: [] });
    expect(html).toContain('MARATHON &middot; TEAM');
    expect(html).toContain('<i aria-hidden="true">O</i><b>All out</b>');
    const figures = [...html.matchAll(/<em(?: class="is-rate")?>([\d.]+)<b>([^<]+)<\/b><\/em>/g)].map(m => [m[1], m[2]]);
    expect(figures).toEqual([['412', 'runs'], ['377', 'balls'], ['109.3', 'strike rate'], ['58', 'fours and sixes']]);
    expect(html).toContain('Ranked on total runs, then strike rate, then boundaries');
  });

  it('marks each ending with its own letter', () => {
    const html = marathonBoardMarkup({ ladder: 'team', team: [
      team({ ending: 'DECLARED' }), team({ ending: 'BALLS', balls: 500 }), team({ ending: 'RETIRED' }),
    ], solo: [] });
    expect(html).toContain('>D</i><b>Declared</b>');
    expect(html).toContain('>B</i><b>500 balls</b>');
    expect(html).toContain('>R</i><b>Last man retired hurt</b>');
  });

  it('lights your row and says where you stand, or who leads, or that nobody has batted', () => {
    const rows = [team(), team({ playerId: ME, name: 'Virat', runs: 300 })];
    const html = marathonBoardMarkup({ ladder: 'team', team: rows, solo: [], youId: ME });
    expect(html).toContain('You are <b>2nd</b> &mdash; 300 all out.');
    expect(html.match(/is-you/g)).toHaveLength(1);
    expect(marathonBoardMarkup({ ladder: 'team', team: [team()], solo: [] })).toContain('Rohit leads &mdash; 412 all out.');
    expect(marathonBoardMarkup({ ladder: 'team', team: [], solo: [] })).toContain('Nobody has batted yet');
    expect(marathonBoardMarkup({ ladder: 'team', team: [], solo: [], state: 'loading' })).toContain('Fetching the board');
  });

  it('puts the innings just played under the list, with the place it would take', () => {
    const yours = { team: { runs: 500, balls: 400, boundaries: 60, ending: 'DECLARED' as const }, solo: { runs: 210, balls: 300, out: false, order: 1, left: false } };
    const html = marathonBoardMarkup({ ladder: 'team', team: [team()], solo: [], yours, atMs: AT });
    expect(html).toContain('This innings');
    expect(html).toMatch(/board-place">1<[\s\S]*takes the top/);
  });

  it('says what it takes to get on once the fifty are full', () => {
    const rows = Array.from({ length: MARATHON_BOARD_SIZE }, (_, i) => team({ runs: 600 - i, playerId: `p${i}aaaa-bbbbbbbbbbbb` }));
    const yours = { team: { runs: 100, balls: 400, boundaries: 6, ending: 'ALL_OUT' as const }, solo: { runs: 40, balls: 90, out: true, order: 1, left: false } };
    const html = marathonBoardMarkup({ ladder: 'team', team: rows, solo: [], yours, atMs: AT });
    expect(html).toContain('Beat 551 to get on the board');
    expect(html).toContain('not good enough yet');
  });

  it('escapes a name', () => {
    expect(marathonBoardMarkup({ ladder: 'team', team: [team({ name: '<b>x</b>' })], solo: [] })).not.toContain('<b>x</b>');
  });
});

describe('the individual ladder', () => {
  it('reads which of the three he was, his score with the star when not out, and his balls', () => {
    const html = marathonBoardMarkup({ ladder: 'solo', team: [], solo: [solo({ order: 3, left: true })] });
    expect(html).toContain('MARATHON &middot; BATTERS');
    expect(html).toContain('<i aria-hidden="true">3</i>');
    expect(html).toContain('143<i>*</i><b>runs not out</b>');
    expect(html).toContain('<small>left-handed</small>');
    expect(html).toContain('The best of the three batters');
  });

  it('writes an out batter without the star', () => {
    const html = marathonBoardMarkup({ ladder: 'solo', team: [], solo: [solo({ out: true })] });
    expect(html).toContain('143<b>runs</b>');
    expect(html).toContain('Rohit leads &mdash; 143 off 210.');
  });
});

describe('the made-up fifty', () => {
  it('fills both ladders, in board order, with one row on each yours', () => {
    const { team: t, solo: s } = demoMarathon(ME, AT);
    for (const rows of [t, s]) {
      expect(rows).toHaveLength(MARATHON_BOARD_SIZE);
      expect(rows.filter(row => row.playerId === ME)).toHaveLength(1);
      expect(rows.every((row, i) => i === 0 || rows[i - 1].score >= row.score)).toBe(true);
    }
    expect(new Set(t.map(row => row.ending)).size).toBe(4);
    expect(new Set(s.map(row => row.order)).size).toBe(3);
    expect(s.some(row => row.left)).toBe(true);
  });
});

describe('what the card offers', () => {
  const yours = (runs: number, best: number) => ({
    team: { runs, balls: 400, boundaries: 30, ending: 'ALL_OUT' as const },
    solo: { runs: best, balls: 200, out: true, order: 1, left: false },
  });
  const full = (from: number) => ({
    team: Array.from({ length: MARATHON_BOARD_SIZE }, (_, i) => team({ runs: from - i, playerId: `p${i}aaaa-bbbbbbbbbbbb` })),
    solo: Array.from({ length: MARATHON_BOARD_SIZE }, (_, i) => solo({ runs: from - i, playerId: `p${i}aaaa-bbbbbbbbbbbb` })),
  });

  it('says nothing before the boards have been seen', () => {
    expect(marathonOffer(false, { team: [], solo: [] }, yours(400, 150), AT)).toEqual({ kind: 'silent' });
  });

  it('offers the team place where the total makes the board', () => {
    // Twenty rows above on runs, and the one level on 480 used fewer balls.
    expect(marathonOffer(true, full(500), yours(480, 10), AT)).toEqual({ kind: 'claim', place: 22 });
  });

  it('offers the individual place where only one batter does', () => {
    // Thirty above on runs, and the one level on 470 was not out.
    expect(marathonOffer(true, full(500), yours(100, 470), AT)).toEqual({ kind: 'claim', place: 32 });
  });

  it('says the player\'s best stands where this did not beat it, and nothing where it makes neither', () => {
    const rows = full(500);
    rows.team[4] = team({ runs: 496, playerId: ME });
    expect(marathonOffer(true, rows, yours(300, 10), AT, ME)).toEqual({ kind: 'standing', runs: 496, place: 5 });
    expect(marathonOffer(true, full(500), yours(300, 10), AT, ME)).toEqual({ kind: 'silent' });
  });
});
