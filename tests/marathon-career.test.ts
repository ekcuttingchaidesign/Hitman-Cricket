import { describe, expect, it } from 'vitest';
import {
  MARATHON_CAREER, emptyMarathon, mergeMarathon, rankCareer, readMarathonTally, runsPerInnings, type MarathonCareer, type MarathonTally,
} from '../src/game/career';
import { countInnings, readCareer, readCareerBoards } from '../src/server/career-store';
import { memoryCareer } from '../src/server/memory-career';
import { foldName } from '../src/server/board-store';
import { MARATHON_RED, TIERS, cardTheme, nextLine, standingOf } from '../src/game/tier';
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

  it('ranks career runs on one ladder of its own, named players only', async () => {
    expect(MARATHON_CAREER.boards.map(board => board.key)).toEqual(['runs']);
    // The name is the board's to hand out: held here as the registry holds it.
    const store = memoryCareer<MarathonCareer>(new Map([[foldName('Opener'), 'abcdef2-0123456789ab']]));
    // Nameless: counted and kept, ranked nowhere until a name is claimed.
    await countInnings(store, MARATHON_CAREER, { ...who, nonce: 'innings-0101', tally: allOut() }, 1_000_000);
    expect((await readCareerBoards(store, MARATHON_CAREER)).boards).toEqual({ runs: [] });
    const named = { ...who, playerId: 'abcdef2-0123456789ab', name: 'Opener', avatar: 2 };
    await countInnings(store, MARATHON_CAREER, { ...named, nonce: 'innings-0102', tally: allOut() }, 2_000_000);
    await countInnings(store, MARATHON_CAREER, { ...named, nonce: 'innings-0103', tally: allOut() }, 3_000_000);
    const { boards } = await readCareerBoards(store, MARATHON_CAREER);
    expect(boards.runs).toHaveLength(1);
    expect(boards.runs[0]).toMatchObject({ name: 'Opener', career: { runs: 542, innings: 2, fours: 58, sixes: 26 } });
  });

  it('splits level totals on who took fewer innings', () => {
    const [runs] = MARATHON_CAREER.boards;
    const quick = { ...emptyMarathon(), runs: 1000, innings: 3 };
    const slow = { ...emptyMarathon(), runs: 1000, innings: 9 };
    expect(rankCareer(runs, quick, 0)).toBeGreaterThan(rankCareer(runs, slow, 0));
    expect(rankCareer(runs, { ...slow, runs: 1001 }, 0)).toBeGreaterThan(rankCareer(runs, quick, 0));
    expect(runs.counts(emptyMarathon())).toBe(false);
  });

  it('shows runs, innings, fours and sixes on a row', () => {
    const [runs] = MARATHON_CAREER.boards;
    expect(runs.name).toBe('Runs');
    expect(runs.figures.map(one => one.label)).toEqual(['runs', 'inns', '4s', '6s']);
    const career = mergeMarathon(null, allOut());
    expect(runs.figures.map(one => one.of(career))).toEqual([271, 1, 29, 13]);
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

  it('climbs its own ladder in runs, at twice the Blast\'s rungs, rounded', () => {
    expect(TIERS.map(tier => tier.at.marathon)).toEqual([0, 750, 7500, 30000]);
    expect(standingOf('marathon', career).tier.key).toBe('debutant');
    expect(nextLine('marathon', standingOf('marathon', career))).toBe('479 runs to EMERGING PLAYER');
    expect(standingOf('marathon', { ...career, runs: 7499 }).tier.key).toBe('emerging');
    expect(standingOf('marathon', { ...career, runs: 7500 }).tier.key).toBe('star');
    expect(standingOf('marathon', { ...career, runs: 29999 }).tier.key).toBe('star');
    expect(standingOf('marathon', { ...career, runs: 30000 }).tier.key).toBe('hitman');
  });
});

describe('the Marathon card\'s ground', () => {
  const green = (hex: string) => {
    const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
    return g > r * 1.6 && g > b * 1.2;
  };

  it('is British Racing Green on every rung, with red rising through it', () => {
    for (const tier of TIERS) {
      const theme = cardTheme('marathon', tier);
      for (const stop of [theme.top, theme.mid, theme.bottom]) expect(green(stop), `${tier.key} ${stop}`).toBe(true);
      expect(theme.tint?.colour).toBe(MARATHON_RED);
      expect(theme.trim).toBe('#ff6f80');
      expect(theme.edge).toBe('#3f7d5a');
      expect(theme.tint!.strength).toBeGreaterThan(0);
    }
  });

  it('leaves the tier to the badge: bronze, silver and gold stay, the first rung turns red', () => {
    const [debutant, ...metals] = TIERS;
    for (const tier of metals) expect(cardTheme('marathon', tier).accent).toBe(tier.theme.accent);
    expect(cardTheme('marathon', debutant).accent).toBe('#ff5c70');
  });

  it('is the Marathon\'s alone', () => {
    for (const tier of TIERS) {
      expect(cardTheme('classic', tier)).toBe(tier.theme);
      expect(cardTheme('survive', tier)).toBe(tier.theme);
    }
    const facts = statsFacts('marathon', mergeMarathon(null, allOut()), { name: '', avatar: 0 });
    expect(facts.tier.theme.top).toBe(cardTheme('marathon', TIERS[0]).top);
    expect(TIERS[0].theme.top).toBe('#16354a');
  });
});
