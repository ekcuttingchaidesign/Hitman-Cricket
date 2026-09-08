import { describe, it, expect } from 'vitest';
import { Batter, STROKE_CONTACT_MS, STROKE_DURATION_MS } from '../src/entities/Batter';
import { ADVANCE, GAME, SHOTS } from '../src/config/gameplay';
import { Vector3 } from 'three';

describe('two-handed cricket animation', () => {
  it('keeps both gloves on the same handle throughout every stroke', () => {
    const batter = new Batter();
    const worst: Record<string, { length: number; time: number }> = {};
    // Both heights, so the pull is held to the same grip and reach as the rest.
    for (const [shot, ballY] of SHOTS.flatMap(s => [[s, .54], [s, 1.12]] as const)) {
      for (const ballX of [-.55, -.14, 0, .14, .55]) {
        batter.reset(); batter.prepare(1); batter.update(0); batter.swing(shot, 0, ballX, ballY);
        for (let time = 0; time <= STROKE_DURATION_MS; time += 16) {
          batter.update(time);
          const pose = batter.inspect();
          expect(new Vector3(...pose.hands[0]).distanceTo(new Vector3(...pose.hands[1]))).toBeCloseTo(.135, 6);
          expect(pose.backToe[1]).toBeCloseTo(.01, 5);
          for (const lengths of pose.armLengths) {
            expect(lengths[0]).toBeCloseTo(.32, 3);
            if (!worst[shot] || worst[shot].length < lengths[1]) worst[shot] = { length: lengths[1], time };
          }
        }
      }
    }
    expect(Math.max(...Object.values(worst).map(v => v.length)), JSON.stringify(worst)).toBeLessThan(.345);
  });
  it('starts side-on with a staggered stance and returns to guard', () => {
    const batter = new Batter(); const guard = batter.inspect();
    expect(guard.yaw).toBeGreaterThan(1);
    expect(guard.frontFoot[2] - guard.backFoot[2]).toBeGreaterThan(.5);
    for (const shot of SHOTS) {
      batter.swing(shot, 0, 0); batter.update(STROKE_DURATION_MS);
      expect(batter.inspect().grip).toEqual(guard.grip);
      expect(batter.inspect().frontFoot).toEqual(guard.frontFoot);
    }
  });
  it('uses distinct follow-throughs and steps into drives', () => {
    const batter = new Batter(); const signatures = new Set<string>();
    for (const shot of SHOTS) {
      batter.reset(); batter.swing(shot, 0, 0); batter.update(470);
      const pose = batter.inspect(); signatures.add(JSON.stringify([pose.grip, pose.frontFoot, pose.yaw]));
      if (['STRAIGHT', 'LONG_ON', 'COVER_LONG_OFF'].includes(shot)) expect(pose.frontFoot[2]).toBeGreaterThan(.5);
    }
    expect(signatures.size).toBe(5);
  });
  it('puts the blade at the ball when contact is presented', () => {
    const batter = new Batter();
    for (const [shot, ballX] of [['LEG', -.3], ['LONG_ON', -.14], ['STRAIGHT', 0], ['COVER_LONG_OFF', .14], ['OFF', .42]] as const) {
      batter.reset(); batter.swing(shot, 0, ballX); batter.update(110);
      const point = batter.inspect().bladeContact;
      expect(point[0]).toBeCloseTo(ballX, 6); expect(point[1]).toBeCloseTo(.54, 6); expect(point[2]).toBeCloseTo(GAME.contactZ, 6);
    }
  });
});

