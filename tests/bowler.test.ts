import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { ACTION_MS, Bowler, EXPRESS_ACTION, PACE_ACTION, PHASES, RELEASE_Z, RUNUP_START_Z, type ActionStyle } from '../src/entities/Bowler';
import { Cricketer } from '../src/entities/Cricketer';
import { GAME } from '../src/config/gameplay';
import { ballPosition } from '../src/game/DeliveryTrajectory';
import type { Delivery } from '../src/game/types';

const bowler = new Bowler();
/** Every frame of the run-up, and of the follow-through that runs on from it. */
const runup = (steps = 240) => Array.from({ length: steps + 1 }, (_, i) => i / steps);
const at = (t: number) => { bowler.runup(t); return bowler.figure.inspect(); };
/** `p` is progress through the ball's flight: follow-through, then standing up. */
const flight = (p: number) => { bowler.followThrough(p); return bowler.figure.inspect(); };

/** The popping crease at the bowler's end: in front of it is a no-ball. */
const POPPING_CREASE = 18.7 - GAME.creaseZ;

/**
 * Both actions, held to the same rules. The express bowler looks nothing like
 * the fast bowler on the way in, but the ball leaves from the same hand at the
 * same moment, the arm is as straight, and no limb is let past its length —
 * so every test of the action is a test of both.
 */
const ACTIONS: [string, ActionStyle][] = [['the fast bowler', PACE_ACTION], ['the express bowler', EXPRESS_ACTION]];

