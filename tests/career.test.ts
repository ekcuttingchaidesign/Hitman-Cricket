import { describe, expect, it } from 'vitest';
import {
  BLAST_BOARDS, CAREER_PACKED_BITS, PRIMARY_CAP, SECONDARY_CAP, SURVIVE_BOARDS,
  batsmanScores, blastTallyPlausible, emptyBlast, emptySurvive, mergeBlast, mergeSurvive,
  packCareer, rankCareer, survivals, surviveTallyPlausible, unpackCareer,
  type BlastCareer, type BlastTally, type SurviveTally,
} from '../src/game/career';
import { LAUNCH_MS } from '../src/game/leaderboard';
import type { ShotOutcome } from '../src/game/types';

/** One ball, as the innings remembers it. */
const ball = (runs: number, isWicket = false) => ({ runs, isWicket }) as ShotOutcome;

/** A tally with no arithmetic done for it, for the plausibility checks. */
const blastRaw = (over: Partial<BlastTally>): BlastTally => ({
  runs: 0, sixes: 0, fours: 0, wickets: 0, dots: 0, balls: 30, individual: 0, hundreds: 0, ...over,
});

/** A Blast innings that adds up, so a fixture cannot be one nobody could play. */
const blast = (runs: number, opts: Partial<BlastTally> = {}): BlastTally => {
  const sixes = opts.sixes ?? Math.floor(runs / 6);
  const fours = opts.fours ?? 0;
  const wickets = opts.wickets ?? 0;
  const singles = runs - sixes * 6 - fours * 4;
  const balls = Math.min(30, sixes + fours + singles + wickets + (opts.dots ?? 0));
  // One batsman made the lot unless the fixture says where the wickets fell.
  const individual = opts.individual ?? runs;
  const innings = {
    runs, sixes, fours, wickets,
    dots: opts.dots ?? 0,
    balls: opts.balls ?? balls,
    individual,
    hundreds: opts.hundreds ?? Number(individual >= 100),
  };
  expect(blastTallyPlausible(innings)).toBe(true);
  return innings;
};

/** A Test innings the same way: the health is only moved where a blow landed. */
const test = (opts: Partial<SurviveTally> = {}): SurviveTally => {
  const tally: SurviveTally = {
    runs: 20, balls: 40, wickets: 0, blows: 0, health: 100, sixes: 2, fours: 2, ...opts,
  };
  expect(surviveTallyPlausible(tally)).toBe(true);
  return tally;
};

