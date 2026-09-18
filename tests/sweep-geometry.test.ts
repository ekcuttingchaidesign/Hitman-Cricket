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
  it('keeps the back knee on the turf and the two feet apart', () => {
    for (const x of [-.30, 0, .26]) {
      const batter = swept(x);
      let highest = { knee: 0, at: 0 }, closest = { gap: Infinity, at: 0 };
      // From the ball to the finish. He does not get up out of a slog sweep.
      for (let time = SWEEP_CONTACT_MS; time <= 560; time += 4) {
        batter.update(time);
        const pose = batter.inspect();
        if (pose.knees[1][1] > highest.knee) highest = { knee: pose.knees[1][1], at: time };
        const gap = pose.frontFoot[0] - pose.backFoot[0];
        if (gap < closest.gap) closest = { gap, at: time };
      }
      // The back knee came off the turf and climbed to 0.213 when the back foot
      // was pinned too far behind: the hips turn a quarter of a metre forward
      // through the follow-through, the leg ran out of length, and the IK had
      // nothing left to do but straighten it. A straight rod trailing off a
      // pelvis is what "the hip is not connected to the leg" looks like.
      expect(highest.knee, `x=${x} back knee ${JSON.stringify(highest)}`).toBeLessThan(.16);
      // And the feet keep a gap across him. With the back foot tucked in line
      // behind the front one, the front leg covers the back leg completely from
      // square — no cricketer's legs do that.
      expect(closest.gap, `x=${x} foot separation ${JSON.stringify(closest)}`).toBeGreaterThan(.25);
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
  it('lifts the blade in one arc rather than dropping it and picking it up', () => {
    for (const x of [-.30, 0, .26]) {
      const batter = swept(x);
      let peak = -Infinity, sag = { drop: 0, at: 0 }, start = 0, end = 0;
      for (let time = SWEEP_CONTACT_MS; time <= 560; time += 4) {
        batter.update(time);
        const tip = new Vector3(...batter.inspect().bladeTip).y;
        if (time === SWEEP_CONTACT_MS) start = tip;
        end = tip;
        if (peak - tip > sag.drop) sag = { drop: peak - tip, at: time };
        peak = Math.max(peak, tip);
      }
      // One movement, not two. The version this replaces sent the toe 0.24
      // BELOW the hands just after the ball, parked it there, and then hauled
      // it a metre back up for the finish — down at 430ms, up at 590ms, which
      // reads as two separate movements because it is.
      expect(sag.drop, `x=${x} toe sagging ${JSON.stringify(sag)}`).toBeLessThan(.08);
      // And it genuinely finishes high, over the shoulder.
      expect(end - start, `x=${x} total lift`).toBeGreaterThan(.9);
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

/**
 * The orthodox sweep, which is the slog sweep with one thing taken away.
 *
 * The brief was exact: same body, same everything, and a blade that stays at
 * the height it met the ball at instead of climbing over the shoulder. So the
 * two tests below are the two halves of that sentence, and between them they
 * are the whole specification of the stroke.
 */
describe('the orthodox sweep', () => {
  const sweeping = (levelled: boolean, x = 0) => {
    const batter = new Batter(); batter.prepare(1); batter.update(0);
    batter.swing('LEG', 0, x, .48, GAME.contactZ, false, false, !levelled, levelled);
    return batter;
  };
  /** Everything that is the batter rather than the bat he is holding. */
  const BODY = ['hip', 'chest', 'frontFoot', 'backFoot', 'knees', 'backToe', 'legLengths'] as const;

  it('moves the body exactly as the slog sweep does, to the last digit', () => {
    for (const x of [-.30, 0, .26]) {
      const slog = sweeping(false, x), flat = sweeping(true, x);
      for (let time = 0; time <= STROKE_DURATION_MS; time += 4) {
        slog.update(time); flat.update(time);
        const a = slog.inspect() as unknown as Record<string, unknown>;
        const b = flat.inspect() as unknown as Record<string, unknown>;
        for (const part of BODY)
          expect(b[part], `${part} at ${time}ms, ball ${x}`).toEqual(a[part]);
        expect((flat.inspect() as { yaw: number }).yaw).toEqual((slog.inspect() as { yaw: number }).yaw);
      }
    }
  });

  it('keeps the blade level where the slog sweep climbs over the shoulder', () => {
    for (const x of [-.30, 0, .26]) {
      const slog = sweeping(false, x), flat = sweeping(true, x);
      const tip = (b: Batter) => new Vector3(...b.inspect().bladeTip).sub(b.root.position).y;
      slog.update(SWEEP_CONTACT_MS); flat.update(SWEEP_CONTACT_MS);
      // Indistinguishable up to the ball being hit: the difference is what he
      // does after it, not how he arrives.
      expect(tip(flat)).toBeCloseTo(tip(slog), 9);
      const met = tip(flat);
      let highFlat = -Infinity, highSlog = -Infinity;
      // Contact to the end of the follow-through. The recovery afterwards is
      // shared — both strokes stand up and bring the bat back to the guard.
      for (let time = SWEEP_CONTACT_MS; time <= 620; time += 4) {
        slog.update(time); flat.update(time);
        highFlat = Math.max(highFlat, tip(flat));
        highSlog = Math.max(highSlog, tip(slog));
        // Never below the ball either. Level means level, not digging.
        expect(tip(flat), `dug in at ${time}ms, ball ${x}`).toBeGreaterThan(met - .16);
      }
      // The slog climbs more than a metre out of the shot; this one stays
      // within a bat's width of the height it struck the ball at.
      expect(highSlog - met, `slog climb, ball ${x}`).toBeGreaterThan(.90);
      expect(highFlat - met, `flat climb, ball ${x}`).toBeLessThan(.25);
    }
  });

  it('holds the handle level too, rather than standing the bat up', () => {
    // A blade that stays low while the handle rears up is not a level swing,
    // it is a bat pointing at the sky from a low grip. The shaft itself has to
    // stay near the horizontal.
    const flat = sweeping(true);
    for (let time = SWEEP_CONTACT_MS; time <= 620; time += 4) {
      flat.update(time);
      const pose = flat.inspect();
      const shaft = new Vector3(...pose.bladeTip).sub(new Vector3(...pose.grip)).normalize();
      expect(MathUtils.radToDeg(Math.asin(Math.abs(shaft.y))), `shaft tilt at ${time}ms`).toBeLessThan(42);
    }
  });
});