describe.each(ACTIONS)('the bowling action — %s', (_, style) => {
  beforeEach(() => bowler.action(style));

    it('puts the ball in his hand where the delivery starts from', () => {
      bowler.runup(1);
      const hand = bowler.releasePoint();
      const spawn = ballPosition({ baseTargetX: 0, finalTargetX: 0, bounceZ: GAME.bounceZ, rise: GAME.rise } as Delivery, 0);
      // The ball is handed over to its own trajectory at exactly this moment, so
      // if the hand is not there the ball appears out of the air beside him.
      expect(Math.abs(hand.y - spawn.y)).toBeLessThan(.08);
      expect(Math.abs(hand.z - spawn.z)).toBeLessThan(.12);
      expect(Math.abs(hand.x - spawn.x)).toBeLessThan(.20);
    });

    it('releases from up over the head, not from the shoulder', () => {
      const { hands, shoulders } = at(1);
      // The whole point of the rebuild: the arm used to park at shoulder height.
      expect(hands[1][1]).toBeGreaterThan(shoulders[1][1] + .5);
      expect(hands[1][1]).toBeGreaterThan(2);
    });

    it('bowls with a straight arm from the gather to the release', () => {
      // A bent arm through the delivery swing is a throw, and it is the one thing
      // the laws actually measure. Reaching its full length is what proves it: a
      // hand held at full stretch from the shoulder leaves the elbow nothing to
      // bend with.
      for (const t of [.75, .82, .88, .93, .97, 1]) {
        expect(at(t).armReach[1]).toBeGreaterThan(.99);
      }
    });

    it('swings the arm up behind him and over the top, once', () => {
      // Measured as the hand's height: down at the gather, then climbing without
      // ever dropping back, all the way to the top of the circle. Sampled finely,
      // because the sweep accelerates — most of the arc is in the last of it, and
      // a coarse grid misses the top entirely.
      const steps = 400;
      const heights = Array.from({ length: steps + 1 }, (_, i) =>
        at(PHASES.BACK_FOOT + (1 - PHASES.BACK_FOOT) * (i / steps)).hands[1][1]);
      const apex = heights.indexOf(Math.max(...heights));
      // To a tenth of a millimetre: an arm hanging straight down, as the express
    // bowler's does, climbs from a standstill, and the body settling under it
    // can outweigh the first instant of the climb by less than that.
    for (let i = 1; i <= apex; i++) expect(heights[i]).toBeGreaterThan(heights[i - 1] - 1e-4);
      expect(heights[0]).toBeLessThan(1.2);
      // Release is the far side of the top — a ball let go at the very apex is one
      // that has not been bowled over the top of the arm at all — so the hand is a
      // shade below its highest point by the time the ball goes, and the top is
      // only just behind it.
      const release = at(1).hands[1][1];
      expect(release).toBeLessThan(heights[apex]);
      expect(heights[apex] - release).toBeLessThan(.12);
      expect(apex / steps).toBeGreaterThan(.9);
      // And behind him before it comes over: the hand is back past his hips.
      // Measured from the hips rather than the chest, which an action that
      // arches away from the target carries back with it.
      const gather = at(.74);
      expect(gather.hands[1][2]).toBeGreaterThan(gather.hip[2] + .3);
    });

    it('whips the arm over, fastest at the ball and still fast after it', () => {
      // How quickly the bowling arm is rotating, in radians per second, measured
      // off the hand going round the shoulder.
      const rate = (fromMs: number, toMs: number) => {
        const angle = (ms: number) => {
          bowler.animate(ms);
          const s = bowler.figure.inspect();
          const [, hy, hz] = s.hands[1], [, sy, sz] = s.shoulders[1];
          return Math.atan2(-(hz - sz), hy - sy);
        };
        let a = angle(fromMs), b = angle(toMs), d = b - a;
        while (d > Math.PI) d -= 2 * Math.PI;
        while (d < -Math.PI) d += 2 * Math.PI;
        return Math.abs(d) / ((toMs - fromMs) / 1000);
      };
      const R = GAME.runupMs;
      // A fast bowler's arm is doing 25-30 rad/s as the ball goes. It used to
      // reach 18 and then fall off a cliff to 5 the moment it let go, and an arm
      // that stops at release is what a slow action actually looks like — the eye
      // follows it through the ball and sees it stop.
      const atRelease = rate(R - 25, R);
      expect(atRelease).toBeGreaterThan(18);
      // And it carries: no stall on the far side of the ball.
      const justAfter = rate(R, R + 25);
      expect(justAfter).toBeGreaterThan(atRelease * .7);
      // The sweep accelerates into the ball rather than running at one rate.
      expect(atRelease).toBeGreaterThan(rate(R - 200, R - 150) * 2);
    });

    it('turns side-on for the gather and comes back through to face the batter', () => {
      // Side-on means the shoulders have turned across the line he is running.
      const side = at(.72), release = at(1);
      const turn = (s: ReturnType<typeof at>) => Math.abs(s.shoulders[0][2] - s.shoulders[1][2]);
      expect(turn(side)).toBeGreaterThan(.20);
      expect(turn(release)).toBeLessThan(turn(side));
    });

    it('keeps every limb inside its own length, right through the action', () => {
      // Past its length the two-bone solver clamps and the shin stops short of
      // the foot, which on screen is a leg that has come off at the knee.
      for (const t of runup()) {
        const s = at(t);
        for (const reach of [...s.legReach, ...s.armReach]) expect(reach).toBeLessThanOrEqual(1);
      }
      for (const p of runup(120)) {
        const s = flight(p);
        for (const reach of [...s.legReach, ...s.armReach]) expect(reach).toBeLessThanOrEqual(1);
      }
    });

    it('never puts a foot through the ground', () => {
      for (const t of runup()) for (const foot of at(t).feet) expect(foot[1]).toBeGreaterThan(.02);
      for (const p of runup(120)) for (const foot of flight(p).feet) expect(foot[1]).toBeGreaterThan(.02);
    });

    it('leaves a planted foot exactly where it was put', () => {
      // A foot that slides while it is bearing weight is the tell of a figure
      // being dragged along rather than running, so both plants are measured in
      // the world the bowler is travelling through, not in his own frame.
      const world = (t: number, foot: 0 | 1) => {
        const s = at(t);
        return new THREE.Vector3(...s.feet[foot]).add(bowler.root.position);
      };
      /** Five samples across a window, taken from the phase boundaries themselves. */
      const across = (from: number, to: number) =>
        Array.from({ length: 5 }, (_, i) => from + (to - from) * (i / 4));
      // The front foot is braced from the moment it lands until the ball has gone.
      const braced = across(PHASES.FRONT_FOOT, 1).map(t => world(t, 0));
      for (const spot of braced) expect(spot.distanceTo(braced[0])).toBeLessThan(.01);
      // And the back foot holds its mark while he runs up over it, until the
      // body has gone past and it is picked up again.
      const back = across(PHASES.BACK_FOOT, PHASES.BACK_LIFT).map(t => world(t, 1));
      for (const spot of back) expect(spot.distanceTo(back[0])).toBeLessThan(.01);
    });

    it('runs in from the top of a mark and lands the front foot behind the crease', () => {
      bowler.runup(0);
      expect(bowler.root.position.z).toBeCloseTo(RUNUP_START_Z, 5);
      bowler.runup(1);
      expect(bowler.root.position.z).toBeCloseTo(RELEASE_Z, 5);
      // Landing in front of the popping crease is a no-ball, and the game has no
      // way to call one — so the action has to be legal by construction.
      const frontFoot = at(1).feet[0][2] + bowler.root.position.z;
      expect(frontFoot).toBeGreaterThan(POPPING_CREASE);
      // He does travel: a run-up rather than a shuffle on the spot, but a short
      // one — the bound and the delivery stride are most of what there is to see,
      // and a long approach only spends the batter's waiting time on jogging.
      const approach = RUNUP_START_Z - RELEASE_Z;
      expect(approach).toBeGreaterThan(4);
      expect(approach).toBeLessThan(6);
    });

    it('carries its momentum into the crease instead of stalling there', () => {
      // The run-up builds speed and the delivery is what spends it, so the fastest
      // he moves all day is the leap and the two strides after it. He used to run
      // in at 6.6 m/s, leap at 8.3, and then crawl through the gather at 3.4 and
      // the delivery stride at 2.8 — losing every bit of it in the one part of
      // the action it is for, which reads exactly as it sounds: a man who runs up
      // and then thinks about it.
      const speed = (from: number, to: number) => {
        bowler.runup(from); const a = bowler.root.position.z;
        bowler.runup(to); const b = bowler.root.position.z;
        return (a - b) / ((to - from) * GAME.runupMs / 1000);
      };
      // Averaged over the whole approach: it accelerates, so sampling only its
      // fast end would set the bar at a speed he is never asked to hold.
      const approach = speed(0, PHASES.BOUND);
      const bound = speed(PHASES.BOUND, PHASES.BACK_FOOT);
      const gather = speed(PHASES.BACK_FOOT, PHASES.STRIDE_START);
      const stride = speed(PHASES.STRIDE_START, 1);
      // The leap is the quickest thing in it.
      expect(bound).toBeGreaterThan(approach);
      // And nothing after it drops away. Not merely "close to" the run-in either:
      // both the gather and the delivery stride are quicker than it. Against a
      // fast approach anything short of faster reads as slower, which is why the
      // approach came down as much as the delivery went up — at 6.9 in and 6.1
      // through the stride the arithmetic was nearly level and it still looked
      // like a man losing momentum.
      expect(gather).toBeGreaterThan(approach);
      expect(stride).toBeGreaterThan(approach);
      // The leap stays the quickest thing in the action, though.
      expect(bound).toBeGreaterThan(gather);
      // A delivery stride is a stride, not a step: the ground between where the
      // back foot lands and where the front one does is longer than his leg.
      const world = (t: number, foot: 0 | 1) => {
        bowler.runup(t);
        return bowler.figure.inspect().feet[foot][2] + bowler.root.position.z;
      };
      const back = world(PHASES.BACK_FOOT, 1), front = world(1, 0);
      expect(back - front).toBeGreaterThan(1.2);
    });

    it('always moves down the pitch and never backs up', () => {
      let previous = Infinity;
      for (const t of runup()) {
        bowler.runup(t);
        expect(bowler.root.position.z).toBeLessThanOrEqual(previous + 1e-9);
        previous = bowler.root.position.z;
      }
      // And the follow-through carries him on past the crease rather than stopping
      // dead on the popping crease the moment the ball has gone.
      bowler.followThrough(.34);
      expect(bowler.root.position.z).toBeLessThan(POPPING_CREASE);
    });

    it('falls away before it stands up, rather than jumping to the end', () => {
      // The follow-through has to actually run: the body travels on past the
      // crease over the first third of it. Pinning that to its finished value and
      // only animating the stand-up teleports him a stride and a half forward at
      // the instant the ball leaves his hand.
      const marks = [0, .1, .2, .34].map(p => { bowler.followThrough(p); return bowler.root.position.z; });
      for (let i = 1; i < marks.length; i++) expect(marks[i]).toBeLessThan(marks[i - 1]);
      // And having run off, he stays where he stopped rather than drifting on.
      bowler.followThrough(.34);
      const stopped = bowler.root.position.z;
      bowler.followThrough(1);
      expect(bowler.root.position.z).toBeCloseTo(stopped, 5);
    });

    it('gets back on his feet instead of holding the follow-through', () => {
      // Freezing on the last frame of a follow-through leaves a man bent double
      // over his own knee until the next ball, which is the tell of an animation
      // that stopped rather than finished.
      const bent = flight(.34);
      const stood = flight(1);
      expect(Math.abs(stood.lean)).toBeLessThan(.05);
      expect(Math.abs(stood.lean)).toBeLessThan(Math.abs(bent.lean));
      // Upright: the chest back over the hips rather than thrown out past them.
      expect(Math.abs(stood.chest[2] - stood.hip[2])).toBeLessThan(.06);
      expect(stood.chest[1] - stood.hip[1]).toBeGreaterThan(.4);
      // Both feet under him, and his hands down by his sides.
      for (const foot of stood.feet) expect(foot[1]).toBeLessThan(.09);
      for (let i = 0; i < 2; i++) expect(stood.hands[i][1]).toBeLessThan(stood.shoulders[i][1]);
      // And he is still facing the batter, watching the shot.
      expect(Math.abs(stood.yaw - Math.PI)).toBeLessThan(.1);
    });

    it('stands like a man standing, at both ends of the action', () => {
      // He waits at his mark in full view of the batter for half a second before
      // every ball, and stands again once it has gone. Both used to be frames of
      // the run held still: feet staggered mid-stride, and the arms carried at
      // the shortened reach a runner pumps them at, which puts both elbows out
      // and reads as a man stopped rather than a man standing. Both are the one
      // resting pose now, so there is a single answer to what standing looks like
      // and a single place it is written down.
      const other = new Cricketer();
      other.apply(other.rest());
      const resting = other.inspect();
      for (const stood of [at(0), flight(1)]) {
        // Knees all but straight. A leg carrying weight at 86% of its length is a
        // crouch, and a man crouching while he waits reads as braced for
        // something — which is a fielder watching a stroke, not a bowler at the
        // top of his mark with nothing to do yet.
        for (const reach of stood.legReach) expect(reach).toBeGreaterThan(.95);
        expect(stood.hip[1]).toBeCloseTo(resting.hip[1], 5);
        for (let i = 0; i < 2; i++) {
          // Arms hanging, not folded up against the ribs.
          expect(stood.armReach[i]).toBeCloseTo(resting.armReach[i], 5);
          expect(stood.armReach[i]).toBeGreaterThan(.85);
          expect(stood.legReach[i]).toBeCloseTo(resting.legReach[i], 5);
          expect(stood.feet[i][1]).toBeCloseTo(resting.feet[i][1], 5);
        }
        // Weight on both feet, level, and squarely apart rather than staggered.
        expect(stood.feet[0][1]).toBeCloseTo(stood.feet[1][1], 5);
        expect(Math.abs(stood.feet[0][2] - stood.feet[1][2])).toBeLessThan(.2);
        // Feet apart, about hip width — not together, and not crossed.
        expect(Math.abs(stood.feet[0][0] - stood.feet[1][0])).toBeGreaterThan(.18);
      }
    });

    it('stands still at the top of his mark', () => {
      // The batter looks at this frame for half a second before every ball, so a
      // bowler frozen mid-stride with a foot in the air is the one pose that has
      // to be right.
      const s = at(0);
      for (const foot of s.feet) expect(foot[1]).toBeLessThan(.09);
    });
});

