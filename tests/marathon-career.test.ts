import { describe, expect, it } from 'vitest';
import {
  MARATHON_CAREER, emptyMarathon, mergeMarathon, readMarathonTally, runsPerInnings, type MarathonCareer, type MarathonTally,
} from '../src/game/career';
import { countInnings, readCareer, readCareerBoards } from '../src/server/career-store';
import { memoryCareer } from '../src/server/memory-career';
import { TIERS, nextLine, standingOf } from '../src/game/tier';
import { statsAlt, statsExplain, statsFacts } from '../src/game/StatsCard';

/** One batter, out, untouched by the bowling. */
const batter = (runs: number, balls: number, fours = 0, sixes = 0, over: Partial<MarathonTally['batters'][number]> = {}) =>
  ({ runs, balls, fours, sixes, out: true, retired: false, blows: 0, health: 100, left: false, ...over });

/** An innings all out: 152, 64 and 55 off 193 balls, the poster on the story. */
const allOut = (): MarathonTally => ({
  runs: 271, balls: 193, fours: 29, sixes: 13, ending: 'ALL_OUT',
  batters: [batter(152, 97, 16, 8), batter(64, 65, 8, 0), batter(55, 31, 5, 5)],
});

describe('a Marathon career', () => {
  it('adds an innings up: the totals, the biggest total and the most one batter made', () => {
    const one = mergeMarathon(null, allOut());
    expect(one).toMatchObject({ innings: 1, runs: 271, balls: 193, fours: 29, sixes: 13, highest: 271, individual: 152, longest: 193 });
    const two = mergeMarathon(one, {
      runs: 90, balls: 60, fours: 6, sixes: 2, ending: 'ALL_OUT',
      batters: [batter(40, 20, 4, 1), batter(30, 20, 2, 1), batter(20, 20)],
    });
    expect(two).toMatchObject({ innings: 2, runs: 361, balls: 253, highest: 271, individual: 152, longest: 193 });
  });

  it('counts fifties, hundreds and doubles by any batter, a hundred not also a fifty, a double also a hundred', () => {
    const career = mergeMarathon(null, {
      runs: 360, balls: 300, fours: 30, sixes: 10, ending: 'ALL_OUT',
      batters: [batter(210, 150, 20, 6), batter(99, 100, 8, 2), batter(51, 50, 2, 2)],
    });
    expect(career).toMatchObject({ fifties: 2, hundreds: 1, doubles: 1, individual: 210 });
    expect(mergeMarathon(career, allOut())).toMatchObject({ fifties: 4, hundreds: 2, doubles: 1 });
  });

  it('leaves the career it was handed as it was', () => {
    const held = mergeMarathon(null, allOut());
    const copy = { ...held };
    mergeMarathon(held, allOut());
    expect(held).toEqual(copy);
  });

  it('says runs per innings rather than an average, every innings once however it ended', () => {
    expect(runsPerInnings(emptyMarathon())).toBe(0);
    expect(runsPerInnings({ runs: 271, innings: 1 })).toBe(271);
    expect(runsPerInnings({ runs: 1000, innings: 3 })).toBe(333.3);
  });

  it('refuses exactly what the Marathon\'s boards refuse', () => {
    expect(MARATHON_CAREER.plausible(allOut())).toBe(true);
    expect(MARATHON_CAREER.plausible({ ...allOut(), runs: 272 })).toBe(false);
    expect(MARATHON_CAREER.plausible(readMarathonTally({}))).toBe(false);
    // Read off a body the way the boards read one.
    expect(MARATHON_CAREER.plausible(readMarathonTally(JSON.parse(JSON.stringify(allOut()))))).toBe(true);
  });
});

describe('the Marathon career store', () => {
  const who = { playerId: 'abcdef1-0123456789ab', name: '', avatar: 0, address: 'test' };

  it('counts an innings under its own scope and reads it back', async () => {
    const store = memoryCareer<MarathonCareer>();
    const counted = await countInnings(store, MARATHON_CAREER, { ...who, nonce: 'innings-0001', tally: allOut() }, 1_000_000);
    expect(counted).toMatchObject({ ok: true, counted: true, career: { innings: 1, runs: 271, individual: 152 } });
    // The same innings sent again is the same innings.
    const again = await countInnings(store, MARATHON_CAREER, { ...who, nonce: 'innings-0001', tally: allOut() }, 1_100_000);
    expect(again).toMatchObject({ ok: true, counted: false, career: { innings: 1 } });
    expect((await readCareer(store, MARATHON_CAREER, who.playerId)).career).toMatchObject({ innings: 1, highest: 271 });
    expect(MARATHON_CAREER.scope).toBe('marathoncareer:');
  });

  it('refuses an innings that could not have happened', async () => {
    const store = memoryCareer<MarathonCareer>();
    const refused = await countInnings(store, MARATHON_CAREER, { ...who, nonce: 'innings-0002', tally: { ...allOut(), balls: 501 } });
    expect(refused).toMatchObject({ ok: false, status: 400 });
  });

  it('has no career ladders of its own yet, and answers for them with none', async () => {
    expect(MARATHON_CAREER.boards).toEqual([]);
    expect((await readCareerBoards(memoryCareer<MarathonCareer>(), MARATHON_CAREER)).boards).toEqual({});
  });
});

describe('the Marathon card', () => {
  const career = mergeMarathon(null, allOut());

  it('leads with the biggest total and the most one batter made', () => {
    const facts = statsFacts('marathon', career, { name: 'Somebody', avatar: 0 });
    expect(facts.modeName).toBe('Test Marathon');
    expect(facts.hero).toEqual([{ label: 'Highest', value: 271 }, { label: 'Best ind.', value: 152 }]);
    expect(facts.figures.map(one => one.label)).toEqual(['Runs', 'Per inns', 'Fifties', 'Hundreds', 'Doubles', 'Longest']);
    expect(facts.figures.find(one => one.label === 'Per inns')?.value).toBe(271);
    expect(statsAlt(facts)).toContain('on Test Marathon: 1 innings');
  });

  it('explains every figure it shows', () => {
    const facts = statsFacts('marathon', career, { name: '', avatar: 0 });
    for (const one of [...facts.hero, ...facts.figures]) expect(statsExplain(one.label), one.label).not.toBeNull();
  });

  it('climbs its own ladder in runs, on the Blast\'s rungs', () => {
    for (const tier of TIERS) expect(tier.at.marathon).toBe(tier.at.classic);
    expect(standingOf('marathon', career).tier.key).toBe('debutant');
    expect(nextLine('marathon', standingOf('marathon', career))).toBe('79 runs to EMERGING PLAYER');
    expect(standingOf('marathon', { ...career, runs: 3600 }).tier.key).toBe('star');
  });
});