describe('a career, added up', () => {
  it('counts a first innings onto nothing', () => {
    const career = mergeBlast(null, blast(60));
    expect(career.innings).toBe(1);
    expect(career.runs).toBe(60);
    expect(career.highest).toBe(60);
  });

  it('adds every innings rather than keeping the best one', () => {
    let career = mergeBlast(null, blast(60));
    career = mergeBlast(career, blast(12));
    career = mergeBlast(career, blast(30));
    expect(career.innings).toBe(3);
    expect(career.runs).toBe(102);
    // The whole difference between this and the innings board, asserted: a bad
    // innings still counts toward a total and cannot touch the best one.
    expect(career.highest).toBe(60);
  });

  it('leaves the record it was handed alone', () => {
    const held = mergeBlast(null, blast(60));
    const copy = { ...held };
    mergeBlast(held, blast(24));
    expect(held).toEqual(copy);
  });

  it('reads the highest score off the innings total, wickets and all', () => {
    // The two examples this was specified from: 132 without losing one, and
    // 140 having lost one on the way. The bigger score is the higher score.
    let career = mergeBlast(null, blast(132, { wickets: 0 }));
    career = mergeBlast(career, blast(140, { wickets: 1 }));
    expect(career.highest).toBe(140);
  });

  it('keeps the best unbeaten score apart from the highest', () => {
    let career = mergeBlast(null, blast(132, { wickets: 0 }));
    career = mergeBlast(career, blast(140, { wickets: 1 }));
    // 140 for one is the higher score and not an unbeaten one, so the 132 is
    // still the best of those.
    expect(career.notOut).toBe(132);
  });

  it('has no unbeaten best until an innings is played without a wicket', () => {
    const career = mergeBlast(null, blast(90, { wickets: 2 }));
    expect(career.highest).toBe(90);
    expect(career.notOut).toBe(0);
  });

  it('scores a batsman from the wicket before him, not from the start of the innings', () => {
    // Two down for twenty, 130 all told: the batsman still in made 110.
    const made = batsmanScores([
      ...Array.from({ length: 4 }, () => ball(5)),
      ball(0, true),
      ball(0, true),
      ...Array.from({ length: 11 }, () => ball(10)),
    ]);
    expect(made).toEqual([20, 0, 110]);
  });

  it('counts a batsman out first ball as a nought rather than as nobody', () => {
    expect(batsmanScores([ball(0, true), ball(6)])).toEqual([0, 6]);
    // And an innings that ended on a wicket leaves nobody in, which is a nought
    // at the end rather than a batsman who was never there.
    expect(batsmanScores([ball(6), ball(0, true)])).toEqual([6, 0]);
  });

  it('counts a hundred to the batsman who made it, wickets or no wickets', () => {
    // 110 out of 130 for two is a hundred: the innings lost wickets, the
    // batsman did not lose his.
    let career = mergeBlast(null, blast(130, { wickets: 2, individual: 110 }));
    expect(career.hundreds).toBe(1);
    // 132 with nothing lost is one batsman and one hundred.
    career = mergeBlast(career, blast(132, { wickets: 0 }));
    expect(career.hundreds).toBe(2);
    // And an innings nobody got to a hundred in adds none, however big it is.
    career = mergeBlast(career, blast(140, { wickets: 2, individual: 60, hundreds: 0 }));
    expect(career.hundreds).toBe(2);
  });

  it('keeps the best individual score apart from the innings total', () => {
    const career = mergeBlast(null, blast(130, { wickets: 2, individual: 110 }));
    expect(career.highest).toBe(130);
    expect(career.individual).toBe(110);
  });

  it('wants the whole hundred, not nearly one', () => {
    const career = mergeBlast(null, blast(99, { wickets: 0 }));
    expect(career.hundreds).toBe(0);
    expect(mergeBlast(career, blast(100, { wickets: 0 })).hundreds).toBe(1);
  });

  it('will not take more hundreds than there were batsmen or runs to make them', () => {
    // Three hundreds off thirty balls is not an innings anybody played.
    expect(blastTallyPlausible(blastRaw({ runs: 150, hundreds: 3, individual: 150 }))).toBe(false);
    // Nor is a hundred by a batsman whose best is ninety.
    expect(blastTallyPlausible(blastRaw({ runs: 150, hundreds: 1, individual: 90 }))).toBe(false);
    // Nor one batsman outscoring the whole innings.
    expect(blastTallyPlausible(blastRaw({ runs: 90, individual: 120 }))).toBe(false);
  });

  it('credits a career that already held an unbeaten hundred before this was counted', () => {
    // Every record written before the figure existed reads back without it.
    // Starting a player whose best unbeaten score is 132 at nought hundreds
    // would be telling them something untrue about their own career.
    const legacy = { ...emptyBlast(), innings: 4, runs: 300, highest: 140, notOut: 132 } as BlastCareer;
    delete (legacy as Partial<BlastCareer>).hundreds;
    const career = mergeBlast(legacy, blast(10, { wickets: 1 }));
    expect(career.hundreds).toBe(1);
    // And the floor only ever lifts a nought — it does not add one a second time.
    expect(mergeBlast(career, blast(10, { wickets: 1 })).hundreds).toBe(1);
  });

  it('counts a Test innings into the tier it ended in', () => {
    let career = mergeSurvive(null, test({ runs: 100, balls: 48 }));
    career = mergeSurvive(career, test({ runs: 30, balls: 60 }));
    career = mergeSurvive(career, test({ runs: 12, balls: 20, wickets: 1 }));
    expect(career.wins).toBe(1);
    expect(career.draws).toBe(1);
    expect(career.losses).toBe(1);
    expect(career.innings).toBe(3);
    expect(career.balls).toBe(128);
  });

  it('counts a chase and a draw as innings survived, and a wicket as not', () => {
    let career = mergeSurvive(null, test({ runs: 100, balls: 48 }));
    career = mergeSurvive(career, test({ runs: 30, balls: 60 }));
    career = mergeSurvive(career, test({ runs: 12, balls: 20, wickets: 1 }));
    expect(survivals(career)).toBe(2);
  });

  it('counts the boundaries and the blows the Test board never ranked', () => {
    let career = mergeSurvive(null, test({ sixes: 3, fours: 1, blows: 4, health: 60 }));
    career = mergeSurvive(career, test({ sixes: 1, fours: 5, blows: 2, health: 80 }));
    expect(career.sixes).toBe(4);
    expect(career.fours).toBe(6);
    expect(career.blows).toBe(6);
  });

  it('starts empty at nought on every figure', () => {
    for (const figure of Object.values(emptyBlast())) expect(figure).toBe(0);
    for (const figure of Object.values(emptySurvive())) expect(figure).toBe(0);
  });
});

