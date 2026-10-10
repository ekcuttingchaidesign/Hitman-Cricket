import { describe, expect, it } from 'vitest';
import { HEALTH } from '../src/config/survive';
import { MARATHON } from '../src/config/marathon';
import { LAUNCH_MS } from '../src/game/leaderboard';
import {
  MARATHON_BOARD_SIZE, SOLO_PACKED_BITS, TEAM_PACKED_BITS, marathonPlausible, marathonQualifies, packSolo, packTeam,
  readMarathonFigures, soloOf, strikeRate, teamOf, unpackSolo, unpackTeam,
  type MarathonBatterFigures, type MarathonFigures, type SoloInnings, type TeamInnings,
} from '../src/game/marathon-board';
import {
  MARATHON_SOLO_LADDER, MARATHON_TEAM_LADDER, readMarathon, refused, submitMarathon, submitScore, SURVIVE_LADDER,
  type Submission,
} from '../src/server/board-store';
import { memoryStore } from '../src/server/memory-store';
import type { SurviveInnings } from '../src/game/survive-board';

/**
 * The Test Marathon's two ladders (`docs/MARATHON.md`, "The leaderboards"):
 * the order each rung puts innings in, that both still fit a double, the
 * individual row taken from the best of the three, every shape of innings the
 * mode cannot produce, and one submission writing both rows.
 */

const AT = LAUNCH_MS + 90 * 86_400_000;

/** A batter whose figures add up: runs out of fours and singles, a blow or two if he was hurt. */
function batter(runs: number, balls: number, how: 'out' | 'retired' | 'in' = 'out', left = false): MarathonBatterFigures {
  const fours = Math.min(Math.floor(runs / 4), Math.floor(balls / 2));
  const retired = how === 'retired';
  return {
    runs, balls, fours, sixes: 0, out: how === 'out', retired, left,
    blows: retired ? 3 : 0, health: retired ? 0 : HEALTH.full,
  };
}
/** A whole innings from its batters, the side's figures summed off them. */
function innings(ending: MarathonFigures['ending'], ...batters: MarathonBatterFigures[]): MarathonFigures {
  const sum = (pick: (b: MarathonBatterFigures) => number) => batters.reduce((t, b) => t + pick(b), 0);
  return { runs: sum(b => b.runs), balls: sum(b => b.balls), fours: sum(b => b.fours), sixes: sum(b => b.sixes), ending, batters };
}
const allOut = () => innings('ALL_OUT', batter(143, 210), batter(61, 90), batter(12, 30));

describe('the team ladder', () => {
  const team = (runs: number, balls: number, boundaries = 10): TeamInnings => ({ runs, balls, boundaries, ending: 'ALL_OUT' });

  it('fits a double, with its clock in minutes', () => {
    expect(TEAM_PACKED_BITS).toBe(51);
    expect(TEAM_PACKED_BITS).toBeLessThanOrEqual(53);
    expect(Number.isSafeInteger(packTeam(team(2047, 0, 511), LAUNCH_MS))).toBe(true);
  });

  it('ranks on total runs first', () => {
    expect(packTeam(team(301, 480, 0), AT)).toBeGreaterThan(packTeam(team(300, 100, 60), AT));
  });

  it('then on strike rate, as fewer balls for the same runs', () => {
    expect(packTeam(team(300, 250), AT)).toBeGreaterThan(packTeam(team(300, 251), AT));
  });

  it('then on boundaries, then on who got there first', () => {
    expect(packTeam(team(300, 250, 31), AT)).toBeGreaterThan(packTeam(team(300, 250, 30), AT));
    expect(packTeam(team(300, 250), AT)).toBeGreaterThan(packTeam(team(300, 250), AT + 60_000));
    // Inside the same minute the clock does not split them.
    expect(packTeam(team(300, 250), AT)).toBe(packTeam(team(300, 250), AT + 30_000));
  });

  it('comes apart again', () => {
    const back = unpackTeam(packTeam(team(412, 377, 58), AT));
    expect(back).toMatchObject({ runs: 412, balls: 377, boundaries: 58 });
    expect(back.atMs).toBe(AT);
  });
});

describe('the individual ladder', () => {
  const one = (runs: number, balls: number, out = true): SoloInnings => ({ runs, balls, out, order: 1, left: false });

  it('fits a double, with its clock in seconds', () => {
    expect(SOLO_PACKED_BITS).toBe(49);
    expect(Number.isSafeInteger(packSolo(one(2047, 0, false), LAUNCH_MS))).toBe(true);
  });

  it('ranks on runs, then not out above out, then fewer balls, then who got there first', () => {
    expect(packSolo(one(144, 300), AT)).toBeGreaterThan(packSolo(one(143, 100, false), AT));
    expect(packSolo(one(143, 300, false), AT)).toBeGreaterThan(packSolo(one(143, 100, true), AT));
    expect(packSolo(one(143, 199), AT)).toBeGreaterThan(packSolo(one(143, 200), AT));
    expect(packSolo(one(143, 200), AT)).toBeGreaterThan(packSolo(one(143, 200), AT + 1000));
  });

  it('comes apart again', () => {
    expect(unpackSolo(packSolo(one(143, 210, false), AT))).toEqual({ runs: 143, out: false, balls: 210, atMs: AT });
  });
});

