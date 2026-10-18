import { describe, expect, it } from 'vitest';
import { emptyBlast, emptyMarathon, emptySurvive } from '../src/game/career';
import { BATS, OUTFITS, batOwned, batSteps, done, earned, nextUp, outfitOwned, outfitSteps, ready, shareOf, type DressingRecord } from '../src/game/dressing';
import { lookOf } from '../src/game/dressing-ids';

const record = (patch: {
  classic?: Partial<ReturnType<typeof emptyBlast>>; survive?: Partial<ReturnType<typeof emptySurvive>>; marathon?: Partial<ReturnType<typeof emptyMarathon>>;
  rivals?: { won: number; beaten: number }; launch?: Partial<DressingRecord['launch']>; welcomed?: boolean;
} = {}): DressingRecord => ({
  careers: { classic: { ...emptyBlast(), ...patch.classic }, survive: { ...emptySurvive(), ...patch.survive }, marathon: { ...emptyMarathon(), ...patch.marathon } },
  rivals: patch.rivals ?? { won: 0, beaten: 0 },
  launch: { classic: 0, survive: 0, marathon: 0, ...patch.launch },
  welcomed: patch.welcomed ?? false,
});

describe('a look as it travels', () => {
  it('wears the free guard when none is named, and refuses one that is not on the shelf', () => {
    expect(lookOf({ kit: 'home', bat: 'plain' })).toEqual({ kit: 'home', bat: 'plain', guard: 'sterling' });
    expect(lookOf({ kit: 'home', bat: 'plain', guard: 'blaze' })).toEqual({ kit: 'home', bat: 'plain', guard: 'blaze' });
    expect(lookOf({ kit: 'home', bat: 'plain', guard: 'gauntlets' })).toBeNull();
    expect(lookOf({ kit: 'tartan', bat: 'plain' })).toBeNull();
  });
});

describe('the Dressing Room shelves', () => {
  it('has eight kits and twelve bats, each named once, the bats from the easiest to Hitman', () => {
    expect(OUTFITS.map(o => o.id)).toEqual(['home', 'papaya', 'crimson', 'forest', 'gold', 'violet', 'electric', 'lagoon']);
    expect(BATS.map(b => b.id)).toEqual(['plain', 'boom', 'rage', 'venom', 'lonewolf', 'meg', 'icecold', 'roar', 'savage', 'reign', 'inferno', 'hitman']);
    expect(new Set(BATS.map(b => b.name)).size).toBe(12);
    expect(new Set(OUTFITS.map(o => o.name)).size).toBe(8);
  });

  it('gives a new player OG Navy and Plain and nothing else', () => {
    expect(earned(record())).toEqual({ outfits: ['home', 'papaya'], bats: ['plain'] });
  });

  it('keeps Boom waiting in the Dressing Room for its key, whatever has been played', () => {
    expect(batSteps('boom', record())).toEqual([{ text: 'Unlock it here, in the Dressing Room', now: 0, of: 1 }]);
    expect(batOwned('boom', record({ classic: { innings: 400, sixes: 900, highest: 160 } }))).toBe(false);
    expect(ready('bat', 'boom', record())).toBe(true);
    expect(ready('bat', 'icecold', record())).toBe(false);
    expect(earned(record({ welcomed: true })).bats).toEqual(['plain', 'boom']);
    expect(ready('bat', 'boom', record({ welcomed: true }))).toBe(false);
  });
});

describe('what the second set of bats takes', () => {
  it('counts sixes and runs across every mode, Survival wins, Rival wins', () => {
    const r = record({ classic: { sixes: 60, runs: 700 }, survive: { sixes: 25, runs: 200, wins: 9 }, marathon: { sixes: 15, runs: 100 }, rivals: { won: 4, beaten: 2 } });
    expect(batOwned('rage', r)).toBe(true);
    expect(batOwned('venom', r)).toBe(true);
    expect(batSteps('lonewolf', r)![0]).toMatchObject({ now: 9, of: 10, mode: 'survival' });
    expect(batSteps('meg', r)![0]).toMatchObject({ now: 4, of: 5, mode: 'rivals' });
    expect(batSteps('reign', r)![0]).toMatchObject({ now: 1000, of: 10000 });
  });

  it('gives Roar for a Star in any one mode, shown in the mode nearest it', () => {
    expect(batSteps('roar', record({ survive: { balls: 600 } }))![0]).toMatchObject({ text: 'Reach Star in Test Survival', now: 600, of: 1000, mode: 'survival' });
    expect(batOwned('roar', record({ marathon: { runs: 7500 } }))).toBe(true);
  });
});

