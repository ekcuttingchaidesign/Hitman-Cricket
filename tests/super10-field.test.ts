import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { ARM_REACH, BUILD } from '../src/entities/Cricketer';
import { SIGNAL_MS, signal } from '../src/entities/Fielder';
import { SUPER10, type Bowler } from '../src/config/super10';
import {
  APART, BOOK, DEEP_REACH, IN_LINE, IN_LINE_NEAR, POSITIONS, RING_REACH, SIGHT_SCREEN, STRETCH, bookOf, bowlerOf, drawnOf, fieldFor, fieldLine,
  fieldRules, nameOf, nearest, offScreen, passes, planFor, ropeAt, signalFor, steer, steerOf, surgeAuto, surgeOffered, type FieldSet,
} from '../src/game/super10-field';
import type { ShotOutcome } from '../src/game/types';
import { sectorOf } from '../src/scene/flight';

const BOWLERS: Bowler[] = ['SWING', 'SEAM', 'SPIN', 'SLING', 'DEATH'];
const struck = (runs: 1 | 2 | 3 | 4 | 6, extra: Partial<ShotOutcome> = {}): ShotOutcome => ({
  runs, isWicket: false, quality: 1, feedback: '', timingGrade: runs === 6 ? 'PERFECT' : 'GOOD',
  timingDeltaMs: 0, compatibility: 1, madeBatContact: true, aerial: runs === 6, ...extra,
});
const fixed = (value: number) => ({ next: () => value });
const counting = () => { const rng = { drawn: 0, next: () => { rng.drawn++; return .99; } }; return rng; };
/** A field of one man, for the rules on their own. */
const one = (angle: number, distance: number, deep: boolean): FieldSet =>
  ({ id: 'one', name: 'One', bowler: 'SEAM', men: [{ name: nameOf(angle, deep), angle, distance, deep }], change: null, moved: [] });
/**
 * Who bowls in the Powerplay and who after it: the swing bowler only in it,
 * the spinner, the sling bowler and the death bowler only after.
 */
const BOWLS: [Bowler, number][] = [['SWING', 0], ['SEAM', 1], ['SEAM', 6], ['SPIN', 3], ['SLING', 4], ['DEATH', 7]];
/** Every field the bowlers set: each one's two, in the overs he bowls. */
const EVERY = BOWLS.flatMap(([bowler, over]) => ([0, 1] as const).map(plan => fieldFor({ bowler, over, plan })));