describe.each(ACTIONS)('the action is the disguise — %s', (_, style) => {
  beforeEach(() => bowler.action(style));

    // A bowler runs in and bowls at the same tempo every ball, and what changes
    // is the ball. That is the whole trick of a slower one: it comes out of the
    // same arm at the same speed, the batter reads the action, commits, and finds
    // the ball is not where the action said it would be. An action that slowed
    // down with the ball would announce every variation a second before it
    // arrived, and there would be nothing left to be deceived by.
    const poses = (ms: number) => { bowler.animate(ms); return bowler.figure.inspect(); };
    const frames = Array.from({ length: 60 }, (_, i) => i / 59 * ACTION_MS);

    it('cannot be told how fast the ball is', () => {
      // Not a matter of it happening not to look: there is nowhere to put it.
      // `animate` takes a time and nothing else, so a delivery cannot reach the
      // action even by accident.
      expect(bowler.animate.length).toBe(1);
      expect(bowler.runup.length).toBe(1);
      expect(bowler.followThrough.length).toBe(1);
    });

    it('is the same pose at the same moment, every ball', () => {
      // Two overs bowled at wildly different speeds are the same animation: the
      // pose at 400ms is the pose at 400ms.
      const first = frames.map(poses).map(s => JSON.stringify(s));
      // Run some unrelated work between, as a whole innings would.
      bowler.animate(0); bowler.reset(); bowler.animate(ACTION_MS * .5);
      const second = frames.map(poses).map(s => JSON.stringify(s));
      expect(second).toEqual(first);
    });

    it('hands the ball over exactly when the run-up ends', () => {
      // The action's clock and the game's have to agree on the moment of release,
      // or the ball leaves before or after the arm does.
      bowler.animate(GAME.runupMs);
      const atRelease = bowler.releasePoint().toArray();
      bowler.runup(1);
      expect(bowler.releasePoint().toArray()).toEqual(atRelease);
    });

    it('runs the run-up into the follow-through without a jump at the join', () => {
      // One timeline in two halves is two chances to disagree at the seam, and a
      // seam that disagrees is a bowler who twitches at the moment of release —
      // the one frame the batter is looking hardest at.
      const earlier = poses(GAME.runupMs - 3);
      const before = poses(GAME.runupMs - 1);
      const after = poses(GAME.runupMs + 1);
      expect(Math.abs(after.hip[1] - before.hip[1])).toBeLessThan(.01);
      for (let i = 0; i < 2; i++) {
        // The bowling hand is the fastest thing on the field at the release,
        // so it is held to its own pace rather than a fixed distance: across
        // the join it moves no further than it did over the same two
        // milliseconds just before it.
        const gap = Math.hypot(...after.hands[i].map((v, k) => v - before.hands[i][k]));
        const pace = Math.hypot(...before.hands[i].map((v, k) => v - earlier.hands[i][k]));
        expect(gap).toBeLessThan(Math.max(.05, pace * 1.3));
        const step = Math.hypot(...after.feet[i].map((v, k) => v - before.feet[i][k]));
        expect(step).toBeLessThan(.05);
      }
    });

    it('keeps every limb inside its length across the whole timeline', () => {
      for (const ms of frames) {
        const s = poses(ms);
        for (const reach of [...s.legReach, ...s.armReach]) expect(reach).toBeLessThanOrEqual(1);
      }
    });
});

