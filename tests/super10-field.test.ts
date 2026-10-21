import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { ARM_REACH, BUILD } from '../src/entities/Cricketer';
import { SIGNAL_MS, signal } from '../src/entities/Fielder';
import { SHOT_ANGLES } from '../src/config/gameplay';
import { SUPER10, type Bowler } from '../src/config/super10';
import {
  CUT_SINGLE, GUARD, PAR, ROPE_CATCH, bowlerOf, captainCall, drawnOf, signalFor, fieldFor, fieldRules, guardOf, nameOf, offScreen, ropeAt, ropeLine,
  surgeOffered, surgeOn,
} from '../src/game/super10-field';
import type { ShotOutcome, ShotType } from '../src/game/types';
import { sectorOf } from '../src/scene/flight';

const BOWLERS: Bowler[] = ['SWING', 'SEAM', 'SPIN', 'SLING', 'DEATH'];
const struck = (runs: 4 | 6, extra: Partial<ShotOutcome> = {}): ShotOutcome => ({
  runs, isWicket: false, quality: 1, feedback: runs === 6 ? 'SIX!' : 'FOUR!', timingGrade: runs === 6 ? 'PERFECT' : 'GOOD',
  timingDeltaMs: 0, compatibility: 1, madeBatContact: true, aerial: runs === 6, ...extra,
});
const fixed = (value: number) => ({ next: () => value });

describe('the Super10 field', () => {
  it('has nine men in every field, the captain at mid-off among them', () => {
    for (const bowler of BOWLERS) for (const over of [0, 5]) {
      const field = fieldFor({ bowler, over });
      expect(field.men).toHaveLength(9);
      const captain = field.men.filter(m => m.captain);
      expect(captain).toHaveLength(1);
      expect(nameOf(captain[0].angle, captain[0].deep)).toBe('mid-off');
    }
  });

  it('keeps two men back at most in the Powerplay, and four after it', () => {
    for (const bowler of BOWLERS) for (let over = 0; over < SUPER10.overs; over++) {
      const back = fieldFor({ bowler, over }).men.filter(m => m.deep).length;
      if (over < SUPER10.powerplay) expect(back).toBeLessThanOrEqual(2);
      expect(back).toBeLessThanOrEqual(4);
    }
  });

  it('stands its boundary riders inside the rope', () => {
    for (const bowler of BOWLERS) for (const man of fieldFor({ bowler, over: 6 }).men.filter(m => m.deep)) {
      expect(man.distance).toBeLessThan(ropeAt(man.angle));
      expect(man.distance).toBeGreaterThan(ropeAt(man.angle) - 6);
    }
    expect(ropeAt(0)).toBeCloseTo(40);
    expect(ropeAt(180)).toBeCloseTo(20);
  });

  it('leaves every bowler\'s field a lane up the ground or square to hit', () => {
    const lanes: ShotType[] = ['LEG', 'LONG_ON', 'STRAIGHT', 'COVER_LONG_OFF', 'SQUARE_CUT'];
    for (const bowler of BOWLERS) for (const over of [0, 6]) {
      const field = fieldFor({ bowler, over });
      expect(lanes.some(shot => !guardOf(field, SHOT_ANGLES[shot]))).toBe(true);
    }
  });

  it('is told apart by its id, the same for the same field', () => {
    expect(fieldFor({ bowler: 'SEAM', over: 1 }).id).not.toBe(fieldFor({ bowler: 'SEAM', over: 6 }).id);
    expect(fieldFor({ bowler: 'SPIN', over: 3 }).id).toBe(fieldFor({ bowler: 'SPIN', over: 5 }).id);
    expect(fieldFor({ bowler: 'SPIN', over: 5, surge: true }).id).not.toBe(fieldFor({ bowler: 'SPIN', over: 5 }).id);
  });

  it('draws the captain and the five men nearest straight', () => {
    for (const bowler of BOWLERS) {
      const field = fieldFor({ bowler, over: 6 });
      const drawn = drawnOf(field);
      expect(drawn).toHaveLength(6);
      expect(drawn[0].captain).toBe(true);
      const widest = Math.max(...drawn.slice(1).map(m => Math.abs(m.angle)));
      for (const man of field.men.filter(m => !drawn.includes(m))) expect(Math.abs(man.angle)).toBeGreaterThanOrEqual(widest);
    }
  });

  it('names positions as a scorer would', () => {
    expect(nameOf(-15, true)).toBe('long-on');
    expect(nameOf(98, true)).toBe('deep point');
    expect(nameOf(-160, true)).toBe('fine leg');
    expect(nameOf(150, true)).toBe('third man');
    expect(nameOf(-58, true)).toBe('deep midwicket');
    expect(nameOf(50, false)).toBe('cover');
  });
});