describe('the Super10 field', () => {
  it('has nine men in every field, none in front of the sight screen and none on top of another', () => {
    for (const { men, id } of EVERY) {
      expect(men, id).toHaveLength(9);
      for (const m of men) expect(Math.abs(m.angle), `${id} ${m.name}`).toBeGreaterThanOrEqual(SIGHT_SCREEN);
      for (const a of men) for (const b of men) {
        if (a === b) continue;
        const apart = Math.abs(a.angle - b.angle);
        // Two at one depth stand well apart; one in the ring is off the line of the man behind him, the more so near straight.
        const least = a.deep === b.deep ? APART : Math.min(Math.abs(a.angle), Math.abs(b.angle)) < 45 ? IN_LINE_NEAR : IN_LINE;
        expect(apart, `${id}: ${a.name} and ${b.name}`).toBeGreaterThanOrEqual(least);
      }
    }
  });

  it('keeps two men back in the Powerplay and five after it, three when the spinner attacks', () => {
    for (const [bowler, over] of BOWLS) for (const plan of [0, 1] as const) {
      const back = fieldFor({ bowler, over, plan }).men.filter(m => m.deep).length;
      expect(back, `${bowler} ${over}`).toBe(over < SUPER10.powerplay ? 2 : bowler === 'SPIN' && plan ? 3 : 5);
    }
  });

  it('sets each bowler two fields from the book, and names them', () => {
    expect(bookOf('SEAM', 1)).toEqual(BOOK['SEAM-pp']);
    expect(bookOf('SEAM', 6)).toEqual(BOOK.SEAM);
    const death = fieldFor({ bowler: 'DEATH', over: 7 });
    expect(death).toMatchObject({ id: 'wide-yorker', name: 'Wide yorker', change: null });
    expect(fieldFor({ bowler: 'DEATH', over: 7, plan: 1 })).toMatchObject({ id: 'straight', change: 'plan' });
    expect(fieldFor({ bowler: 'SWING', over: 0 }).name).toBe('New-ball attack');
  });

  it('stands its boundary riders inside the rope, and names the chart\'s positions as the chart does', () => {
    for (const bowler of BOWLERS) for (const man of fieldFor({ bowler, over: 6 }).men.filter(m => m.deep)) {
      expect(man.distance).toBeLessThan(ropeAt(man.angle));
      expect(man.distance).toBeGreaterThan(ropeAt(man.angle) - 6);
    }
    expect(ropeAt(0)).toBeCloseTo(40);
    expect(ropeAt(180)).toBeCloseTo(20);
    for (const [name, p] of Object.entries(POSITIONS)) expect(nameOf(p.angle, 'deep' in p)).toBe(name);
  });

  it('leaves every field gaps to find', () => {
    for (const field of EVERY) {
      const open = Array.from({ length: 281 }, (_, i) => i - 140).filter(a =>
        (nearest(field, a, true)?.by ?? Infinity) > DEEP_REACH && (nearest(field, a, false)?.by ?? Infinity) > RING_REACH);
      expect(open.length, field.id).toBeGreaterThan(20);
    }
  });

  it('draws the six men nearest straight', () => {
    for (const bowler of BOWLERS) {
      const field = fieldFor({ bowler, over: 6 });
      const drawn = drawnOf(field);
      expect(drawn).toHaveLength(6);
      const widest = Math.max(...drawn.map(m => Math.abs(m.angle)));
      for (const man of field.men.filter(m => !drawn.includes(m))) expect(Math.abs(man.angle)).toBeGreaterThanOrEqual(widest);
    }
  });

  it('measures how far a ball passes a man, and nobody reaches one going behind him', () => {
    const man = { name: 'long-off', angle: 24, distance: 35, deep: true };
    expect(passes(man, 24)).toBe(0);
    expect(passes(man, 34)).toBeCloseTo(35 * Math.sin(10 * Math.PI / 180));
    expect(passes(man, 130)).toBe(Infinity);
  });
});