describe('the rows an innings makes', () => {
  it('puts the side on the team board, boundaries counted together', () => {
    const made = teamOf(allOut());
    expect(made).toEqual({ runs: 216, balls: 330, boundaries: made.boundaries, ending: 'ALL_OUT' });
    expect(made.boundaries).toBe(allOut().fours + allOut().sixes);
  });

  it('puts the best of the three on the individual board, with which of them he was', () => {
    expect(soloOf(innings('ALL_OUT', batter(20, 40), batter(88, 150, 'out', true), batter(30, 50)))).toEqual({
      runs: 88, balls: 150, out: true, order: 2, left: true,
    });
    // Not out beats out on the same runs, wherever he batted.
    expect(soloOf(innings('DECLARED', batter(50, 80), batter(50, 90, 'in'))).order).toBe(2);
  });

  it('shows a strike rate to one place, and never divides by nought', () => {
    expect(strikeRate(216, 330)).toBe(65.5);
    expect(strikeRate(0, 0)).toBe(0);
  });

  it('is worth offering while the fifty are not full, and then only above the fiftieth', () => {
    expect(marathonQualifies(1, [])).toBe(true);
    const full = Array.from({ length: MARATHON_BOARD_SIZE }, (_, i) => ({ score: 1000 - i }));
    expect(marathonQualifies(950, full)).toBe(false);
    expect(marathonQualifies(952, full)).toBe(true);
  });
});

describe('what could have happened', () => {
  const ok = (made: MarathonFigures) => expect(marathonPlausible(made), JSON.stringify(made)).toBe(true);
  const no = (made: MarathonFigures, why: string) => expect(marathonPlausible(made), why).toBe(false);

  it('takes every ending the mode produces', () => {
    ok(allOut());
    ok(innings('RETIRED', batter(40, 60), batter(30, 50), batter(9, 20, 'retired')));
    ok(innings('DECLARED', batter(143, 210), batter(20, 40, 'in')));
    // Five hundred balls with two used, the second still in, and with all three.
    ok(innings('BALLS', batter(200, 300), batter(150, 200, 'in')));
    ok(innings('BALLS', batter(200, 300), batter(100, 150, 'retired'), batter(30, 50, 'in')));
    // The new man walked out and the player declared before he faced.
    ok(innings('DECLARED', batter(120, 130), batter(0, 0, 'in')));
  });

  it('refuses more than five hundred balls, or more than six a ball', () => {
    no(innings('BALLS', batter(200, 300), batter(150, 201, 'in')), 'five hundred and one balls');
    const greedy = innings('ALL_OUT', batter(143, 20), batter(1, 1), batter(1, 1));
    no(greedy, 'more than six a ball');
  });

  it('refuses figures that do not add up to the side', () => {
    no({ ...allOut(), runs: allOut().runs + 1 }, 'runs');
    no({ ...allOut(), balls: allOut().balls - 1 }, 'balls');
    no({ ...allOut(), fours: allOut().fours + 1 }, 'fours');
  });

  it('refuses a batter who gave way while still in', () => {
    no(innings('ALL_OUT', batter(40, 60, 'in'), batter(30, 50), batter(9, 20)), 'the opener never left');
  });

  it('refuses an ending its figures do not bear out', () => {
    no(innings('ALL_OUT', batter(40, 60), batter(30, 50)), 'all out with two batters');
    no(innings('RETIRED', batter(40, 60), batter(30, 50), batter(9, 20)), 'retired with the third out');
    no(innings('BALLS', batter(200, 300), batter(150, 199, 'in')), 'balls at four hundred and ninety-nine');
    no(innings('BALLS', batter(200, 300), batter(100, 150), batter(30, 50)), 'balls with the third man out');
    no(innings('DECLARED', batter(60, 100), batter(10, 19, 'in')), `a declaration before ball ${MARATHON.declareFrom}`);
    no(innings('DECLARED', batter(143, 210), batter(20, 40)), 'a declaration with the man in out');
    no({ ...allOut(), ending: 'WON' as never }, 'no such ending');
  });

  it('holds each batter to the meter rules Test Survival enforces', () => {
    const hurt = (patch: Partial<MarathonBatterFigures>) => {
      const made = allOut(); made.batters[2] = { ...made.batters[2], ...patch }; return made;
    };
    no(hurt({ health: 60, blows: 0 }), 'a meter that moved with no blow');
    no(hurt({ out: false, retired: true, health: 20, blows: 2 }), 'carried off with something left');
    const standing = innings('DECLARED', batter(143, 210), { ...batter(20, 40, 'in'), health: 0, blows: 3 });
    no(standing, 'still in with nothing left');
    no(hurt({ blows: 31 }), 'more blows than balls');
    no(hurt({ out: true, retired: true }), 'out and retired');
  });

  it('takes two left-handers, a left-handed player\'s side, and refuses three, or none of the right shape', () => {
    ok(innings('ALL_OUT', batter(40, 60, 'out', true), batter(30, 50, 'out', true), batter(9, 20)));
    no(innings('ALL_OUT', batter(40, 60, 'out', true), batter(30, 50, 'out', true), batter(9, 20, 'out', true)), 'three left-handers');
    no({ ...allOut(), batters: [] }, 'no batters');
    no(innings('ALL_OUT', batter(1, 1), batter(1, 1), batter(1, 1), batter(1, 1)), 'four batters');
  });

  it('reads a body as numbers and booleans, and anything else as something it refuses', () => {
    const sent = JSON.parse(JSON.stringify(allOut()));
    expect(marathonPlausible(readMarathonFigures(sent))).toBe(true);
    sent.batters[0].out = 'yes';
    expect(marathonPlausible(readMarathonFigures(sent))).toBe(false);
    expect(marathonPlausible(readMarathonFigures({ batters: 'three' }))).toBe(false);
    expect(marathonPlausible(readMarathonFigures(null))).toBe(false);
  });
});