describe('the packed career key', () => {
  it('stays inside a double, with room to spare', () => {
    expect(CAREER_PACKED_BITS).toBeLessThanOrEqual(53);
    expect(packCareer(PRIMARY_CAP, SECONDARY_CAP, LAUNCH_MS)).toBeLessThan(Number.MAX_SAFE_INTEGER);
    expect(Number.isSafeInteger(packCareer(PRIMARY_CAP, SECONDARY_CAP, LAUNCH_MS))).toBe(true);
  });

  it('puts a bigger total above a smaller one, whenever it was reached', () => {
    const later = LAUNCH_MS + 900 * 86_400_000;
    expect(packCareer(5000, 0, later)).toBeGreaterThan(packCareer(4999, SECONDARY_CAP, LAUNCH_MS));
  });

  it('splits a level total on the second figure', () => {
    const at = LAUNCH_MS + 10 * 86_400_000;
    expect(packCareer(5000, 12, at)).toBeGreaterThan(packCareer(5000, 11, at));
  });

  it('leaves whoever got there first above whoever matched it later', () => {
    const first = packCareer(5000, 12, LAUNCH_MS);
    const after = packCareer(5000, 12, LAUNCH_MS + 40 * 86_400_000);
    expect(first).toBeGreaterThan(after);
  });

  it('comes apart again', () => {
    const at = LAUNCH_MS + 33 * 86_400_000;
    const taken = unpackCareer(packCareer(4321, 77, at));
    expect(taken.primary).toBe(4321);
    expect(taken.secondary).toBe(77);
    expect(taken.day).toBe(33);
  });

  it('clamps a total past the field rather than wrapping it', () => {
    const over = packCareer(PRIMARY_CAP + 5000, 0, LAUNCH_MS);
    expect(unpackCareer(over).primary).toBe(PRIMARY_CAP);
  });
});

describe('the Blast career ladders', () => {
  const board = (key: string) => BLAST_BOARDS.find(one => one.key === key)!;

  it('ranks most runs first, and fewer innings where they are level', () => {
    const busy = { ...emptyBlast(), runs: 900, innings: 40 };
    const sharp = { ...emptyBlast(), runs: 900, innings: 12 };
    const at = LAUNCH_MS + 5 * 86_400_000;
    expect(rankCareer(board('runs'), sharp, at)).toBeGreaterThan(rankCareer(board('runs'), busy, at));
  });

  it('ranks boundaries on sixes before fours', () => {
    const sixer = { ...emptyBlast(), sixes: 20, fours: 1 };
    const cutter = { ...emptyBlast(), sixes: 19, fours: 60 };
    const at = LAUNCH_MS;
    expect(rankCareer(board('boundaries'), sixer, at)).toBeGreaterThan(rankCareer(board('boundaries'), cutter, at));
  });

  it('splits a level highest score on the best unbeaten one', () => {
    const out = { ...emptyBlast(), highest: 140, notOut: 90 };
    const unbeaten = { ...emptyBlast(), highest: 140, notOut: 132 };
    const at = LAUNCH_MS;
    expect(rankCareer(board('highest'), unbeaten, at)).toBeGreaterThan(rankCareer(board('highest'), out, at));
  });

  it('keeps a player off a board they have nothing on', () => {
    expect(board('boundaries').counts(emptyBlast())).toBe(false);
    expect(board('boundaries').counts({ ...emptyBlast(), fours: 1 })).toBe(true);
    expect(board('highest').counts({ ...emptyBlast(), innings: 4 })).toBe(false);
  });
});