describe('the field\'s rules', () => {
  it('stops a four along the ground at a man in the ring half the time, a middled one a quarter', () => {
    const ring = one(32, 22, false);
    const stopped = fieldRules(struck(4), 33, ring, fixed(.4));
    expect(stopped.runs).toBeLessThanOrEqual(1);
    expect(stopped.fielder).toMatchObject({ name: 'mid-off', how: 'stopped' });
    expect(fieldLine(stopped)).toBe('STOPPED · MID-OFF');
    expect(fieldRules(struck(4), 33, ring, fixed(.6)).runs).toBe(4);
    const middled = struck(4, { timingGrade: 'PERFECT' });
    expect(fieldRules(middled, 33, ring, fixed(.3)).runs).toBe(4);
    expect(fieldRules(middled, 33, ring, fixed(.2)).fielder).toBeTruthy();
    // In the air, the ring cannot reach it.
    expect(fieldRules(struck(4, { aerial: true }), 32, ring, fixed(0)).runs).toBe(4);
  });

  it('has a boundary rider right behind a four cut it off for one or two', () => {
    const rider = one(24, 35, true);
    const cut = fieldRules(struck(4), 25, rider, fixed(.5));
    expect(cut).toMatchObject({ runs: 1, aerial: false, fielder: { how: 'cut', name: 'long-off' } });
    expect(fieldLine(cut)).toBe('CUT OFF · LONG-OFF');
    expect(fieldRules(struck(4), 25, rider, fixed(.8)).runs).toBe(2);
  });

  it('has one a few metres off it save it for two or three, or be beaten by it', () => {
    const rider = one(24, 35, true);
    const wide = 24 + Math.asin(6 / 35) * 180 / Math.PI;
    expect(fieldRules(struck(4), wide, rider, fixed(.5))).toMatchObject({ runs: 2, fielder: { how: 'saved' } });
    expect(fieldRules(struck(4), wide, rider, fixed(.65)).runs).toBe(4);
  });

  it('clears the rope with a middled six, and catches one that was not middled when he is under it', () => {
    const rider = one(24, 35, true);
    expect(fieldRules(struck(6), 24, rider, fixed(0)).runs).toBe(6);
    const mistimed = fieldRules(struck(6, { timingGrade: 'GOOD' }), 26, rider, fixed(0));
    expect(mistimed).toMatchObject({ isWicket: true, wicketType: 'CAUGHT', fielder: { how: 'caught' } });
    expect(fieldLine(mistimed)).toBe('LONG-OFF · ON THE ROPE');
    expect(fieldRules(struck(6, { timingGrade: 'GOOD' }), 60, rider, fixed(0)).runs).toBe(6);
  });

  it('takes one off a single or two along the ground at a man in the ring, half the time', () => {
    expect(fieldRules(struck(2), 32, one(32, 22, false), fixed(.4)).runs).toBe(1);
    expect(fieldRules(struck(2), 32, one(32, 22, false), fixed(.6)).runs).toBe(2);
  });

  it('leaves a ball into a gap as it was hit, and draws nothing for it', () => {
    const rng = counting();
    const death = fieldFor({ bowler: 'DEATH', over: 7 });
    expect(fieldRules(struck(6), 0, death, rng).runs).toBe(6);
    expect(fieldRules(struck(4), 0, death, rng).runs).toBe(4);
    expect(rng.drawn).toBe(0);
  });

  it('leaves the meter\'s strokes alone', () => {
    for (const extra of [{ advance: true }, { swept: true }, { scooped: true }]) {
      expect(fieldRules(struck(6, { ...extra, timingGrade: 'GOOD' }), 24, one(24, 35, true), fixed(0)).runs).toBe(6);
    }
  });

  it('turns a clean hit stretched to the end of its arc into a mishit half the time', () => {
    const fit = struck(4, { compatibility: .6 });
    const caught = fieldRules(fit, 0, fieldFor({ bowler: 'DEATH', over: 7 }), fixed(.3), STRETCH);
    expect(caught.isWicket).toBe(true);
    expect(fieldRules(fit, 0, fieldFor({ bowler: 'DEATH', over: 7 }), fixed(.6), STRETCH).runs).toBe(4);
    expect(fieldRules(struck(4), 0, fieldFor({ bowler: 'DEATH', over: 7 }), fixed(0), STRETCH).isWicket).toBe(false);
  });

  it('says which side a ball out of the picture went', () => {
    expect(offScreen(0)).toBeNull();
    expect(offScreen(-58)).toBe('leg');
    expect(offScreen(98)).toBe('off');
  });
});

describe('steering', () => {
  it('reads the swipe\'s place in its zone as the ball\'s place along the arc, and a key as the middle', () => {
    const cover = steerOf('COVER_LONG_OFF', struck(4))!;
    expect(steer(cover, 22.5).angle).toBe(12);
    expect(steer(cover, 67.5).angle).toBe(55);
    expect(steer(cover, 45).angle).toBeCloseTo(33.5);
    expect(steer(cover, undefined)).toEqual({ angle: 33.5, stretch: 0 });
    // Down and to leg is finer: the flick's swipe round to the block plays it to square leg.
    const flick = steerOf('LEG', struck(4), true)!;
    expect(steer(flick, -165).angle).toBe(-90);
    expect(steer(flick, -67.5).angle).toBe(-40);
  });

  it('costs nothing through the middle third and the most at the ends', () => {
    const straight = steerOf('STRAIGHT', struck(4))!;
    expect(steer(straight, 0).stretch).toBe(0);
    expect(steer(straight, 7).stretch).toBe(0);
    expect(steer(straight, 22.5).stretch).toBeCloseTo(STRETCH);
  });

  it('gives each of the leg side\'s strokes its own arc, and the meter\'s none', () => {
    expect(steerOf('LEG', struck(6, { hooked: true }))!.arc).toEqual([-140, -95]);
    expect(steerOf('LEG', struck(4, { sweptFlat: true }))!.arc).toEqual([-105, -60]);
    expect(steerOf('COVER_LONG_OFF', struck(4, { squared: true }))!.arc).toEqual([42, 78]);
    expect(steerOf('STRAIGHT', struck(6, { advance: true }))).toBeNull();
    expect(steerOf('DEFEND', struck(1))).toBeNull();
  });

  it('is what the scene draws the ball along, the timing\'s bend and all', () => {
    expect(sectorOf(struck(4, { angle: 40, timingDeltaMs: 224 }), 'COVER_LONG_OFF')).toBe(48);
    expect(sectorOf(struck(4), 'COVER_LONG_OFF')).toBe(24);
  });
});