describe('one submission, both rows', () => {
  const stores = () => {
    const names = new Map<string, string>();
    return { names, team: memoryStore<TeamInnings>(names), solo: memoryStore<SoloInnings>(names) };
  };
  const send = (made: MarathonFigures, playerId = 'mfj2k1-abcdefghijkl', name = 'Tendulkar'): Submission<MarathonFigures> =>
    ({ playerId, name, avatar: 1, innings: made, address: 'here' });

  it('writes the side to the team board and the best batter to the individual one', async () => {
    const both = stores();
    const taken = await submitMarathon(both, send(allOut()), AT);
    if (refused(taken)) throw new Error(taken.reason);
    expect(taken.improved).toEqual({ team: true, solo: true });
    const read = await readMarathon(both);
    expect(read.team.rows[0]).toMatchObject({ runs: 216, balls: 330, ending: 'ALL_OUT', name: 'Tendulkar', avatar: 1 });
    expect(read.solo.rows[0]).toMatchObject({ runs: 143, balls: 210, out: true, order: 1, name: 'Tendulkar' });
    expect(taken.board).toEqual(read);
  });

  it('keeps each board\'s best on its own: a better batter on a worse day moves only the individual row', async () => {
    const both = stores();
    await submitMarathon(both, send(allOut()), AT);
    const later = innings('ALL_OUT', batter(150, 220), batter(1, 4), batter(0, 1));
    const taken = await submitMarathon(both, send(later), AT + 86_400_000);
    if (refused(taken)) throw new Error(taken.reason);
    expect(taken.improved).toEqual({ team: false, solo: true });
    const read = await readMarathon(both);
    expect(read.team.rows[0].runs).toBe(216);
    expect(read.solo.rows[0].runs).toBe(150);
  });

  it('says where the player stands on each board, and stood before', async () => {
    const both = stores();
    const first = await submitMarathon(both, send(allOut()), AT);
    if (refused(first)) throw new Error(first.reason);
    expect(first.standing.team).toMatchObject({ rank: 1, total: 1, was: null });
    const other = await submitMarathon(both, send(allOut(), 'mfj2k0-zzzzzzzzzzzz', 'Dravid'), AT + 1000);
    if (refused(other)) throw new Error(other.reason);
    // The same innings a second later packs to the same score, and a tie falls
    // to the order Redis keeps members in, which puts this id second.
    expect(other.standing.team).toMatchObject({ rank: 2, total: 2, was: null });
    expect(other.standing.solo).toMatchObject({ rank: 2, total: 2 });
    const later = innings('ALL_OUT', batter(150, 220), batter(1, 4), batter(0, 1));
    const again = await submitMarathon(both, send(later, 'mfj2k0-zzzzzzzzzzzz', 'Dravid'), AT + 86_400_000);
    if (refused(again)) throw new Error(again.reason);
    expect(again.standing.solo).toMatchObject({ rank: 1, was: { rank: 2 } });
    expect(again.standing.team).toMatchObject({ rank: 2, was: { rank: 2 } });
  });

  it('refuses both rows at once, and writes neither', async () => {
    const both = stores();
    const taken = await submitMarathon(both, send({ ...allOut(), runs: 9999 }), AT);
    expect(refused(taken) && taken.status).toBe(400);
    const read = await readMarathon(both);
    expect(read.team.rows).toEqual([]);
    expect(read.solo.rows).toEqual([]);
  });

  it('holds the name across every board: one taken on Test Survival is taken here', async () => {
    const both = stores();
    const survive = memoryStore<SurviveInnings>(both.names);
    await submitScore(survive, SURVIVE_LADDER, {
      playerId: 'aaaaaa-bbbbbbbbbbbb', name: 'Tendulkar', avatar: 0, address: 'there',
      innings: { runs: 30, balls: 40, wickets: 1, blows: 0, health: HEALTH.full },
    }, AT);
    const taken = await submitMarathon(both, send(allOut()), AT);
    expect(refused(taken) && taken.status).toBe(409);
  });

  it('keeps its rows in keys of their own', () => {
    expect(MARATHON_TEAM_LADDER.scope).toBe('marathon:');
    expect(MARATHON_SOLO_LADDER.scope).toBe('marathonone:');
  });
});