describe('the field\'s rules', () => {
  const death = fieldFor({ bowler: 'DEATH', over: 7 });

  it('cuts off a four struck at a boundary rider, for one or two', () => {
    const four = struck(4);
    const single = fieldRules(four, 'LONG_ON', death, fixed(CUT_SINGLE - .01));
    expect(single).toMatchObject({ runs: 1, isWicket: false, aerial: false, rope: { name: 'long-on' } });
    expect(fieldRules(four, 'LONG_ON', death, fixed(CUT_SINGLE + .01)).runs).toBe(2);
    expect(ropeLine(single)).toBe('CUT OFF · LONG-ON');
  });

  it('catches a six struck at one on the rope three times in ten', () => {
    const caught = fieldRules(struck(6), 'COVER_LONG_OFF', death, fixed(ROPE_CATCH - .01));
    expect(caught).toMatchObject({ runs: 0, isWicket: true, wicketType: 'CAUGHT', rope: { name: 'long-off' } });
    expect(ropeLine(caught)).toBe('LONG-OFF · ON THE ROPE');
    expect(fieldRules(struck(6), 'COVER_LONG_OFF', death, fixed(ROPE_CATCH + .01)).runs).toBe(6);
  });

  it('leaves a ball into a gap as it was hit, and draws nothing for it', () => {
    let drawn = 0;
    const rng = { next: () => { drawn++; return 0; } };
    // Straight, middled on time: fifteen degrees from either long boundary.
    expect(fieldRules(struck(6), 'STRAIGHT', death, rng).runs).toBe(6);
    expect(fieldRules(struck(4), 'STRAIGHT', death, rng).runs).toBe(4);
    expect(drawn).toBe(0);
  });

  it('judges the line the ball is drawn along, timing and all', () => {
    // A shade early pulls a straight hit round towards long-on, into his reach.
    const early = struck(4, { timingDeltaMs: -224 });
    expect(sectorOf(early, 'STRAIGHT')).toBe(-8);
    expect(Math.abs(-8 - -15)).toBeLessThan(GUARD);
    expect(fieldRules(early, 'STRAIGHT', death, fixed(0)).rope?.name).toBe('long-on');
  });

  it('leaves the meter\'s strokes and everything but a boundary alone', () => {
    for (const extra of [{ advance: true }, { swept: true }, { scooped: true }]) {
      expect(fieldRules(struck(6, extra), 'LONG_ON', death, fixed(0)).runs).toBe(6);
    }
    const two = { ...struck(4), runs: 2 as const };
    expect(fieldRules(two, 'LONG_ON', death, fixed(0))).toBe(two);
  });

  it('says which side a ball out of the picture went', () => {
    expect(offScreen(0)).toBeNull();
    expect(offScreen(-58)).toBe('leg');
    expect(offScreen(98)).toBe('off');
  });
});

describe('the captain', () => {
  it('reads the innings at the top of the sixth over and the eighth, against par', () => {
    expect(captainCall(PAR * 5 + 13, 5, null)).toBe('tight');
    expect(captainCall(PAR * 5 - 13, 5, null)).toBe('attack');
    expect(captainCall(PAR * 5, 5, 'tight')).toBeNull();
    expect(captainCall(PAR * 7 + 11, 7, null)).toBe('tight');
    // In between he keeps what he called.
    expect(captainCall(0, 6, 'tight')).toBe('tight');
  });

  it('spreads the field where the runs are going', () => {
    const scored = [100, 98, 104, 0];
    const tight = fieldFor({ bowler: 'SPIN', over: 5, captain: 'tight', scored });
    expect(tight.change).toBe('captain');
    expect(tight.men.filter(m => m.deep)).toHaveLength(5);
    expect(guardOf(tight, 100)?.angle).toBe(100);
    expect(tight.moved).toEqual(['DEEP POINT BACK']);
    // The captain stays where he is.
    expect(tight.men.find(m => m.captain)?.deep).toBe(false);
  });

  it('attacks by bringing up the man the batter has hit least past', () => {
    const attack = fieldFor({ bowler: 'DEATH', over: 7, captain: 'attack', scored: [-15, -15, 15, 98] });
    expect(attack.men.filter(m => m.deep)).toHaveLength(3);
    expect(attack.moved).toEqual(['DEEP MIDWICKET IN']);
  });

  it('changes nothing in the Powerplay', () => {
    expect(fieldFor({ bowler: 'SWING', over: 2, captain: 'tight' }).change).toBeNull();
  });
});

describe('Power Surge', () => {
  it('brings the two men back nearest straight into the ring', () => {
    const surge = fieldFor({ bowler: 'DEATH', over: 7, surge: true });
    expect(surge.change).toBe('surge');
    expect(surge.men.filter(m => m.deep).map(m => m.angle).sort((a, b) => a - b)).toEqual([-58, 98]);
    expect(surge.moved).toEqual(['LONG-ON IN', 'LONG-OFF IN']);
  });

  it('is offered from the fourth over to be taken in the next, and goes on by itself in the ninth', () => {
    expect(surgeOffered(2, null)).toBe(false);
    expect(surgeOffered(3, null)).toBe(true);
    expect(surgeOffered(7, null)).toBe(true);
    expect(surgeOffered(8, null)).toBe(false);
    expect(surgeOffered(5, 5)).toBe(false);
    expect(surgeOn(4, 4)).toBe(true);
    expect(surgeOn(8, null)).toBe(true);
    expect(surgeOn(8, 5)).toBe(false);
    expect(surgeOn(6, null)).toBe(false);
  });
});

describe('the captain\'s signal', () => {
  it('waves a man back to the rope, beckons one up, and points otherwise', () => {
    const spin = fieldFor({ bowler: 'SPIN', over: 5 });
    const tight = fieldFor({ bowler: 'SPIN', over: 5, captain: 'tight', scored: [100] });
    expect(signalFor(spin, tight)).toMatchObject({ kind: 'back', man: { angle: 100, deep: true } });
    const surge = fieldFor({ bowler: 'SPIN', over: 5, surge: true });
    expect(signalFor(spin, surge)?.kind).toBe('in');
    expect(signalFor(null, spin)).toBeNull();
    expect(signalFor(spin, fieldFor({ bowler: 'SPIN', over: 6 }))).toBeNull();
  });

  it('names who is bowling from the over\'s kind', () => {
    expect(bowlerOf('PACE', 0)).toBe('SWING');
    expect(bowlerOf('PACE', 1)).toBe('SEAM');
    expect(bowlerOf('EXPRESS', 4)).toBe('SLING');
    expect(bowlerOf('DEATH', 7)).toBe('DEATH');
  });
});

describe('the captain\'s signals', () => {
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