describe('what each kit takes', () => {
  it('counts finished innings across every mode for Crimson and Lagoon', () => {
    const r = record({ classic: { innings: 10 }, survive: { innings: 9 }, marathon: { innings: 6 } });
    expect(outfitOwned('crimson', r)).toBe(true);
    expect(outfitSteps('lagoon', r)![0]).toMatchObject({ now: 25, of: 500 });
  });

  it('wants Emerging in all three modes for British Racing Green, read off each mode’s own figure', () => {
    const almost = record({ classic: { runs: 350 }, survive: { balls: 100 }, marathon: { runs: 749 } });
    expect(outfitSteps('forest', almost)!.map(done)).toEqual([true, true, false]);
    expect(outfitOwned('forest', record({ classic: { runs: 350 }, survive: { balls: 100 }, marathon: { runs: 750 } }))).toBe(true);
  });

  it('wants ten Rival wins over five different players for Bumblebee', () => {
    expect(outfitOwned('gold', record({ rivals: { won: 12, beaten: 4 } }))).toBe(false);
    expect(outfitOwned('gold', record({ rivals: { won: 10, beaten: 5 } }))).toBe(true);
  });

  it('reads the Test Marathon double off the best score, which is shown as a best', () => {
    const steps = outfitSteps('violet', record({ marathon: { highest: 142 } }))!;
    expect(steps[0]).toMatchObject({ now: 142, of: 200, best: true });
    expect(outfitOwned('violet', record({ marathon: { highest: 200 } }))).toBe(true);
  });

  it('counts Survival wins for Electric', () => {
    expect(outfitOwned('electric', record({ survive: { wins: 49, draws: 30 } }))).toBe(false);
    expect(outfitOwned('electric', record({ survive: { wins: 50 } }))).toBe(true);
  });
});

describe('what each bat takes', () => {
  it('adds up sixes from every mode for Ice Cold', () => {
    expect(batOwned('icecold', record({ classic: { sixes: 200 }, survive: { sixes: 30 }, marathon: { sixes: 20 } }))).toBe(true);
  });

  it('wants a hundred in each mode for Savage: the top score in two, a win in Survival', () => {
    const r = record({ classic: { highest: 112 }, survive: { wins: 0 }, marathon: { highest: 88 } });
    expect(batSteps('savage', r)!.map(done)).toEqual([true, false, false]);
    expect(batOwned('savage', record({ classic: { highest: 100 }, survive: { wins: 1 }, marathon: { highest: 100 } }))).toBe(true);
  });

  it('wants Star everywhere and then a quarter of each Star since launch for Inferno', () => {
    const stars = { classic: { runs: 3600 }, survive: { balls: 1000 }, marathon: { runs: 7500 } };
    // History counts toward the Star; the quarter has to come after launch.
    expect(batOwned('inferno', record({ ...stars, launch: { classic: 3600, survive: 1000, marathon: 7500 } }))).toBe(false);
    const after = record({ classic: { runs: 4500 }, survive: { balls: 1250 }, marathon: { runs: 9375 }, launch: { classic: 3600, survive: 1000, marathon: 7500 } });
    expect(batOwned('inferno', after)).toBe(true);
    // A new player's launch is nought, so everything they play is after it.
    expect(batOwned('inferno', record(stars))).toBe(true);
  });

  it('wants Hitman in any one mode and a quarter of it since launch for the Hitman bat', () => {
    const blast = record({ classic: { runs: 15000 }, launch: { classic: 14000 } });
    expect(batOwned('hitman', blast)).toBe(false);
    expect(batSteps('hitman', blast)![1]).toMatchObject({ now: 1000, of: 3750, mode: 'blast' });
    expect(batOwned('hitman', record({ classic: { runs: 18750 }, launch: { classic: 14000 } }))).toBe(true);
    // Shown in whichever mode is nearest done.
    expect(batSteps('hitman', record({ survive: { balls: 4000 } }))![0].text).toBe('Reach Hitman in Test Survival');
  });
});

describe('Next up', () => {
  it('is the locked one nearest done, and nothing once the shelf is full', () => {
    const r = record({ marathon: { highest: 180, innings: 3 } });
    expect(nextUp(OUTFITS.map(o => o.id), id => outfitSteps(id, r))).toBe('violet');
    expect(nextUp(['home'] as const, id => outfitSteps(id, r))).toBeNull();
    expect(shareOf([{ text: '', now: 1, of: 2 }, { text: '', now: 5, of: 5 }])).toBeCloseTo(.75);
  });
});
