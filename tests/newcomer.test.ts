import { describe, expect, it } from 'vitest';
import { GAME } from '../src/config/gameplay';
import { BANDS, SURVIVE } from '../src/config/survive';
import { BATTERS } from '../src/config/marathon';
import { CLASSIC_PLAN, DeliveryGenerator, MARATHON_PLAN, SURVIVE_PLAN, marathonOnly, withoutYorkers } from '../src/game/DeliveryGenerator';
import { SeededRandom } from '../src/game/SeededRandom';
import { gradeOf, resolveShot } from '../src/game/ShotResolver';
import { TAILENDER, contactOf } from '../src/game/Survive';
import {
  EASE, NEWCOMER_INNINGS, easeFor, easedBands, easedSkill, easedWindows, notePlayed, playedIn, readPlayed, seedPlayed,
} from '../src/game/newcomer';
import type { Delivery, ShotOutcome } from '../src/game/types';

/** A browser's storage, read and written. */
function storage(store: Record<string, string> = {}) {
  return { store, read: (key: string) => store[key] ?? null, write: (key: string, value: string) => { store[key] = value; } };
}

const delivery = (changes: Partial<Delivery> = {}): Delivery => ({
  line: 'MIDDLE', style: 'NORMAL', speedKph: 125, baseTargetX: 0, finalTargetX: 0, bounceZ: GAME.bounceZ, rise: GAME.rise,
  durationMs: 1000, releaseTimeMs: 0, idealContactTimeMs: 1000, ...changes,
});
const rng = (value = 0.5) => ({ next: () => value });

describe('a newcomer\'s help', () => {
  it('shrinks innings by innings and is gone after the third in a mode', () => {
    expect(NEWCOMER_INNINGS).toBe(3);
    expect([0, 1, 2, 3, 4, 40].map(easeFor)).toEqual([...EASE, 1, 1, 1]);
    expect(EASE[0]).toBeGreaterThan(EASE[1]);
    expect(EASE[1]).toBeGreaterThan(EASE[2]);
    expect(EASE[2]).toBeGreaterThan(1);
    expect([-1, 0.5, NaN].map(easeFor)).toEqual([1, 1, 1]);
  });

  it('widens OK into POOR and leaves the boundaries\' windows where they are', () => {
    const eased = easedWindows(GAME.timing, EASE[0]);
    expect(eased.perfect).toBe(GAME.timing.perfect);
    expect(eased.good).toBe(GAME.timing.good);
    expect(eased.poor).toBe(GAME.timing.poor);
    expect(eased.ok).toBeGreaterThan(GAME.timing.ok);
    expect(eased.ok).toBeLessThanOrEqual(eased.poor);
    // Never past POOR, however wide it is asked to go.
    expect(easedWindows(GAME.timing, 9).ok).toBe(GAME.timing.poor);
    expect(easedWindows(GAME.timing, 1)).toBe(GAME.timing);
  });

  it('widens the clean block and never past the edge of it', () => {
    const eased = easedBands(BANDS, EASE[0]);
    expect(eased.clean).toBeGreaterThan(BANDS.clean);
    expect(eased.beaten).toBe(BANDS.beaten);
    expect(easedBands(BANDS, 9).clean).toBe(BANDS.beaten);
  });

  it('keeps who a Marathon batter is while it widens his windows', () => {
    for (const batter of BATTERS) {
      const eased = easedSkill(batter, EASE[0]);
      expect(eased.role).toBe(batter.role);
      expect(eased.timing.perfect).toBe(batter.timing.perfect);
      expect(eased.timing.good).toBe(batter.timing.good);
      expect(eased.timing.ok).toBeGreaterThan(batter.timing.ok);
      expect(eased.bands.clean).toBeGreaterThan(batter.bands.clean);
    }
  });
});

describe('the Blast, helped', () => {
  // Late enough to be POOR to anybody — skied and caught — and inside a
  // newcomer's widened OK, where it is kept along the ground.
  const late = { shotType: 'STRAIGHT' as const, inputTimeMs: 1000 + GAME.timing.ok + 15 };

  it('turns the skied catch into runs along the ground', () => {
    const plain = resolveShot(delivery(), late, rng(), false);
    expect(plain.timingGrade).toBe('POOR');
    expect(plain.isWicket).toBe(true);
    const helped = resolveShot(delivery(), late, rng(), false, easedWindows(GAME.timing, EASE[0]));
    expect(helped.timingGrade).toBe('OK');
    expect(helped.isWicket).toBe(false);
    expect(helped.aerial).toBe(false);
  });

  it('pays a timed stroke exactly what it always paid', () => {
    for (const ms of [0, 20, GAME.timing.perfect, GAME.timing.perfect + 1, GAME.timing.good]) {
      const attempt = { shotType: 'STRAIGHT' as const, inputTimeMs: 1000 + ms };
      const plain = resolveShot(delivery(), attempt, rng(), false);
      const helped = resolveShot(delivery(), attempt, rng(), false, easedWindows(GAME.timing, EASE[0]));
      expect(helped).toEqual(plain);
    }
  });

  it('is graded the same way by the rig as by the score', () => {
    const windows = easedWindows(GAME.timing, EASE[0]);
    expect(gradeOf(delivery(), late, windows)).toBe(resolveShot(delivery(), late, rng(), false, windows).timingGrade);
  });
});