describe('bat travel', () => {
  const sample = (shot: (typeof SHOTS)[number], ballX: number) => {
    const batter = new Batter();
    batter.reset(); batter.prepare(1); batter.update(0); batter.swing(shot, 0, ballX);
    const frames = [];
    for (let time = 0; time <= STROKE_DURATION_MS; time += 16) {
      batter.update(time);
      const pose = batter.inspect();
      frames.push({ time, tip: new Vector3(...pose.bladeTip), face: new Vector3(...pose.batFace) });
    }
    return frames;
  };
  // A raised backlift reverses the blade on its way to the ball. Interpolating
  // the bat's axis linearly would collapse it through zero at the halfway point
  // and spin the blade; it has to travel around an arc instead.
  it('carries the blade along a continuous arc with no spin', () => {
    for (const shot of SHOTS) {
      for (const ballX of [-.55, -.14, 0, .14, .55]) {
        const frames = sample(shot, ballX);
        for (let i = 1; i < frames.length; i++) {
          // A spin would throw the tip across the bat's whole length in a frame;
          // the fastest honest frame of a stroke measures about .55.
          const step = frames[i].tip.distanceTo(frames[i - 1].tip);
          expect(step, `${shot} tip jumped at ${frames[i].time}ms`).toBeLessThan(.7);
          const turn = frames[i].face.dot(frames[i - 1].face);
          expect(turn, `${shot} face flipped at ${frames[i].time}ms`).toBeGreaterThan(.7);
        }
      }
    }
  });
  it('keeps the blade face square to the stroke rather than rolled at random', () => {
    const batter = new Batter();
    for (const [shot, expected] of [['STRAIGHT', new Vector3(0, .12, 1)], ['LEG', new Vector3(-.8, .12, .59)],
      ['COVER_LONG_OFF', new Vector3(.42, .1, .9)]] as const) {
      batter.reset(); batter.swing(shot, 0, 0); batter.update(110);
      const face = new Vector3(...batter.inspect().batFace);
      expect(face.length()).toBeCloseTo(1, 6);
      expect(face.dot(expected.clone().normalize()), `${shot} face`).toBeGreaterThan(.6);
    }
  });
});

describe('arm placement', () => {
  // The back elbow used to be aimed at a fixed point across the chest, which
  // buried it inside the torso in the guard and through the leg-side wrap.
  it('keeps both elbows clear of the torso in every pose', () => {
    let worst = { clearance: Infinity, where: '' };
    // 1.12 is bouncer height, which turns the leg-side input into a pull.
    for (const [shot, ballY] of SHOTS.flatMap(s => [[s, .54], [s, 1.12]] as const)) {
      for (const ballX of [-.55, -.14, 0, .14, .55]) {
        const batter = new Batter();
        batter.reset(); batter.prepare(1); batter.update(0); batter.swing(shot, 0, ballX, ballY);
        for (let time = 0; time <= STROKE_DURATION_MS; time += 16) {
          batter.update(time);
          const pose = batter.inspect();
          const chest = new Vector3(...pose.chest), hip = new Vector3(...pose.hip);
          const spine = chest.clone().sub(hip).normalize(), length = chest.distanceTo(hip);
          for (const point of pose.elbows) {
            const elbow = new Vector3(...point);
            const along = Math.min(length, Math.max(0, elbow.clone().sub(hip).dot(spine)));
            const clearance = elbow.distanceTo(hip.clone().addScaledVector(spine, along));
            if (clearance < worst.clearance) worst = { clearance, where: `${shot} y=${ballY} x=${ballX} @${time}ms` };
          }
        }
      }
    }
    // The trunk ellipsoid runs to .205 across and .145 deep from the spine.
    expect(worst.clearance, `closest elbow: ${worst.where}`).toBeGreaterThan(.15);
  });
});

describe('the pull', () => {
  it('answers a ball at the chest with its own stroke, and only on the leg side', () => {
    const batter = new Batter();
    batter.reset(); batter.swing('LEG', 0, -.02, 1.12); batter.update(110);
    expect(batter.inspect().pulling).toBe(true);
    // Everything else keeps its own stroke, however high the ball is.
    for (const shot of SHOTS.filter(s => s !== 'LEG')) {
      batter.reset(); batter.swing(shot, 0, 0, 1.12); batter.update(110);
      expect(batter.inspect().pulling, shot).toBe(false);
    }
    // A leg-side ball at normal height is still the flick.
    batter.reset(); batter.swing('LEG', 0, -.3, .54); batter.update(110);
    expect(batter.inspect().pulling).toBe(false);
  });
  it('reaches the ball up at bouncer height', () => {
    const batter = new Batter();
    for (const ballX of [-.4, -.02, .3]) {
      batter.reset(); batter.swing('LEG', 0, ballX, 1.12); batter.update(110);
      const blade = batter.inspect().bladeContact;
      expect(blade[0]).toBeCloseTo(ballX, 6); expect(blade[1]).toBeCloseTo(1.12, 6);
    }
  });
});