describe('the express bowler, against the fast bowler', () => {
  // The Marathon's Level 3 bowler is a slinger, after a slow-motion reference:
  // the same run and the same release, and the shape of everything between his
  // own. Each test here is one thing anyone who has watched the reference
  // remembers, and each is measured against the fast bowler at the same
  // moment, so it holds only while the two actually look different.
  const both = <T>(read: () => T): [T, T] => {
    bowler.action(PACE_ACTION); const pace = read();
    bowler.action(EXPRESS_ACTION); const express = read();
    bowler.action(PACE_ACTION);
    return [pace, express];
  };
  const pose = (t: number) => () => at(t);
  /** How far round from facing the batter he is, in degrees. */
  const turned = (s: ReturnType<typeof at>) => (s.yaw - Math.PI) * 180 / Math.PI;

  it('runs in with the ball held at his chest in both hands', () => {
    const [pace, express] = both(pose(.3));
    // Hands together, in front of the chest, at its height: the fast bowler's
    // pump has them a shoulder-width apart and by his hips.
    const apart = (s: ReturnType<typeof at>) => Math.hypot(...s.hands[0].map((v, k) => v - s.hands[1][k]));
    expect(apart(express)).toBeLessThan(.15);
    expect(apart(pace)).toBeGreaterThan(.4);
    for (const hand of express.hands) {
      expect(hand[1]).toBeGreaterThan(express.chest[1] - .2);
      expect(hand[2]).toBeLessThan(express.chest[2] - .15);
    }
  });

  it('leaps higher, knee driven up, and side-on rather than past it', () => {
    const [paceAir, expressAir] = both(pose(.62));
    expect(expressAir.hip[1]).toBeGreaterThan(paceAir.hip[1] + .08);
    expect(expressAir.feet[0][1]).toBeGreaterThan(paceAir.feet[0][1] + .1);
    const [pace, express] = both(pose(PHASES.BACK_FOOT));
    expect(turned(express)).toBeGreaterThan(turned(pace) + 8);
    expect(turned(express)).toBeLessThan(90);
  });

  it('gathers with the ball arm hanging low and wide behind him', () => {
    const [pace, express] = both(pose(PHASES.BACK_FOOT));
    // Out to his side: the fast bowler's hangs straight down.
    const out = (s: ReturnType<typeof at>) => Math.abs(s.hands[1][0] - s.shoulders[1][0]);
    expect(out(express)).toBeGreaterThan(out(pace) + .2);
    expect(express.hands[1][1]).toBeLessThan(express.shoulders[1][1] - .3);
    // And the front arm straight up over his head.
    expect(express.hands[0][1]).toBeGreaterThan(express.shoulders[0][1] + .5);
  });

  it('chops the front arm down straight in front of him, not bent and behind', () => {
    // Facing the batter, -z is in front. The fast bowler pulls his down
    // behind and folds it into his ribs; the slinger's stays straight.
    const front = (s: ReturnType<typeof at>) => s.hands[0][2] - s.shoulders[0][2];
    for (const t of [.9, .93, 1]) {
      const [pace, express] = both(pose(t));
      expect(front(express)).toBeLessThan(-.15);
      expect(front(pace)).toBeGreaterThan(front(express) + .2);
      expect(express.armReach[0]).toBeGreaterThan(.9);
    }
    expect(at(1).armReach[0]).toBeLessThan(.6);
  });

  it('slings it: the arm comes through wide of the shoulder, the body tilted away', () => {
    const [pace, express] = both(pose(1));
    // The hand out to his right at the release, where the fast bowler's is
    // all but over his head.
    const wide = (s: ReturnType<typeof at>) => Math.abs(s.hands[1][0] - s.shoulders[1][0]);
    expect(wide(express)).toBeGreaterThan(.33);
    expect(wide(express)).toBeGreaterThan(wide(pace) + .2);
    // Tilted away to his left: the bowling shoulder the higher of the two.
    expect(express.shoulders[1][1]).toBeGreaterThan(express.shoulders[0][1] + .08);
    expect(pace.shoulders[1][1]).toBeLessThan(pace.shoulders[0][1]);
  });

  it('runs in from a wider lane, so the slung arm still arrives where the ball starts', () => {
    const [paceLane, expressLane] = both(() => { bowler.runup(.3); return bowler.root.position.x; });
    expect(expressLane).toBeGreaterThan(paceLane + .2);
    // Faster in the arm and wider in the lane: the ball is handed over from
    // the same point, so a batter who has learned the fast bowler's release
    // has learned his.
    const [paceHand, expressHand] = both(() => { bowler.runup(1); return bowler.releasePoint(); });
    expect(expressHand.distanceTo(paceHand)).toBeLessThan(.12);
    const rate = () => {
      const angle = (ms: number) => {
        bowler.animate(ms);
        const s = bowler.figure.inspect();
        return Math.atan2(-(s.hands[1][2] - s.shoulders[1][2]), s.hands[1][1] - s.shoulders[1][1]);
      };
      return Math.abs(angle(GAME.runupMs) - angle(GAME.runupMs - 25)) / .025;
    };
    const [paceRate, expressRate] = both(rate);
    expect(expressRate).toBeGreaterThan(paceRate * 1.1);
  });

  it('spins the chest on round over hips that keep going, the arms flung across and back', () => {
    const [pace, express] = both(() => flight(.34));
    // Across: the hand finishes on the far side of him from where it came over.
    expect(express.hands[1][0]).toBeGreaterThan(express.shoulders[1][0] + .1);
    expect(pace.hands[1][0]).toBeLessThan(pace.shoulders[1][0] + .05);
    // The front arm flung out straight behind him, fingers up: the fast
    // bowler's stays tucked at his hip.
    expect(express.hands[0][2]).toBeGreaterThan(express.shoulders[0][2] + .35);
    expect(express.hands[0][1]).toBeGreaterThan(express.shoulders[0][1]);
    expect(express.armReach[0]).toBeGreaterThan(.85);
    expect(pace.armReach[0]).toBeLessThan(.6);
    // And it gets there with the bowling arm, not after it, straight the
    // whole way: up behind him by the time that arm has finished coming
    // across — at which point the fast bowler's front arm has barely moved.
    bowler.action(EXPRESS_ACTION);
    for (const p of [0, .05, .1, .18, .27, .36]) expect(flight(.34 * p).armReach[0]).toBeGreaterThan(.9);
    const across = flight(.34 * .36);
    expect(across.hands[0][2]).toBeGreaterThan(across.shoulders[0][2] + .3);
    // Out beside the head rather than straight behind it, so that it shows
    // from the far end: a hand's width and more out to his left.
    expect(across.hands[0][0]).toBeGreaterThan(across.shoulders[0][0] + .25);
    bowler.action(PACE_ACTION);
    expect(flight(.34 * .36).armReach[0]).toBeLessThan(.6);
    // The chest round further than the hips, which face the way the feet step:
    // measured as the shoulders' line against the feet's.
    const line = (a: number[], b: number[]) => Math.atan2(a[2] - b[2], a[0] - b[0]);
    const twisted = (s: ReturnType<typeof at>) => Math.abs(line(s.shoulders[0], s.shoulders[1]) - line(s.feet[0], s.feet[1]));
    expect(twisted(express)).toBeGreaterThan(twisted(pace) + .4);
    // And the feet still apart, not crossed on one line.
    expect(Math.abs(express.feet[0][0] - express.feet[1][0])).toBeGreaterThan(.12);
    expect(express.hip[1]).toBeLessThan(pace.hip[1] - .05);
    expect(express.lean).toBeGreaterThan(.4);
    // Bent, never stretched: the spine is the length it is.
    const spine = (s: ReturnType<typeof at>) => Math.hypot(...s.chest.map((v, k) => v - s.hip[k]));
    for (const p of [.1, .2, .3, .34]) expect(spine(flight(p))).toBeLessThan(.47);
  });

  it('veers off across the pitch as he runs off, not straight on', () => {
    const [pace, express] = both(() => { bowler.followThrough(1); return bowler.root.position.x; });
    const [paceLane, expressLane] = both(() => { bowler.runup(1); return bowler.root.position.x; });
    expect(express - expressLane).toBeGreaterThan(.4);
    expect(Math.abs(pace - paceLane)).toBeLessThan(.001);
    // And not while the front foot is still braced on its mark.
    const [, expressBraced] = both(() => { bowler.followThrough(.04); return bowler.root.position.x; });
    expect(expressBraced).toBeCloseTo(expressLane, 5);
  });

  it('is the one the scene can tell apart, and the fast bowler by default', () => {
    const fresh = new Bowler();
    expect(fresh.actionStyle).toBe(PACE_ACTION);
    fresh.action(EXPRESS_ACTION);
    expect(fresh.actionStyle).toBe(EXPRESS_ACTION);
  });
});

