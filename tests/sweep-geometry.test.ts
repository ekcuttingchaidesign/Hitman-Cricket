import { describe, expect, it } from 'vitest';
import { Batter, STROKE_DURATION_MS, SWEEP_CONTACT_MS } from '../src/entities/Batter';
import { GAME } from '../src/config/gameplay';
import { MathUtils, Vector3 } from 'three';

/**
 * The shape of the slog sweep, as distinct from whether the rig holds together.
 *
 * `batter.test.ts` asks whether any limb is inside another, whether anything
 * flips, whether the blade ever passes through him. This file asks a different
 * question: does the stroke look like the shot. Two things separate a slog
 * sweep from a man kneeling and waving:
 *
 *   The front leg folds to a right angle. Thigh flat, shin upright, knee up
 *   over the ankle — he is sitting on the shot, not reaching for it with a
 *   straight leg. A straight front leg reads as a lunge.
 *
 *   The bat works in front of that foot. The whole of it: the swing happens
 *   out where he can see it, on the far side of his own front pad. A handle
 *   that ends up behind the front foot has to be somewhere, and the only place
 *   left is inside him.
 *
 * Both are measured, not eyeballed, because both were wrong by a margin no
 * screenshot made obvious: 111-143 degrees at the knee against the 90 it wants,
 * and a bat that spent the whole stroke between 0.6m and 0.9m BEHIND the front
 * foot.
 */
const clamp = (v: number) => MathUtils.clamp(v, -1, 1);

const swept = (ballX = 0) => {
  const batter = new Batter();
  batter.prepare(1); batter.update(0);
  batter.swing('LEG', 0, ballX, .48, GAME.contactZ, false, false, true);
  return batter;
};

/** Everything about the front leg's fold, in degrees. */
export const frontLeg = (pose: ReturnType<Batter['inspect']>) => {
  const hip = new Vector3(...pose.hip), knee = new Vector3(...pose.knees[0]), foot = new Vector3(...pose.frontFoot);
  const thigh = knee.clone().sub(hip), shin = foot.clone().sub(knee);
  return {
    // Positive means the knee is above the hip.
    thighTilt: Math.asin(clamp(thigh.y / (thigh.length() || 1))) * 180 / Math.PI,
    // Zero means the shin hangs straight down from the knee.
    shinTilt: Math.acos(clamp(-shin.y / (shin.length() || 1))) * 180 / Math.PI,
    kneeAngle: hip.clone().sub(knee).angleTo(foot.clone().sub(knee)) * 180 / Math.PI,
  };
};

/**
 * How far the furthest-back part of the bat sits in front of the front foot.
 * Negative means some of the bat is behind it. The knob is the part that gets
 * there first, which is why the handle is what ends up in his ribs.
 */
export const batAheadOfFoot = (batter: Batter) => {
  const pose = batter.inspect();
  const root = batter.root.position;
  const knob = batter.bat.localToWorld(new Vector3(0, .25, 0)).z - root.z;
  const tip = new Vector3(...pose.bladeTip).z - root.z;
  const contact = new Vector3(...pose.bladeContact).z - root.z;
  return Math.min(knob, tip, contact) - pose.frontFoot[2];
};

/** Closest the handle comes to the line of his spine. */
export const handleOffSpine = (batter: Batter) => {
  const pose = batter.inspect();
  const hip = new Vector3(...pose.hip), chest = new Vector3(...pose.chest);
  const spine = chest.clone().sub(hip); const height = spine.length(); spine.normalize();
  let worst = Infinity;
  for (let up = -.13; up <= .25; up += .02) {
    const point = batter.bat.localToWorld(new Vector3(0, up, 0)).sub(batter.root.position);
    const along = MathUtils.clamp(point.clone().sub(hip).dot(spine), 0, height);
    worst = Math.min(worst, point.distanceTo(hip.clone().addScaledVector(spine, along)));
  }
  return worst;
};