describe('the Test career ladders', () => {
  const board = (key: string) => SURVIVE_BOARDS.find(one => one.key === key)!;

  it('offers a board for every figure the mode was asked to rank', () => {
    expect(SURVIVE_BOARDS.map(one => one.key)).toEqual(['balls', 'blows', 'runs', 'boundaries']);
  });

  it('ranks most balls faced first', () => {
    const at = LAUNCH_MS;
    const long = { ...emptySurvive(), balls: 1200, innings: 30 };
    const short = { ...emptySurvive(), balls: 900, innings: 15 };
    expect(rankCareer(board('balls'), long, at)).toBeGreaterThan(rankCareer(board('balls'), short, at));
  });

  it('splits level blows on who faced more to take them', () => {
    const at = LAUNCH_MS;
    const battered = { ...emptySurvive(), blows: 40, balls: 800 };
    const brief = { ...emptySurvive(), blows: 40, balls: 300 };
    expect(rankCareer(board('blows'), battered, at)).toBeGreaterThan(rankCareer(board('blows'), brief, at));
  });
});

describe('what one innings may contain', () => {
  it('refuses more runs than the balls could have produced', () => {
    expect(blastTallyPlausible({ runs: 200, sixes: 30, fours: 0, wickets: 0, dots: 0, balls: 30, individual: 0, hundreds: 0 })).toBe(false);
    expect(surviveTallyPlausible({ runs: 400, balls: 60, wickets: 0, blows: 0, health: 100, sixes: 0, fours: 0 })).toBe(false);
  });

  it('refuses more balls than the innings has', () => {
    expect(blastTallyPlausible({ runs: 10, sixes: 0, fours: 0, wickets: 0, dots: 0, balls: 31, individual: 0, hundreds: 0 })).toBe(false);
    expect(surviveTallyPlausible({ runs: 10, balls: 61, wickets: 0, blows: 0, health: 100, sixes: 0, fours: 0 })).toBe(false);
  });

  it('refuses more scoring shots and wickets than there were balls', () => {
    expect(blastTallyPlausible({ runs: 60, sixes: 10, fours: 0, wickets: 1, dots: 25, balls: 30, individual: 0, hundreds: 0 })).toBe(false);
    expect(surviveTallyPlausible({ runs: 30, balls: 10, wickets: 0, blows: 0, health: 100, sixes: 9, fours: 9 })).toBe(false);
  });

  it('refuses more blows than balls bowled at him', () => {
    expect(surviveTallyPlausible({ runs: 0, balls: 10, wickets: 0, blows: 11, health: 10, sixes: 0, fours: 0 })).toBe(false);
  });

  it('refuses a figure that is not a whole number at or above nought', () => {
    expect(blastTallyPlausible({ runs: -1, sixes: 0, fours: 0, wickets: 0, dots: 0, balls: 30, individual: 0, hundreds: 0 })).toBe(false);
    expect(blastTallyPlausible({ runs: 1.5, sixes: 0, fours: 0, wickets: 0, dots: 0, balls: 30, individual: 0, hundreds: 0 })).toBe(false);
    expect(blastTallyPlausible({ runs: Number.NaN, sixes: 0, fours: 0, wickets: 0, dots: 0, balls: 30, individual: 0, hundreds: 0 })).toBe(false);
  });
});
