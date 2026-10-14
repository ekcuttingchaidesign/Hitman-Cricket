import { describe, expect, it } from 'vitest';
import { emptyBlast, mergeBlast, type BlastTally } from '../src/game/career';
import { levelUpBeats, levelUpFx, levelUpHaptics, levelUpMetal, levelUpWords } from '../src/game/levelup';
import { climbedTo, TIERS } from '../src/game/tier';

/** The rungs a player can climb to: everybody starts on the first. */
const CLIMBABLE = TIERS.slice(1);

describe('Level Up grows with the ladder', () => {
  const numeric = ['lift', 'height', 'flight', 'fireworks', 'hold', 'morph', 'streaks', 'glints', 'rings', 'flash', 'shake'] as const;

  it('never spends less on a rung than on the one below it, and spends more of something', () => {
    for (let i = 1; i < CLIMBABLE.length; i++) {
      const below = levelUpFx(CLIMBABLE[i - 1]), here = levelUpFx(CLIMBABLE[i]);
      for (const key of numeric) expect(here[key], `${CLIMBABLE[i].key}.${key}`).toBeGreaterThanOrEqual(below[key]);
      expect(numeric.some(key => here[key] > below[key])).toBe(true);
    }
  });

  it('sends the ball higher the higher the rung, and keeps the fire and the fireworks for STAR and up', () => {
    const [emerging, star, hitman] = CLIMBABLE.map(tier => levelUpFx(tier));
    expect(emerging.height).toBeLessThan(star.height);
    expect(star.height).toBeLessThan(hitman.height);
    expect(emerging.tail).toBe('plain');
    expect([emerging.fireworks, emerging.glints, emerging.shake]).toEqual([0, 0, 0]);
    expect(star.tail).toBe('fire');
    expect(star.fireworks).toBeGreaterThan(0);
    expect(star.shake).toBe(0);
    expect(hitman.fireworks).toBeGreaterThan(star.fireworks);
    expect(hitman.shake).toBeGreaterThan(0);
    expect(hitman.encore).toBe(true);
  });

  it('keeps even the top rung an occasion rather than a wait', () => {
    // The finish climbs, the clutter and the waiting do not.
    const top = levelUpFx({ key: 'hitman' });
    expect(top.flight).toBeLessThanOrEqual(2200);
    expect(top.height).toBeLessThanOrEqual(36);
    expect(top.fireworks).toBeLessThanOrEqual(2);
    expect(top.streaks).toBeLessThanOrEqual(20);
    expect(top.flash).toBeLessThanOrEqual(.6);
    expect(top.shake).toBeLessThanOrEqual(5);
  });

  it('climbs longer and holds its breath longer the higher the rung, and puts the keys up last', () => {
    const beats = CLIMBABLE.map(tier => levelUpBeats(levelUpFx(tier)));
    for (const one of beats) {
      expect(one.contact).toBeLessThan(one.word);
      expect(one.word).toBeLessThan(one.card);
      expect(one.card).toBeLessThan(one.turn);
      expect(one.turn).toBeLessThan(one.turned);
      expect(one.turned).toBeLessThan(one.named);
      expect(one.named).toBeLessThan(one.ready);
    }
    for (let i = 1; i < beats.length; i++) expect(beats[i].ready).toBeGreaterThan(beats[i - 1].ready);
    // Long enough to be an occasion, never so long that the keys feel withheld.
    expect(beats[beats.length - 1].ready).toBeLessThan(6500);
  });

  it('knocks in the hand as the bat meets the ball, and ticks while it climbs', () => {
    const fx = levelUpFx({ key: 'star' }), beats = levelUpBeats(fx), at = levelUpHaptics(fx, beats);
    expect(at[0].at).toBe(beats.contact);
    const climbing = at.filter(one => one.at > beats.contact && one.at < beats.word);
    expect(climbing.length).toBe(fx.lift);
    for (let i = 1; i < climbing.length; i++) expect(climbing[i].at).toBeGreaterThan(climbing[i - 1].at);
  });

  it('buzzes harder at the turn the higher the rung, and only at the beats', () => {
    const total = (tier: { key: string }) => {
      const fx = levelUpFx(tier), beats = levelUpBeats(fx);
      const at = levelUpHaptics(fx, beats);
      for (const one of at) expect(one.at).toBeLessThanOrEqual(beats.turned);
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