describe('the shape of the slog sweep', () => {
  it('folds the front leg to a right angle over the ankle', () => {
    for (const x of [-.30, 0, .26]) {
      const batter = swept(x);
      // Measured where the shot is made and held through the hit, not at one
      // lucky frame: the leg he lands on is the leg he swings around.
      for (const time of [SWEEP_CONTACT_MS, 300, 390]) {
        batter.update(time);
        const leg = frontLeg(batter.inspect());
        const where = `x=${x} @${time}ms ${JSON.stringify(leg)}`;
        expect(leg.kneeAngle, where).toBeGreaterThan(68);
        expect(leg.kneeAngle, where).toBeLessThan(112);
        // Thigh flat: the knee neither dropped below the hip nor climbed above it.
        expect(Math.abs(leg.thighTilt), where).toBeLessThan(26);
        // Shin upright: the ankle is under the knee, not out in front of it.
        expect(leg.shinTilt, where).toBeLessThan(26);
      }
    }
  });
  it('swings the whole bat in front of the front foot', () => {
    for (const x of [-.30, 0, .26]) {
      const batter = swept(x);
      let hit = { gap: Infinity, at: 0 }, out = { gap: Infinity, at: 0 };
      for (let time = SWEEP_CONTACT_MS; time <= 400; time += 4) {
        batter.update(time);
        const gap = batAheadOfFoot(batter);
        if (time <= SWEEP_CONTACT_MS + 40 && gap < hit.gap) hit = { gap, at: time };
        if (gap < out.gap) out = { gap, at: time };
      }
      // Through the hit, every millimetre of it is in front of the pad — knob,
      // middle and toe — which is the thing that was wrong: the version this
      // replaces had the whole bat 0.90m the wrong side of the foot at the ball
      // itself, with the handle 0.06 from the line of his own spine.
      expect(hit.gap, `x=${x} at the ball ${JSON.stringify(hit)}`).toBeGreaterThan(0);
      // Past the hit, the knob has to give a little. The bat is a 1.05m bar
      // turning about the hands, so the moment the handle lies across the
      // ball's line the knob is 0.69 behind the middle by construction;
      // demanding the whole of it stay in front for the whole follow-through
      // would mean planting the front foot 0.39m behind the ball, which is not
      // a stance anyone takes. A few centimetres of knob, while the blade is a
      // metre in front, is the shot working.
      expect(out.gap, `x=${x} through the extension ${JSON.stringify(out)}`).toBeGreaterThan(-.10);
    }
  });
  it('keeps the follow-through from dragging back behind him', () => {
    // The wrapped finish is allowed behind the foot — that is what wrapping
    // means. Being most of a metre behind it is not. Measured from the ball to
    // the finish, so the guard and the backlift, where the bat is behind him
    // because that is where a bat lives before a shot, are not counted.
    for (const x of [-.30, 0, .26]) {
      const batter = swept(x);
      let worst = { gap: Infinity, at: 0 };
      for (let time = SWEEP_CONTACT_MS; time <= 560; time += 4) {
        batter.update(time);
        const gap = batAheadOfFoot(batter);
        if (gap < worst.gap) worst = { gap, at: time };
      }
      expect(worst.gap, `x=${x} ${JSON.stringify(worst)}`).toBeGreaterThan(-.40);
    }
  });
  it('never puts the handle inside his own chest', () => {
    for (const x of [-.30, 0, .26]) {
      const batter = swept(x);
      let worst = { gap: Infinity, at: 0 };
      for (let time = 0; time <= STROKE_DURATION_MS; time += 4) {
        batter.update(time);
        const gap = handleOffSpine(batter);
        if (gap < worst.gap) worst = { gap, at: time };
      }
      // The trunk is about .19 across and the handle .048.
      expect(worst.gap, `x=${x} ${JSON.stringify(worst)}`).toBeGreaterThan(.16);
    }
  });
});