describe('the cricketer every fielder is built from', () => {
  it('stands with both feet down and both arms within reach', () => {
    const fielder = new Cricketer();
    const s = fielder.inspect();
    for (const foot of s.feet) expect(foot[1]).toBeLessThan(.09);
    for (const reach of [...s.legReach, ...s.armReach]) expect(reach).toBeLessThanOrEqual(1);
  });

  it('waits on the ball with its knees softer than a man just standing', () => {
    // The two are different poses on purpose. A fielder is watching a batter
    // about to hit it and is bent ready to move; standing is standing. What is
    // not allowed is the two drifting apart by accident, so the ready stance is
    // the resting one bent, and the crouch is the whole of the difference.
    const fielder = new Cricketer();
    fielder.apply(fielder.rest());
    const upright = fielder.inspect();
    fielder.apply(fielder.stand());
    const ready = fielder.inspect();
    for (let i = 0; i < 2; i++) {
      expect(ready.legReach[i]).toBeLessThan(upright.legReach[i]);
      expect(ready.legReach[i]).toBeGreaterThan(.88);
    }
    expect(ready.hip[1]).toBeLessThan(upright.hip[1]);
    expect(upright.hip[1] - ready.hip[1]).toBeLessThan(.1);
  });

  it('twists the trunk on the hips, taking the shoulders round and leaving the feet', () => {
    // A slinger spins his chest round in the follow-through while his feet
    // carry on down the pitch; turned in one piece, the legs cross.
    const fielder = new Cricketer();
    fielder.apply(fielder.rest());
    const square = fielder.inspect();
    fielder.apply({ ...fielder.rest(), twist: .8 });
    const twisted = fielder.inspect();
    const line = (a: number[], b: number[]) => Math.atan2(a[2] - b[2], a[0] - b[0]);
    expect(Math.abs(line(twisted.shoulders[0], twisted.shoulders[1]) - line(square.shoulders[0], square.shoulders[1]))).toBeCloseTo(.8, 1);
    for (let i = 0; i < 2; i++) {
      expect(twisted.feet[i]).toEqual(square.feet[i]);
      // The hips take a share, so the tops of the legs shift a little; the knees barely.
      expect(Math.hypot(...twisted.knees[i].map((v, k) => v - square.knees[i][k]))).toBeLessThan(.05);
      expect(twisted.armReach[i]).toBeLessThanOrEqual(1);
    }
  });

  it('takes a catch with both hands up over the head', () => {
    const fielder = new Cricketer();
    fielder.catchAt(1);
    const s = fielder.inspect();
    for (let i = 0; i < 2; i++) {
      expect(s.hands[i][1]).toBeGreaterThan(s.shoulders[i][1] + .4);
      expect(s.armReach[i]).toBeLessThanOrEqual(1);
    }
    // Reaching for it is a movement, so the pose has to hold at every point of
    // the way up and not only at the end of it.
    for (let i = 0; i <= 10; i++) {
      fielder.catchAt(i / 10);
      for (const reach of [...fielder.inspect().armReach, ...fielder.inspect().legReach]) expect(reach).toBeLessThanOrEqual(1);
    }
  });
});

