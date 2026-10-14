import { describe, expect, it } from 'vitest';
import { emptyBlast, mergeBlast, type BlastTally } from '../src/game/career';
import { levelUpBeats, levelUpFx, levelUpHaptics, levelUpMetal, levelUpWords, spring, springArrives } from '../src/game/levelup';
import { climbedTo, TIERS } from '../src/game/tier';

/** The rungs a player can climb to: everybody starts on the first. */
const CLIMBABLE = TIERS.slice(1);

describe('Level Up opens its own way on each rung', () => {
  it('opens on Road to Hitman for EMERGING PLAYER, the six for STAR, the chevron rush for HITMAN', () => {
    expect(CLIMBABLE.map(tier => [tier.key, levelUpFx(tier).opening])).toEqual([['emerging', 'road'], ['star', 'six'], ['hitman', 'rush']]);
  });

  it('keeps the gold shower and the second wave of cannons for HITMAN', () => {
    const [emerging, star, hitman] = CLIMBABLE.map(tier => levelUpFx(tier));
    expect([emerging.shower, star.shower]).toEqual([0, 0]);
    expect(hitman.shower).toBeGreaterThan(0);
    expect([emerging.waves, star.waves, hitman.waves]).toEqual([1, 1, 2]);
    expect(hitman.encore).toBe(true);
  });
});

describe('Level Up grows with the ladder', () => {
  const numeric = ['confetti', 'waves', 'shower', 'burst', 'rings', 'flash', 'shake', 'glints'] as const;

  it('never spends less on a rung than on the one below it, and spends more of something', () => {
    for (let i = 1; i < CLIMBABLE.length; i++) {
      const below = levelUpFx(CLIMBABLE[i - 1]), here = levelUpFx(CLIMBABLE[i]);
      for (const key of numeric) expect(here[key], `${CLIMBABLE[i].key}.${key}`).toBeGreaterThanOrEqual(below[key]);
      expect(numeric.some(key => here[key] > below[key])).toBe(true);
    }
  });

  it('keeps even the top rung a celebration rather than a storm', () => {
    const top = levelUpFx({ key: 'hitman' });
    expect(top.confetti * top.waves + top.shower + top.burst).toBeLessThanOrEqual(480);
    expect(top.flash).toBeLessThanOrEqual(.7);
    expect(top.shake).toBeLessThanOrEqual(6);
  });

  it('runs its beats in order, the card standing before it turns, and the keys up inside five seconds', () => {
    for (const tier of CLIMBABLE) {
      const one = levelUpBeats(levelUpFx(tier));
      expect(one.word, tier.key).toBeLessThanOrEqual(one.card);
      expect(one.card).toBeLessThan(one.turn);
      expect(one.turn).toBeLessThan(one.turned);
      expect(one.turned).toBeLessThan(one.count);
      expect(one.count).toBeLessThan(one.named);
      expect(one.named).toBeLessThan(one.ready);
      expect(one.ready).toBeLessThan(5000);
    }
  });

  it('settles every spring where it was going, and counts the turn from the moment the card first faces round', () => {
    for (const kind of ['snappy', 'bouncy', 'wobbly', 'soft'] as const) {
      expect(spring(0, kind)).toBe(0);
      expect(spring(3000, kind)).toBeCloseTo(1, 3);
    }
    // Bounce on the small moves, barely any on the long ones: a soft spring that overshot would cover the words.
    const peak = (kind: 'bouncy' | 'soft') => Math.max(...Array.from({ length: 1500 }, (_, ms) => spring(ms, kind)));
    expect(peak('bouncy')).toBeGreaterThan(1.1);
    expect(peak('soft')).toBeLessThan(1.05);
    expect(spring(springArrives('bouncy'), 'bouncy')).toBeGreaterThanOrEqual(1);
  });

  it('buzzes harder at the turn the higher the rung, and only at the beats', () => {
    const total = (tier: { key: string }) => {
      const fx = levelUpFx(tier), beats = levelUpBeats(fx), at = levelUpHaptics(fx, beats);
      for (const one of at) expect(one.at).toBeLessThanOrEqual(beats.turned);
      for (let i = 1; i < at.length; i++) expect(at[i].at).toBeGreaterThanOrEqual(at[i - 1].at);
      const burst = at[at.length - 1];
      expect(burst.at).toBe(beats.turned);
      return burst.pattern.filter((_, i) => i % 2 === 0).reduce((sum, ms) => sum + ms, 0);
    };
    const felt = CLIMBABLE.map(total);
    for (let i = 1; i < felt.length; i++) expect(felt[i]).toBeGreaterThan(felt[i - 1]);
  });

  it('draws each rung in its own metal', () => {
    const metals = CLIMBABLE.map(tier => levelUpMetal(tier).base);
    expect(new Set(metals).size).toBe(metals.length);
    expect(levelUpMetal(TIERS.find(one => one.key === 'hitman')!).base).toBe('#e8bf5a');
  });
});

describe('what Level Up says', () => {
  it('names the rung and what is next, and says the top is the top', () => {
    const star = TIERS.find(one => one.key === 'star')!, hitman = TIERS.find(one => one.key === 'hitman')!;
    const said = levelUpWords('classic', star, '11,388 runs to HITMAN');
    expect(said.word).toBe('LEVEL UP');
    expect(said.title).toBe('STAR');
    expect(said.kicker).toBe('New tier · The Blast');
    expect(said.label).toContain('STAR');
    expect(said.label).toContain('11,388 runs to HITMAN');
    expect(levelUpWords('marathon', hitman, 'Top of the ladder.').kicker).toBe('Top of the ladder · Test Marathon');
  });
});

describe('the innings that tips a career over', () => {
  const innings = (runs: number): BlastTally => ({
    runs, balls: 30, fours: 0, sixes: Math.floor(runs / 6), wickets: 1, batsmen: [runs],
  } as unknown as BlastTally);

  it('is a climb a few runs short of STAR and over it after, and nothing either side', () => {
    const star = TIERS.find(one => one.key === 'star')!.at.classic;
    const was = { ...mergeBlast(emptyBlast(), innings(60)), runs: star - 12 };
    const now = mergeBlast(was, innings(40));
    expect(climbedTo('classic', was, now)?.key).toBe('star');
    expect(climbedTo('classic', now, mergeBlast(now, innings(40)))).toBeNull();
  });
});