describe('the bowler setting his field', () => {
  it('keeps his first field until the batter\'s boundaries say his other has the men for them', () => {
    // The death bowler's wide yorker has the off side back; a batter hitting him to leg brings the straight field.
    expect(planFor('DEATH', 7, { boundaries: [], newBatter: false })).toBe(0);
    expect(planFor('DEATH', 7, { boundaries: [-52], newBatter: false })).toBe(0);
    expect(planFor('DEATH', 7, { boundaries: [-52, -78], newBatter: false })).toBe(1);
    expect(planFor('DEATH', 7, { boundaries: [-52, -78, 100, 62, 140], newBatter: false })).toBe(0);
    // Only the last eight are read.
    expect(planFor('DEATH', 7, { boundaries: [100, 62, 140, 100, 62, -52, -78, -52, -78, -50, -80, -52, -78], newBatter: false })).toBe(1);
  });

  it('has the spinner attack a new batter, and only a new batter', () => {
    expect(planFor('SPIN', 3, { boundaries: [], newBatter: true })).toBe(1);
    expect(planFor('SPIN', 3, { boundaries: [-52, -78, 60, 22], newBatter: false })).toBe(0);
  });

  it('beckons the two men up for Power Surge, and signals nothing when nothing moves', () => {
    const sling = fieldFor({ bowler: 'SLING', over: 8 }), surge = fieldFor({ bowler: 'SLING', over: 8, surge: true });
    expect(surge.men.filter(m => m.deep)).toHaveLength(3);
    expect(surge.moved).toEqual(['LONG-ON IN', 'DEEP MIDWICKET IN']);
    expect(signalFor(sling, surge)?.kind).toBe('in');
    expect(signalFor(null, sling)).toBeNull();
    expect(signalFor(fieldFor({ bowler: 'SPIN', over: 3 }), fieldFor({ bowler: 'SPIN', over: 5 }))).toBeNull();
  });

  it('names who is bowling from the over\'s kind', () => {
    expect(bowlerOf('PACE', 0)).toBe('SWING');
    expect(bowlerOf('PACE', 1)).toBe('SEAM');
    expect(bowlerOf('EXPRESS', 4)).toBe('SLING');
    expect(bowlerOf('DEATH', 7)).toBe('DEATH');
  });
});

describe('Power Surge', () => {
  it('lights up after the fifth over, for the sixth to the eighth, goes on by itself in the ninth, and never in the tenth', () => {
    expect([4, 5, 6, 7, 8, 9].map(o => surgeOffered(o, false))).toEqual([false, true, true, true, false, false]);
    expect(surgeOffered(6, true)).toBe(false);
    expect(surgeAuto(8, false)).toBe(true);
    expect(surgeAuto(8, true)).toBe(false);
    expect(surgeAuto(9, false)).toBe(false);
  });
});

describe('the bowler\'s signals', () => {
  const spot = { x: 8, z: 20, heading: Math.atan2(-8, -20) };
  const to = { x: 20, z: 30 };
  const turn = (a: number, b: number) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
  it('turns him to the man and puts an arm where an arm can go, then lets it down', () => {
    for (const kind of ['point', 'back', 'in'] as const) {
      const action = signal(spot, to, 0, kind);
      const peak = action.at(480), after = action.at(SIGNAL_MS);
      expect(turn(peak.heading, Math.atan2(to.x - spot.x, to.z - spot.z))).toBeLessThan(.05);
      const shoulder = new THREE.Vector3(BUILD.shoulderX, peak.pose.chest.y + BUILD.shoulderY, 0);
      expect(peak.pose.rightHand.distanceTo(shoulder)).toBeLessThanOrEqual(ARM_REACH);
      // Up for every signal but the beckon, which is low and in front.
      if (kind !== 'in') expect(peak.pose.rightHand.y).toBeGreaterThan(shoulder.y);
      expect(peak.pose.rightHand.z).toBeGreaterThan(0);
      expect(after.pose.rightHand.y).toBeLessThan(peak.pose.hip.y + .1);
      expect(turn(after.heading, spot.heading)).toBeLessThan(.01);
    }
  });
});
