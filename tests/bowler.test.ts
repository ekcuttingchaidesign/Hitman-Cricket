import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { Bowler, RELEASE_Z, RUNUP_START_Z } from '../src/entities/Bowler';
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

describe('the bowling action', () => {
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
    // ever dropping back, all the way to the top of the circle.
    const heights = [.72, .76, .80, .84, .88, .92, .96].map(t => at(t).hands[1][1]);
    for (let i = 1; i < heights.length; i++) expect(heights[i]).toBeGreaterThan(heights[i - 1]);
    expect(heights[0]).toBeLessThan(1.2);
    // Release is the far side of the top — a ball let go at the very apex is
    // one that has not been bowled over the top of the arm at all — so the hand
    // is a shade below its highest point by the time the ball goes, and still
    // higher than anywhere else in the action.
    const release = at(1).hands[1][1];
    expect(release).toBeLessThan(Math.max(...heights));
    expect(Math.max(...heights) - release).toBeLessThan(.12);
    // And behind him before it comes over: the hand is back past the chest.
    const gather = at(.74);
    expect(gather.hands[1][2]).toBeGreaterThan(gather.chest[2] + .3);
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
    // The front foot is braced from the moment it lands until the ball has gone.
    const braced = [.93, .95, .97, .99, 1].map(t => world(t, 0));
    for (const spot of braced) expect(spot.distanceTo(braced[0])).toBeLessThan(.01);
    // And the back foot holds its mark while he runs up over it, until the
    // body has gone past and it is picked up again.
    const back = [.65, .68, .71, .73].map(t => world(t, 1));
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

  it('stands like the fielders do, at both ends of the action', () => {
    // He waits at his mark in full view of the batter for half a second before
    // every ball, and stands again once it has gone. Both used to be frames of
    // the run held still: feet staggered mid-stride, and the arms carried at
    // the shortened reach a runner pumps them at, which puts both elbows out
    // and reads as a man stopped rather than a man standing. The rest pose is
    // the fielders' own now, so there is one answer to what standing looks like.
    const resting = new Cricketer().inspect();
    for (const stood of [at(0), flight(1)]) {
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
      expect(Math.abs(stood.feet[0][0] - stood.feet[1][0])).toBeGreaterThan(.25);
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

describe('the cricketer every fielder is built from', () => {
  it('stands with both feet down and both arms within reach', () => {
    const fielder = new Cricketer();
    const s = fielder.inspect();
    for (const foot of s.feet) expect(foot[1]).toBeLessThan(.09);
    for (const reach of [...s.legReach, ...s.armReach]) expect(reach).toBeLessThanOrEqual(1);
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