describe('the grip', () => {
  it('holds the handle with two hands that agree about it', () => {
    const batter = new Batter();
    let worstTwist = 0, flattest = Infinity, wristWhere = '';
    for (const [shot, ballY] of SHOTS.flatMap(s => [[s, .54], [s, 1.12]] as const)) {
      for (const ballX of [-.5, 0, .5]) {
        batter.reset(); batter.prepare(1); batter.update(0); batter.swing(shot, 0, ballX, ballY);
        for (let time = -1; time <= STROKE_DURATION_MS; time += 20) {
          batter.update(time);
          const pose = batter.inspect();
          // Both fists ride the bat. A hand free to turn on its own ends up
          // gripping the handle a quarter-turn away from the other one.
          for (const twist of pose.gripTwist) worstTwist = Math.max(worstTwist, twist);
          // The right hand is the bottom hand: nearer the blade than the left.
          expect(pose.handGrip[1], `${shot} at ${time}ms`).toBeLessThan(pose.handGrip[0]);
          for (const [i, aim] of pose.cuffAim.entries()) {
            // The gauntlet meets the arm wherever the stroke has rolled the bat,
            // and the elbow stays off the handle rather than lying along it.
            expect(aim.alongForearm, `${shot} arm ${i} at ${time}ms`).toBeCloseTo(1, 6);
            if (aim.elbowOffHandle < flattest) { flattest = aim.elbowOffHandle; wristWhere = `${shot} arm ${i} at ${time}ms`; }
          }
        }
      }
    }
    expect(worstTwist).toBeCloseTo(0, 9);
    // The handle is .048 across and a forearm .095: closer than this and one is
    // inside the other.
    expect(flattest, `closest elbow to the handle: ${wristWhere}`).toBeGreaterThan(.09);
  });

  it('waits with the bat cocked back towards first slip, face opened up', () => {
    const batter = new Batter();
    batter.reset();
    const guard = batter.inspect();
    const grip = new Vector3(...guard.grip), tip = new Vector3(...guard.bladeTip).sub(new Vector3(GAME.stanceX, 0, GAME.stanceZ));
    const lift = tip.clone().sub(grip);
    // Back past the hands towards the keeper, out towards the slips, and up.
    expect(lift.z).toBeLessThan(-.4);
    expect(lift.x).toBeGreaterThan(.1);
    expect(lift.y).toBeGreaterThan(.3);
    // Laid back rather than stood up: nearer the horizontal than the vertical.
    expect(Math.atan2(lift.y, Math.hypot(lift.x, lift.z))).toBeLessThan(.85);
    // And the face turned up to the sky, not held square while the blade lifts.
    expect(guard.batFace[1]).toBeGreaterThan(.5);
  });
});

describe('the charge', () => {
  it('walks down the pitch, launches it, and walks back', () => {
    const batter = new Batter();
    batter.reset(); batter.prepare(1); batter.update(0);
    expect(batter.inspect().downPitch).toBeCloseTo(0, 6);
    batter.swing('STRAIGHT', 0, 0, .54, GAME.contactZ, true);
    // The ball arrives where it arrives: he is barely out of his ground at
    // contact, and the drive is what carries him down the wicket.
    batter.update(STROKE_CONTACT_MS);
    const contact = batter.inspect();
    expect(contact.charging).toBe(true);
    expect(contact.downPitch).toBeLessThan(.12);
    expect(contact.bladeContact[2]).toBeCloseTo(GAME.contactZ, 6);
    expect(contact.bladeContact[1]).toBeCloseTo(.54, 6);
    let furthest = 0;
    for (let time = 0; time <= STROKE_DURATION_MS; time += 16) {
      batter.update(time);
      furthest = Math.max(furthest, batter.inspect().downPitch);
    }
    expect(furthest).toBeGreaterThan(1.5);
    // And he is back in his crease before the next ball.
    batter.update(STROKE_DURATION_MS + ADVANCE.walkBackMs);
    expect(batter.inspect().downPitch).toBeCloseTo(0, 6);
    batter.reset();
    expect(batter.inspect().downPitch).toBeCloseTo(0, 6);
  });
  it('never outreaches an arm or a leg on the way', () => {
    const batter = new Batter();
    batter.reset(); batter.prepare(1); batter.update(0);
    batter.swing('STRAIGHT', 0, 0, .54, GAME.contactZ, true);
    for (let time = 0; time <= STROKE_DURATION_MS + ADVANCE.walkBackMs; time += 12) {
      batter.update(time);
      const pose = batter.inspect();
      for (const [upper, lower] of pose.armLengths) {
        expect(upper, `upper arm at ${time}ms`).toBeCloseTo(.32, 3);
        expect(lower, `forearm at ${time}ms`).toBeLessThan(.345);
      }
      for (const [thigh, shin] of pose.legLengths) {
        expect(thigh, `thigh at ${time}ms`).toBeCloseTo(.43, 3);
        expect(shin, `shin at ${time}ms`).toBeLessThan(.445);
      }
      expect(new Vector3(...pose.hands[0]).distanceTo(new Vector3(...pose.hands[1]))).toBeCloseTo(.135, 6);
    }
  });
});