/** The stumps' half-width, near enough: three stumps and two gaps. */
const STUMPS = .115;

describe.each(ACTIONS)('round the wicket — %s', (_, style) => {
  beforeEach(() => { bowler.action(style); bowler.round(true); });
  afterEach(() => bowler.round(false));

  it('runs in on the other side of the stumps', () => {
    bowler.runup(.3);
    const round = bowler.root.position.x;
    bowler.round(false); bowler.runup(.3);
    expect(round).toBeLessThan(-.3);
    expect(bowler.root.position.x).toBeGreaterThan(.3);
  });

  it('lets the ball go out wide of them, at the height and the moment it always goes', () => {
    bowler.round(false); bowler.runup(1);
    const over = bowler.releasePoint();
    bowler.round(true); bowler.runup(1);
    const round = bowler.releasePoint();
    expect(round.x).toBeLessThan(-.55);
    expect(Math.abs(round.y - over.y)).toBeLessThan(.005);
    expect(Math.abs(round.z - over.z)).toBeLessThan(.005);
  });

  it('says where the ball leaves his hand, on either side, without being watched to find out', () => {
    for (const on of [false, true]) {
      bowler.round(on); bowler.runup(.4);
      const said = bowler.releaseX();
      // Asking must not move him.
      expect(bowler.figure.inspect()).toEqual(at(.4));
      bowler.runup(1);
      expect(Math.abs(said - bowler.releasePoint().x)).toBeLessThan(.005);
    }
  });

  it('passes the stumps with his left side and never runs through them', () => {
    for (const t of runup(60)) {
      const s = at(t), x = bowler.root.position.x;
      // His frame is the root's: across the pitch is that plus his own offsets.
      for (const point of [s.shoulders[0], s.shoulders[1], s.feet[0], s.feet[1], s.hip]) expect(x + point[0]).toBeLessThan(-STUMPS);
    }
  });

  it('runs off away from the stumps, not across the pitch', () => {
    bowler.runup(1);
    const released = bowler.root.position.x;
    for (const p of [.2, .5, .9]) {
      bowler.followThrough(p);
      expect(bowler.root.position.x).toBeLessThanOrEqual(released + 1e-9);
    }
  });
});

describe('round the wicket — the spinner', () => {
  afterEach(() => { bowler.round(false); bowler.spinner(false); });

  it('lets it go from where he says, off his two paces as off the full run', () => {
    bowler.action(PACE_ACTION); bowler.spinner(true);
    for (const on of [false, true]) {
      bowler.round(on); bowler.runup(1);
      expect(Math.abs(bowler.releaseX() - bowler.releasePoint().x)).toBeLessThan(.005);
    }
    expect(bowler.releasePoint().x).toBeLessThan(-.55);
  });
});

describe('an action he has not bowled before', () => {
  it('is measured for where it lets the ball go, and leaves him on the frame he was showing', () => {
    const fresh = new Bowler();
    // Unknown to him until now, so asking measures it, halfway down his run.
    const other: ActionStyle = { ...PACE_ACTION, lane: .4 };
    fresh.action(other);
    fresh.runup(.4);
    const showing = fresh.figure.inspect();
    const said = fresh.releaseX();
    expect(fresh.figure.inspect()).toEqual(showing);
    fresh.runup(1);
    expect(Math.abs(said - fresh.releasePoint().x)).toBeLessThan(.005);
  });
});