describe('the Test modes, helped', () => {
  it('lets a block a shade early die on the bat', () => {
    const delta = BANDS.clean + 10;
    expect(contactOf(delta, false, TAILENDER.bands)).not.toBe('CLEAN');
    expect(contactOf(delta, false, easedSkill(TAILENDER, EASE[0]).bands)).toBe('CLEAN');
    expect(easedSkill(TAILENDER, EASE[0]).timing.perfect).toBe(SURVIVE.timing.perfect);
  });
});

describe('a newcomer\'s bowling', () => {
  const sixes = (generator: DeliveryGenerator, n: number) => {
    for (let i = 0; i < n; i++) generator.record({ runs: 6 } as ShotOutcome);
  };

  it('owes no yorker for a run of sixes, in the Blast or Survival', () => {
    for (const plan of [CLASSIC_PLAN, SURVIVE_PLAN]) {
      const owed = new DeliveryGenerator(new SeededRandom(3), plan);
      const spared = new DeliveryGenerator(new SeededRandom(3), withoutYorkers(plan));
      const styles = (generator: DeliveryGenerator) => {
        const seen: string[] = [];
        for (let ball = 0; ball < 60; ball++) { sixes(generator, plan.specials.sixesForYorker); seen.push(generator.next(ball * 3000).style); }
        return seen;
      };
      expect(styles(owed)).toContain('YORKER');
      expect(styles(spared)).not.toContain('YORKER');
    }
  });

  it('bowls the express over as quick, with a full fast ball where the yorker was', () => {
    const plan = marathonOnly({ express: true });
    const styles = (generator: DeliveryGenerator) => Array.from({ length: 60 }, (_, ball) => generator.next(ball * 3000).style);
    const owed = styles(new DeliveryGenerator(new SeededRandom(5), plan));
    const spared = styles(new DeliveryGenerator(new SeededRandom(5), withoutYorkers(plan)));
    expect(owed).toContain('YORKER');
    expect(spared).not.toContain('YORKER');
    const express = (seen: string[]) => seen.filter(style => style === 'EXPRESS').length;
    expect(express(spared)).toBeGreaterThan(express(owed));
    // Everything else about the plan is as it was.
    expect(withoutYorkers(MARATHON_PLAN).travelScale).toBe(MARATHON_PLAN.travelScale);
    expect(withoutYorkers(MARATHON_PLAN).blocks?.express.min).toBe(MARATHON_PLAN.blocks?.express.min);
    expect(withoutYorkers(CLASSIC_PLAN).blocks).toBeUndefined();
  });
});

describe('who is a newcomer', () => {
  it('is a browser that has finished fewer than three innings in the mode', () => {
    const { read, write } = storage();
    seedPlayed(read, write, false);
    expect(playedIn('classic', read)).toBe(0);
    notePlayed('classic', read, write);
    notePlayed('classic', read, write);
    expect(playedIn('classic', read)).toBe(2);
    // Each mode on its own.
    expect(playedIn('survive', read)).toBe(0);
    for (let i = 0; i < 10; i++) notePlayed('classic', read, write);
    expect(readPlayed(read)?.classic).toBe(NEWCOMER_INNINGS);
  });

  it('goes by the career where it is further on, as one brought back by a key is', () => {
    const { read } = storage();
    expect(playedIn('marathon', read, 140)).toBe(140);
    expect(easeFor(playedIn('marathon', read, 140))).toBe(1);
  });

  it('counts a player from before the help as past it, once, on the first load', () => {
    const veteran = storage();
    seedPlayed(veteran.read, veteran.write, true);
    expect(['classic', 'survive', 'marathon'].map(mode => playedIn(mode as 'classic', veteran.read))).toEqual([3, 3, 3]);

    // A newcomer who comes back the next day is still the newcomer they were.
    const fresh = storage();
    seedPlayed(fresh.read, fresh.write, false);
    notePlayed('survive', fresh.read, fresh.write);
    seedPlayed(fresh.read, fresh.write, true);
    expect(playedIn('classic', fresh.read)).toBe(0);
    expect(playedIn('survive', fresh.read)).toBe(1);
  });

  it('reads junk as nothing played rather than throwing', () => {
    expect(readPlayed(storage({ 'hitman-newcomer': '{oops' }).read)).toEqual({});
    expect(readPlayed(storage({ 'hitman-newcomer': '{"classic":-2,"survive":"9","marathon":1.5}' }).read)).toEqual({});
    expect(readPlayed(storage().read)).toBeNull();
  });
});
