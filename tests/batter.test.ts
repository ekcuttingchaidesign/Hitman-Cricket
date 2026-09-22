import { describe, it, expect } from 'vitest';
import { Batter, CHARGE_CLOCK, REVERSE_CONTACT_MS, SCOOP_CONTACT_MS, CHARGE_CONTACT_MS, CHARGE_MEETS_AT, HAND_SPACING, PULL_LOAD_MS, PULL_CONTACT_MS, SQUARE_DRIVE_CONTACT_MS, STROKE_CONTACT_MS, STROKE_DURATION_MS, SWEEP_CONTACT_MS } from '../src/entities/Batter';
import { ADVANCE, GAME, LINE_X, SHOTS, SQUARE_DRIVE } from '../src/config/gameplay';
import type { ShotType } from '../src/game/types';
import { MathUtils, Object3D, Quaternion, Vector3 } from 'three';
const THREE_clamp = (v: number) => MathUtils.clamp(v, 0, 1);
import { bladeGeometry } from '../src/entities/batGeometry';
// Every stroke the batter can be asked to play, defence included.
const STROKES: ShotType[] = [...SHOTS, 'DEFEND'];

/**
 * The strokes the shared rig checks sweep, and how to play each one. The charge
 * runs on the shared rig now, and takes the shared checks; what is particular
 * to it — the run down the pitch, the wrap, the walk back — has a suite of its
 * own below.
 */
const PLAYS: Record<string, { shot: ShotType; ballY: number; impact: number; reach: number[]; lofted?: boolean; sweeping?: boolean; levelled?: boolean; charging?: boolean; settle: number }> = {
  pull: { shot: 'LEG', ballY: 1.12, impact: PULL_CONTACT_MS, reach: [-.55, 0, .32], settle: 500 },
  straight: { shot: 'STRAIGHT', ballY: .54, impact: STROKE_CONTACT_MS, reach: [-.17, 0, .17], settle: 410 },
  cover: { shot: 'COVER_LONG_OFF', ballY: .54, impact: STROKE_CONTACT_MS, reach: [-.08, .10, .28], settle: 410 },
  square: { shot: 'COVER_LONG_OFF', ballY: .40, impact: SQUARE_DRIVE_CONTACT_MS, reach: [.30, .44, .55], settle: 430 },
  // The six: the same ball and the same contact as the classic drive above,
  // and a different follow-through, which is the whole of the difference.
  lofted: { shot: 'STRAIGHT', ballY: .54, impact: STROKE_CONTACT_MS, reach: [-.17, 0, .17], lofted: true, settle: 410 },
  // The standing cut, at the chest-high ball it answers.
  cut: { shot: 'SQUARE_CUT', ballY: .92, impact: STROKE_CONTACT_MS, reach: [.11, .40, .62], settle: 410 },
  // The slog sweep: the second special stroke, off the knee at a spinner's
  // length. It runs on the shared rig and so it takes the shared checks.
  sweep: { shot: 'LEG', ballY: .48, impact: SWEEP_CONTACT_MS, reach: [-.30, 0, .26], sweeping: true, settle: 600 },
  // The orthodox sweep: the same ball and the same body, meterless, with the
  // blade held level. It runs the sweep's branch, so it takes the sweep's
  // checks — and it has to, because a flat blade travelling round him is the
  // easiest of all of these to run through his own shin.
  flat: { shot: 'LEG', ballY: .48, impact: SWEEP_CONTACT_MS, reach: [-.30, 0, .26], levelled: true, settle: 600 },
  // The charge: the first special stroke, down the pitch at a length ball on
  // the stumps. Met a stride and a half short of the crease, which is where
  // the game meets it too.
  charge: { shot: 'STRAIGHT', ballY: .54, impact: CHARGE_CONTACT_MS, reach: [-.17, 0, .17], charging: true, settle: 600 },
  // The charge over cover: the same ball and the same walk at it, played
  // inside out off the cover input and finished high rather than wrapped.
  coverCharge: { shot: 'COVER_LONG_OFF', ballY: .54, impact: CHARGE_CONTACT_MS, reach: [-.17, 0, .17], charging: true, settle: 580 },
  // And its mirror over long-on, off the long-on input.
  onCharge: { shot: 'LONG_ON', ballY: .54, impact: CHARGE_CONTACT_MS, reach: [-.17, 0, .17], charging: true, settle: 580 },
  // The scoops: the third pair of special strokes, behind the wicket. The
  // scoop's ball is on the stumps or leg stump, the reverse's on or outside
  // off; both are played by the meter, so they run on the shared rig and
  // take the shared checks.
  scoop: { shot: 'SCOOP', ballY: .54, impact: SCOOP_CONTACT_MS, reach: [-.30, -.07, .17], settle: 470 },
  reverse: { shot: 'REVERSE_SCOOP', ballY: .54, impact: REVERSE_CONTACT_MS, reach: [.05, .28, .62], settle: 600 },
  // The on drive's six: the same ball and contact as the on drive, and a
  // different follow-through, which is the whole of the difference.
  onLofted: { shot: 'LONG_ON', ballY: .54, impact: STROKE_CONTACT_MS, reach: [-.55, -.2, .08], lofted: true, settle: 410 },
};
const play = (batter: Batter, kind: string, x = 0) => {
  const spec = PLAYS[kind];
  batter.swing(spec.shot, 0, x, spec.ballY, GAME.contactZ + (spec.charging ? CHARGE_MEETS_AT : 0), spec.charging ?? false, spec.lofted ?? false, spec.sweeping ?? false, spec.levelled ?? false);
};
/** The charge, played at the ball the game plays it at. */
const charge = (x = 0) => {
  const batter = new Batter(); batter.reset(); batter.prepare(1); batter.update(0);
  play(batter, 'charge', x);
  return batter;
};


describe('two-handed cricket animation', () => {
  it('keeps both gloves on the same handle throughout every stroke', () => {
    const batter = new Batter();
    const worst: Record<string, { length: number; time: number }> = {};
    // Both heights, so the pull is held to the same grip and reach as the rest.
    for (const [shot, ballY] of STROKES.flatMap(s => [[s, .54], [s, 1.12]] as const)) {
      for (const ballX of [-.55, -.14, 0, .14, .55]) {
        batter.reset(); batter.prepare(1); batter.update(0); batter.swing(shot, 0, ballX, ballY);
        for (let time = 0; time <= STROKE_DURATION_MS; time += 16) {
          batter.update(time);
          const pose = batter.inspect();
          expect(new Vector3(...pose.hands[0]).distanceTo(new Vector3(...pose.hands[1]))).toBeCloseTo(.110, 6);
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
    for (const shot of STROKES) {
      batter.swing(shot, 0, 0); batter.update(STROKE_DURATION_MS);
      expect(batter.inspect().grip).toEqual(guard.grip);
      expect(batter.inspect().frontFoot).toEqual(guard.frontFoot);
    }
  });
  it('uses distinct follow-throughs and steps into drives', () => {
    const batter = new Batter(); const signatures = new Set<string>();
    for (const shot of STROKES) {
      batter.reset(); batter.swing(shot, 0, 0); batter.update(470);
      const pose = batter.inspect(); signatures.add(JSON.stringify([pose.grip, pose.frontFoot, pose.yaw]));
      if (['STRAIGHT', 'LONG_ON', 'COVER_LONG_OFF'].includes(shot)) expect(pose.frontFoot[2]).toBeGreaterThan(.5);
    }
    expect(signatures.size).toBe(STROKES.length);
  });
  it('puts the blade at the ball when contact is presented', () => {
    const batter = new Batter();
    for (const [shot, ballX] of [['LEG', -.3], ['LONG_ON', -.14], ['STRAIGHT', 0], ['COVER_LONG_OFF', .14], ['SQUARE_CUT', .42], ['DEFEND', 0], ['DEFEND', -.18]] as const) {
      batter.reset(); batter.swing(shot, 0, ballX); batter.update(110);
      const point = batter.inspect().bladeContact;
      expect(point[0]).toBeCloseTo(ballX, 6); expect(point[1]).toBeCloseTo(.54, 6); expect(point[2]).toBeCloseTo(GAME.contactZ, 6);
    }
  });
});

describe('bat travel', () => {
  it('carries the lofted straight drive past the upright blade and up over the shoulder',()=>{
    const batter=new Batter(); batter.prepare(1); batter.update(0); batter.swing('STRAIGHT',0,0,.54,GAME.contactZ,false,true);
    batter.update(220); const through=batter.inspect();
    batter.update(310); const carry=batter.inspect();
    batter.update(410); const finish=batter.inspect();
    expect(finish.bladeTip[1]-through.bladeTip[1]).toBeGreaterThan(.6);
    expect(finish.grip[1]).toBeGreaterThan(1.55);
    // Through the extension the blade still points down the ground; by the
    // carry it has come up in front of him; at the finish it stands above the
    // hands. Held horizontal above the helmet instead — which is where it used
    // to stop — the stroke reads as a javelin rather than a drive hit through.
    expect(through.batUp[2]).toBeLessThan(-.5);
    expect(carry.batUp[2]).toBeLessThan(-.6);
    expect(finish.batUp[1]).toBeLessThan(-.85);
    expect(finish.bladeTip[1]).toBeGreaterThan(finish.grip[1]+.5);
    // The shoulders turn through it rather than the arms doing all the work.
    expect(finish.yaw).toBeLessThan(.80);
  });
  it('keeps the classic straight drive below the lofted one it shares a contact with',()=>{
    const played = (lofted: boolean) => {
      const batter=new Batter(); batter.prepare(1); batter.update(0);
      batter.swing('STRAIGHT',0,0,.54,GAME.contactZ,false,lofted);
      batter.update(STROKE_CONTACT_MS); const contact=batter.inspect();
      batter.update(410); return { contact, finish: batter.inspect() };
    };
    const four = played(false), six = played(true);
    // Same ball, same contact: only the follow-through separates them.
    expect(four.contact.grip).toEqual(six.contact.grip);
    expect(four.contact.batUp).toEqual(six.contact.batUp);
    // The six goes up and over; the four is checked, and stays lower and
    // squarer with the blade still pointing up the ground after the ball.
    expect(six.finish.grip[1]).toBeGreaterThan(four.finish.grip[1] + .15);
    expect(six.finish.batUp[1]).toBeLessThan(four.finish.batUp[1] - .15);
    expect(four.finish.grip[1] - four.contact.grip[1]).toBeGreaterThan(.40);
    expect(four.finish.bladeTip[1]).toBeGreaterThan(four.finish.grip[1] + .4);
    // The six comes up off the back foot; the four stays planted on it.
    expect(six.finish.backFoot[1]).toBeGreaterThan(four.finish.backFoot[1] - 1e-9);
  });
  it('carries both drives through impact and extension without stopping at a pose key',()=>{
    for(const shot of ['STRAIGHT','COVER_LONG_OFF'] as const) {
      const batter=new Batter(); batter.prepare(1); batter.update(0);
      batter.swing(shot,0,shot==='STRAIGHT'?0:.10);
      for(const time of [110,220]) {
        // Compare one-sided derivatives close to the key, not acceleration
        // averaged over a whole millisecond of the faster drive downswing.
        const dt=.1;
        const points=[time-dt,time,time+dt].map(t=>{batter.update(t);return new Vector3(...batter.inspect().bladeTip);});
        const before=points[1].clone().sub(points[0]).divideScalar(dt),after=points[2].clone().sub(points[1]).divideScalar(dt);
        expect(before.length()).toBeGreaterThan(.001);
        expect(before.clone().normalize().dot(after.clone().normalize())).toBeGreaterThan(.995);
        expect(after.length()/before.length()).toBeGreaterThan(.94);
        expect(after.length()/before.length()).toBeLessThan(1.06);
      }
      batter.update(410); const finish=batter.inspect();
      expect(finish.frontFoot[2]).toBeGreaterThan(.5);
      expect(finish.hip[1]).toBeLessThan(.9);
      // The lead elbow still leads, but it sits a little lower against the
      // shoulder than it used to: solving the drives for arm extension carries
      // the hands forward, down the ground, rather than up beside the ear, and
      // an arm reaching forward puts its elbow further forward too.
      expect(finish.elbows[0][1]-finish.shoulders[0][1]).toBeGreaterThan(.08);
      if(shot==='STRAIGHT') {
        // The classic drive: blade up and pointing up the ground, not wrapped.
        expect(finish.batUp[1]).toBeLessThan(-.55);
        expect(finish.bladeTip[1]).toBeGreaterThan(1.35);
      }
      else expect(finish.batUp[0]).toBeLessThan(-.8);
    }
  });
  const sample = (shot: ShotType, ballX: number) => {
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
    for (const shot of STROKES) {
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

describe('the bat and the body', () => {
  /**
   * How far into a body part the bat reaches, as a fraction of that part's own
   * radius: 1 is the surface, below 1 is inside it. The parts are the ellipsoids
   * the figure is actually built from in the constructor, so this measures the
   * thing a player sees rather than a distance from an imaginary centre line.
   */
  const deepest = (a: Vector3, b: Vector3, centre: Vector3, radii: Vector3, turn: Quaternion) => {
    const inverse = turn.clone().invert();
    let worst = Infinity;
    for (let i = 0; i <= 40; i++) {
      const point = a.clone().lerp(b, i / 40).sub(centre).applyQuaternion(inverse);
      worst = Math.min(worst, Math.hypot(point.x / radii.x, point.y / radii.y, point.z / radii.z));
    }
    return worst;
  };
  it('never passes the bat through the batter, on any stroke', () => {
    // The pick-up holds the blade up behind one shoulder and the contact holds
    // it down at the ball, half a turn away; a wrapped follow-through ends
    // behind the other shoulder. The short path between such a pair goes
    // through him — round the hip on the way down, through the head on the way
    // home — so the poses either side of it, and the recovery pose a stroke can
    // name, have to be chosen to take the bat round instead.
    const root = new Vector3(GAME.stanceX, 0, GAME.stanceZ);
    for (const shot of STROKES) {
      let worst = { value: Infinity, part: '', where: '' };
      for (const ballY of [.54, 1.12]) for (const ballX of [-.55, -.42, -.3, -.14, 0, .14, .42, .55]) {
        const batter = new Batter();
        batter.reset(); batter.prepare(1); batter.update(0); batter.swing(shot, 0, ballX, ballY);
        for (let time = 0; time <= STROKE_DURATION_MS; time += 8) {
          batter.update(time);
          const pose = batter.inspect();
          const chest = new Vector3(...pose.chest), hip = new Vector3(...pose.hip);
          const spine = chest.clone().sub(hip).normalize();
          const yaw = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), pose.yaw);
          const torso = new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), spine).multiply(yaw);
          const head = chest.clone().addScaledVector(spine, .31).add(new Vector3(.01, .01, .025));
          const bat: [Vector3, Vector3] = [new Vector3(...pose.grip), new Vector3(...pose.bladeTip).sub(root)];
          const parts: [string, Vector3, Vector3, Quaternion][] = [
            ['trunk', chest.clone().addScaledVector(spine, -.075), new Vector3(.205, .275, .145), torso],
            ['hips', hip, new Vector3(.185, .145, .135), yaw],
            ['helmet', head, new Vector3(.188, .19, .195), torso],
          ];
          for (const [part, centre, radii, turn] of parts) {
            const value = deepest(...bat, centre, radii, turn);
            if (value < worst.value) worst = { value, part, where: `y=${ballY} x=${ballX} @${time}ms` };
          }
        }
      }
      expect(worst.value, `${shot} reaches ${worst.value.toFixed(2)} into the ${worst.part} at ${worst.where}`).toBeGreaterThan(1);
    }
  });
});

/**
 * The shirt and the trousers are lathed skins rather than the two scaled spheres
 * they replaced, and the whole suite of blade-clearance checks above measures the
 * bat against those spheres — `deepest` takes ellipsoid radii, not a mesh.
 *
 * That model stays honest only while nothing is drawn outside the envelope it
 * describes. So this walks the real vertices of the real geometry, in every pose
 * of every stroke, and holds each one inside the union of the three ellipsoids
 * the bat is tested against. A blade clear of the envelope is then clear of the
 * figure, and reshaping the trunk does not silently invalidate every clearance
 * figure in this file. Fail this and the clearance tests are guarding a shape
 * that is no longer on screen.
 */
describe('the lathed torso', () => {
  const inside = (point: Vector3, centre: Vector3, radii: Vector3, turn: Quaternion) => {
    const p = point.clone().sub(centre).applyQuaternion(turn.clone().invert());
    return Math.hypot(p.x / radii.x, p.y / radii.y, p.z / radii.z);
  };
  it('keeps the lathed torso inside the ellipsoids the bat is tested against', () => {
    const root = new Vector3(GAME.stanceX, 0, GAME.stanceZ);
    const named = (batter: Batter, name: string) => {
      let found: any;
      batter.root.traverse((o: any) => { if (o.name === name) found = o; });
      expect(found, `no mesh named ${name}`).toBeTruthy();
      return found;
    };
    let worst = { value: -Infinity, part: '', where: '' };
    for (const shot of STROKES) {
      for (const ballY of [.54, 1.12]) for (const ballX of [-.55, 0, .55]) {
        const batter = new Batter();
        batter.reset(); batter.prepare(1); batter.update(0); batter.swing(shot, 0, ballX, ballY);
        const skins = [named(batter, 'Shirt, hem to collar'), named(batter, 'Trousers to the waistband')];
        for (let time = 0; time <= STROKE_DURATION_MS; time += 40) {
          batter.update(time);
          const pose = batter.inspect();
          batter.root.updateMatrixWorld(true);
          const chest = new Vector3(...pose.chest), hip = new Vector3(...pose.hip);
          const spine = chest.clone().sub(hip).normalize();
          const yaw = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), pose.yaw);
          const torso = new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), spine).multiply(yaw);
          const head = chest.clone().addScaledVector(spine, .31).add(new Vector3(.01, .01, .025));
          const parts: [Vector3, Vector3, Quaternion][] = [
            [chest.clone().addScaledVector(spine, -.075), new Vector3(.205, .275, .145), torso],
            [hip, new Vector3(.185, .145, .135), yaw],
            [head, new Vector3(.188, .19, .195), torso],
          ];
          for (const skin of skins) {
            const position = skin.geometry.attributes.position;
            const vertex = new Vector3();
            for (let i = 0; i < position.count; i++) {
              vertex.fromBufferAttribute(position, i).applyMatrix4(skin.matrixWorld).sub(root);
              // Inside the union: the closest-fitting ellipsoid is the one that
              // has to contain it, so take the best of the three.
              let best = Infinity;
              for (const [centre, radii, turn] of parts) best = Math.min(best, inside(vertex, centre, radii, turn));
              if (best > worst.value) worst = { value: best, part: skin.name, where: `${shot} y=${ballY} x=${ballX} @${time}ms` };
            }
          }
        }
      }
    }
    expect(worst.value, `${worst.part} reaches ${worst.value.toFixed(3)} of the envelope at ${worst.where}`).toBeLessThanOrEqual(1);
  });
});

describe('arm placement', () => {
  // The back elbow used to be aimed at a fixed point across the chest, which
  // buried it inside the torso in the guard and through the leg-side wrap.
  it('keeps both elbows clear of the torso in every pose', () => {
    let worst = { clearance: Infinity, where: '' };
    // 1.12 is bouncer height, which turns the leg-side input into a pull.
    for (const [shot, ballY] of STROKES.flatMap(s => [[s, .54], [s, 1.12]] as const)) {
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
  it('carries nonzero, continuous blade velocity through contact and extension', () => {
    for (const kind of ['pull', 'square'] as const) {
      const batter = new Batter(); batter.prepare(1); batter.update(0);
      play(batter, kind);
      for (const time of kind === 'square' ? [SQUARE_DRIVE_CONTACT_MS, 240] : [PULL_CONTACT_MS, 340]) {
        const positions = [time-1, time, time+1].map(t => { batter.update(t); return new Vector3(...batter.inspect().bladeTip); });
        const before = positions[1].clone().sub(positions[0]), after = positions[2].clone().sub(positions[1]);
        expect(before.length(), `${kind} stopped at ${time}`).toBeGreaterThan(.001);
        expect(before.clone().normalize().dot(after.clone().normalize())).toBeGreaterThan(.995);
        expect(after.length()/before.length()).toBeGreaterThan(.94);
        expect(after.length()/before.length()).toBeLessThan(1.06);
      }
    }
  });
  it('loads the back leg, extends square, then wraps behind the lead shoulder', () => {
    const batter = new Batter();
    batter.prepare(1); batter.update(0); batter.swing('LEG', 0, 0, 1.12);
    batter.update(PULL_LOAD_MS); const load = batter.inspect();
    expect(load.batUp[1]).toBeLessThan(-.75);
    expect(load.grip[2]).toBeLessThan(0);
    expect(load.yaw).toBeGreaterThan(1.3);
    expect(batter.strikeAt).toBe(PULL_CONTACT_MS);
    batter.update(PULL_CONTACT_MS); const contact = batter.inspect();
    expect(contact.hip[2]).toBeLessThan(-.18);
    expect(contact.frontFoot[2]).toBeLessThan(.30);
    batter.update(340); const through = batter.inspect();
    expect(through.grip[0]).toBeLessThan(-.25);
    expect(Math.abs(through.batUp[1])).toBeLessThan(.2);
    batter.update(500); const finish = batter.inspect();
    expect(finish.yaw).toBeLessThan(through.yaw);
    expect(finish.bladeTip[2]).toBeLessThan(GAME.stanceZ);
  });
  it('keeps the high pull continuous through extension and recovery', () => {
    for (const x of [-.55, 0, .32]) {
      const batter = new Batter(); batter.prepare(1); batter.update(0);
      batter.swing('LEG', 0, x, 1.12);
      let previous = batter.inspect();
      for (let time = 8; time <= STROKE_DURATION_MS; time += 8) {
        batter.update(time); const pose = batter.inspect();
        expect(new Vector3(...pose.bladeTip).distanceTo(new Vector3(...previous.bladeTip))).toBeLessThan(.45);
        expect(new Vector3(...pose.batFace).dot(new Vector3(...previous.batFace))).toBeGreaterThan(.8);
        previous = pose;
      }
    }
  });
  it('answers a ball at the chest with its own stroke, and only on the leg side', () => {
    const batter = new Batter();
    batter.reset(); batter.swing('LEG', 0, -.02, 1.12); batter.update(110);
    expect(batter.inspect().pulling).toBe(true);
    // Everything else keeps its own stroke, however high the ball is.
    for (const shot of STROKES.filter(s => s !== 'LEG')) {
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
      batter.reset(); batter.swing('LEG', 0, ballX, 1.12); batter.update(PULL_CONTACT_MS);
      const blade = batter.inspect().bladeContact;
      expect(blade[0]).toBeCloseTo(ballX, 6); expect(blade[1]).toBeCloseTo(1.12, 6);
    }
  });
});

describe('the square cut', () => {
  const at = (time: number, ballX = .46, ballY = .54) => {
    const batter = new Batter();
    batter.reset(); batter.prepare(1); batter.update(0); batter.swing('SQUARE_CUT', 0, ballX, ballY);
    batter.update(time);
    return batter.inspect();
  };
  const root = new Vector3(GAME.stanceX, 0, GAME.stanceZ);

  it('answers a ball at the chest with its own stroke, and only on the off side', () => {
    expect(at(110, .46, 1.12).cutting).toBe(true);
    expect(at(110, .46, .54).cutting).toBe(false);
    // Everything else keeps its own stroke however high the ball is.
    for (const shot of STROKES.filter(s => s !== 'SQUARE_CUT')) {
      const batter = new Batter();
      batter.reset(); batter.swing(shot, 0, .46, 1.12); batter.update(110);
      expect(batter.inspect().cutting, shot).toBe(false);
    }
  });

  it('reaches the ball off a length and up at bouncer height', () => {
    for (const ballY of [.54, 1.12]) for (const ballX of [.28, .46, .55]) {
      const blade = at(110, ballX, ballY).bladeContact;
      expect(blade[0], `x ${ballX} y ${ballY}`).toBeCloseTo(ballX, 6);
      expect(blade[1], `y ${ballY}`).toBeCloseTo(ballY, 6);
    }
  });

  it('never plays back across the stumps, whatever it is swung at', () => {
    // Swung at a ball on the leg side the bat still goes square, out past the
    // off stump, so the ball passes it rather than the arms following it round.
    for (const ballX of [-.55, -.14, 0, .05]) {
      const blade = at(110, ballX).bladeContact;
      expect(blade[0], `ball at ${ballX}`).toBeGreaterThan(.1);
      // And well clear of the ball it was swung at, on anything down the leg.
      if (ballX < 0) expect(blade[0] - ballX, `ball at ${ballX}`).toBeGreaterThan(.2);
    }
    // A ball on the off stump, though, it does reach: the cut is the off side's
    // square stroke and there is nothing else out there to play it with.
    expect(at(110, LINE_X.OFF).bladeContact[0]).toBeCloseTo(LINE_X.OFF, 6);
  });

  it('is played off the back foot, without striding down the pitch', () => {
    const guard = new Batter().inspect();
    for (const time of [110, 300, 470]) {
      const pose = at(time);
      // The drives push the front foot out past .5; the cut leaves it behind.
      expect(pose.frontFoot[2], `${time}ms`).toBeLessThan(guard.frontFoot[2]);
      // And the back foot has gone back and across, under the weight.
      expect(pose.backFoot[2], `${time}ms`).toBeLessThan(guard.backFoot[2]);
      expect(pose.backFoot[0], `${time}ms`).toBeGreaterThan(guard.backFoot[0]);
    }
  });

  it('follows through over the front shoulder rather than stopping at the ball', () => {
    for (const ballY of [.54, 1.12]) {
      const contact = at(110, .46, ballY), finish = at(470, .46, ballY);
      const contactTip = new Vector3(...contact.bladeTip).sub(root);
      const tip = new Vector3(...finish.bladeTip).sub(root);
      // The blade has travelled: it does not stop where it met the ball.
      expect(tip.distanceTo(contactTip), `y ${ballY}`).toBeGreaterThan(.9);
      // Up over the shoulders, and over the front one — the left — not the back.
      expect(tip.y, `y ${ballY}`).toBeGreaterThan(new Vector3(...finish.shoulders[0]).y + .35);
      expect(tip.distanceTo(new Vector3(...finish.shoulders[0])))
        .toBeLessThan(tip.distanceTo(new Vector3(...finish.shoulders[1])));
      // And the hands finish high: risen off the ball and above the chest. A
      // chest-high ball is met with the hands already up, so the rise is
      // smaller there than off a length — but it is always a rise.
      expect(finish.grip[1], `y ${ballY}`).toBeGreaterThan(contact.grip[1] + .1);
      expect(finish.grip[1], `y ${ballY}`).toBeGreaterThan(finish.chest[1]);
    }
  });

  it('unwinds the body onto the back foot instead of standing still', () => {
    const contact = at(110), finish = at(470);
    // The chest opens up through the stroke, the way a cross-bat stroke does.
    expect(finish.yaw).toBeLessThan(contact.yaw - .8);
    // On a back foot that stays planted: the toe never leaves the ground.
    for (const time of [110, 250, 400, 470]) expect(at(time).backToe[1], `${time}ms`).toBeCloseTo(.01, 5);
  });
});

describe('the grip', () => {
  it.each(['straight','cover','square'])('uses a diagonal top-hand wrist and leading elbow for %s',kind=>{
    const batter=new Batter(); batter.prepare(1); batter.update(0);
    play(batter, kind, PLAYS[kind].reach[1]);
    batter.update(PLAYS[kind].impact);
    const p=batter.inspect(), axis=new Vector3(0,1,0).applyQuaternion(batter.bat.quaternion);
    const topHand=new Vector3(...p.hands[0]).sub(batter.root.position);
    const wrist=new Vector3(...p.wrists[0]);
    expect(wrist.clone().sub(topHand).dot(axis)).toBeGreaterThan(.015);
    expect(p.elbows[0][1]-wrist.y).toBeGreaterThan(.10);
  });
  it('does not flip an elbow or wrist between frames, including entering and leaving guard', () => {
    for (const kind of ['pull','square','straight','cover','sweep','flat','charge','coverCharge','onCharge','onLofted','scoop','reverse']) for (const x of PLAYS[kind].reach) {
      const batter = new Batter(); batter.prepare(1); batter.update(0);
      let previous = batter.inspect();
      play(batter, kind, x);
      for (let t=0;t<=STROKE_DURATION_MS;t+=2) {
        batter.update(t); const pose=batter.inspect();
        for (let i=0;i<2;i++) {
          const where=`${kind} x=${x} arm=${i} @${t}`;
          // Speed, not continuity: a flip would also show up in the grip
          // rotation checked just below, and this is the square drive turning
          // the blade over through more than a right angle inside a tenth of a
          // second, which the trailing elbow has to travel to keep up with.
          expect(new Vector3(...pose.elbows[i]).distanceTo(new Vector3(...previous.elbows[i])),where).toBeLessThan(.032);
          expect(new Quaternion(...pose.gripRotation[i]).angleTo(new Quaternion(...previous.gripRotation[i])),where).toBeLessThan(.30);
          expect(pose.cuffAim[i].socketError,where).toBeLessThan(1e-9);
          expect(pose.cuffAim[i].flex,where).toBeLessThan(Math.PI/2);
          // A skin ball smaller than the sleeve radius left an open seam
          // at the folded charge elbow despite correct joint coordinates.
          expect(pose.elbowCoverage[i],where).toBeGreaterThan(0);
        }
        previous=pose;
      }
    }
  });
  it('holds the handle with two hands that agree about it', () => {
    const batter = new Batter();
    let flattest = Infinity, wristWhere = '';
    for (const [shot, ballY] of STROKES.flatMap(s => [[s, .54], [s, 1.12]] as const)) {
      for (const ballX of [-.5, 0, .5]) {
        batter.reset(); batter.prepare(1); batter.update(0); batter.swing(shot, 0, ballX, ballY);
        for (let time = -1; time <= STROKE_DURATION_MS; time += 20) {
          batter.update(time);
          const pose = batter.inspect();
          // Fingers stay wrapped along the handle even as wrists pronate.
          for (const axis of pose.gripAxis) expect(axis).toBeCloseTo(1, 9);
          // Real close-up reference: left hand closes over the shaft, right
          // wraps underneath. Two identical palm-up grips are not equivalent.
          expect(pose.gloveBack[0]).toEqual([0,0,-1]);
          expect(pose.gloveBack[1]).toEqual([0,0,1]);
          // The right hand is the bottom hand: nearer the blade than the left.
          expect(pose.handGrip[1], `${shot} at ${time}ms`).toBeLessThan(pose.handGrip[0]);
          for (const [i, aim] of pose.cuffAim.entries()) {
            // The gauntlet meets the arm wherever the stroke has rolled the bat,
            // and the elbow stays off the handle rather than lying along it.
            expect(aim.alongForearm, `${shot} arm ${i} at ${time}ms`).toBeCloseTo(1, 6);
            expect(aim.socketError).toBeLessThan(1e-9);
            if (aim.elbowOffHandle < flattest) { flattest = aim.elbowOffHandle; wristWhere = `${shot} arm ${i} at ${time}ms`; }
          }
        }
      }
    }
    // The handle is .048 across and a forearm .095: closer than this and one is
    // inside the other.
    expect(flattest, `closest elbow to the handle: ${wristWhere}`).toBeGreaterThan(.09);
  });

  it('waits with the bat cocked back towards first slip, flat face down', () => {
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
    // The flat striking face looks down; the raised spine is on top.
    expect(guard.batFace[1]).toBeLessThan(-.4);
  });
});

describe('shoulders', () => {
  it.each(['straight','lofted','cover','square','charge','coverCharge','onCharge','onLofted'])('powers the %s follow-through with upper-arm travel', kind => {
    const batter=new Batter(); batter.prepare(1); batter.update(0);
    play(batter, kind, PLAYS[kind].reach[1]);
    batter.update(PLAYS[kind].impact); const contact=batter.inspect();
    batter.update(PLAYS[kind].settle); const finish=batter.inspect();
    // The classic straight drive is the checked one: it is held to a smaller
    // sweep on purpose, and the lofted six beside it carries the full one.
    const bar = kind==='straight' ? Math.PI/6 : Math.PI/4;
    for(let i=0;i<2;i++) {
      const from=new Vector3(...contact.elbows[i]).sub(new Vector3(...contact.shoulders[i]));
      const to=new Vector3(...finish.elbows[i]).sub(new Vector3(...finish.shoulders[i]));
      expect(from.angleTo(to)).toBeGreaterThan(bar);
    }
    expect(finish.grip[1]-contact.grip[1]).toBeGreaterThan(kind==='straight'?.40:.5);
    if(kind==='straight') {
      batter.update(160); const early=batter.inspect().batUp[2];
      batter.update(220); expect(batter.inspect().batUp[2]).toBeLessThan(early-.15);
    }
  });
  it('never carries the hands round behind the back', () => {
    const batter = new Batter();
    const strokes: [string, () => void][] = [
      ...STROKES.map(shot => [shot, () => batter.swing(shot, 0, 0, .54)] as [string, () => void]),
      ['the pull', () => batter.swing('LEG', 0, -.02, 1.12)],
      ['the charge', () => batter.swing('STRAIGHT', 0, 0, .54, GAME.contactZ + CHARGE_MEETS_AT, true)],
      ['the charge over cover', () => batter.swing('COVER_LONG_OFF', 0, 0, .54, GAME.contactZ + CHARGE_MEETS_AT, true)],
      ['the charge over long-on', () => batter.swing('LONG_ON', 0, 0, .54, GAME.contactZ + CHARGE_MEETS_AT, true)],
      ['the scoop', () => batter.swing('SCOOP', 0, -.07)],
      ['the reverse scoop', () => batter.swing('REVERSE_SCOOP', 0, .28)],
    ];
    for (const [name, play] of strokes) {
      batter.reset(); batter.prepare(1); batter.update(0); play();
      for (let time = 0; time <= STROKE_DURATION_MS; time += 10) {
        batter.update(time);
        // A two-handed grip cannot be taken round behind the shoulders. Every
        // stroke here carries both hands in front of them; a follow-through that
        // wraps them behind is the pose no body makes.
        for (const [i, forward] of batter.inspect().handsForward.entries())
          expect(forward, `${name}: hand ${i} at ${time}ms`).toBeGreaterThan(-.06);
      }
    }
  });
});

describe('every stroke, across its reach', () => {
  it.each(['straight','cover','square','charge','coverCharge','onCharge','onLofted','scoop','reverse'])('presents the flat face from face-down pickup into %s contact',kind=>{
    for(const x of PLAYS[kind].reach) {
      const batter=new Batter(); batter.prepare(1); batter.update(0);
      expect(batter.inspect().batFace[1]).toBeLessThan(-.4);
      const impact=PLAYS[kind].impact;
      play(batter, kind, x);
      batter.update(impact);
      const contactFace=new Vector3(...batter.inspect().batFace);
      const contactUp=new Vector3(0,1,0).applyQuaternion(batter.bat.quaternion);
      for(let time=0;time<=impact;time+=2) {
        batter.update(time);
        const pose=batter.inspect();
        const up=new Vector3(0,1,0).applyQuaternion(batter.bat.quaternion);
        const unrolled=contactFace.clone().applyQuaternion(new Quaternion().setFromUnitVectors(contactUp,up));
        // Cover opens from the shared straight-facing guard toward off side;
        // allow that placement adjustment, never a flat/back-face reversal.
        //
        // Not measured while the handle points the opposite way to its
        // contact axis: the charge's backlift takes the toe to the sky, and
        // carrying a face from one axis to its near-reverse has no shortest
        // rotation to carry it by, so the comparison is between two arbitrary
        // rolls. The rig's own transport (`apply`) has the same freedom there
        // and uses it continuously; this check resumes the moment there is a
        // rotation to compare against.
        // The scoops are the exception: the face is turned over on the way
        // down, from face-down in the pick-up to the sky at the ball, and
        // that roll is the stroke. Their face is checked at the ball below.
        if (up.dot(contactUp) > -.95 && kind!=='scoop' && kind!=='reverse') expect(new Vector3(...pose.batFace).dot(unrolled), `${kind} x=${x} @${time}`).toBeGreaterThan(.5);
        // Both palms retain the handle axis; wrists must never fold backwards.
        for(const axis of pose.gripAxis) expect(axis).toBeCloseTo(1,9);
        for(const cuff of pose.cuffAim) expect(cuff.flex).toBeLessThan(Math.PI/2);
      }
      // Each stroke presents its own face: the drives down the ground and
      // through cover, the square drive square of the wicket, the charge over
      // cover opened out between the two.
      const face=batter.inspect().batFace;
      if(kind==='square') expect(face[0]).toBeGreaterThan(.8);
      else if(kind==='coverCharge') { expect(face[0]).toBeGreaterThan(.3); expect(face[2]).toBeGreaterThan(.7); }
      else if(kind==='onCharge'||kind==='onLofted') { expect(face[0]).toBeLessThan(-.2); expect(face[2]).toBeGreaterThan(.7); }
      // The scoops present the face to the sky: the ball is ridden off it up
      // over the keeper rather than hit.
      else if(kind==='scoop'||kind==='reverse') expect(face[1]).toBeGreaterThan(.75);
      else expect(face[2]).toBeGreaterThan(.8);
    }
  });
  it.each(['pull','square','straight','cover','sweep','flat','charge','coverCharge','onCharge','onLofted','scoop','reverse'])('keeps the %s blade volume outside body, helmet, joints and forearms', (kind) => {
    const geometry=bladeGeometry(), positions=geometry.getAttribute('position'), index=geometry.getIndex()!;
    const samples=Array.from({length:positions.count},(_,i)=>new Vector3().fromBufferAttribute(positions,i));
    for(let i=0;i<index.count;i+=3) samples.push(
      new Vector3().add(samples[index.getX(i)]).add(samples[index.getX(i+1)]).add(samples[index.getX(i+2)]).divideScalar(3));
    geometry.dispose();
    for (const x of PLAYS[kind].reach) {
      const batter = new Batter(); batter.prepare(1); batter.update(0);
      play(batter, kind, x);
      const spheres: import('three').Mesh[] = [];
      batter.root.traverse(object => {
        const mesh = object as import('three').Mesh;
        if (mesh.isMesh && mesh.geometry.type === 'SphereGeometry') spheres.push(mesh);
      });
      let worst = {distance: Infinity, time: 0, part: ''};
      let forearmClearance = {distance: Infinity, time: 0, arm: 0};
      for (let time = 0; time <= STROKE_DURATION_MS; time += 4) {
        batter.update(time); batter.root.updateMatrixWorld(true);
        const pose=batter.inspect();
        for (const lengths of pose.armLengths) expect(lengths[1], `${kind} ${x} arm @${time}`).toBeLessThan(.345);
        for (const lengths of pose.legLengths) expect(lengths[1], `${kind} ${x} leg @${time}`).toBeLessThan(.445);
        const inverses = spheres.map(mesh => mesh.matrixWorld.clone().invert());
        for (const sample of samples) {
          const world = batter.bat.localToWorld(sample.clone());
          const local = world.clone().sub(batter.root.position);
          for (let arm=0;arm<2;arm++) {
            const elbow=new Vector3(...pose.elbows[arm]);
            const line=new Vector3(...pose.wrists[arm]).sub(elbow);
            const along=Math.max(0,Math.min(1,local.clone().sub(elbow).dot(line)/line.lengthSq()));
            const distance=local.distanceTo(elbow.addScaledVector(line,along));
            if(distance<forearmClearance.distance) forearmClearance={distance,time,arm};
          }
          inverses.forEach((inverse,i) => {
            const distance=world.clone().applyMatrix4(inverse).length();
            if (distance < worst.distance) worst={distance,time,part:String(i)};
          });
        }
      }
      expect(worst.distance, `${kind} x=${x} ${JSON.stringify(worst)}`).toBeGreaterThan(1);
      expect(forearmClearance.distance,`${kind} x=${x} ${JSON.stringify(forearmClearance)}`).toBeGreaterThan(.0475);
    }
  });
});


/**
 * The slog sweep — the second special stroke, and the only one played off the
 * knee. Everything the shared rig checks already applies to it, because it is
 * in `PLAYS`; what is left is the shape of the stroke itself, which is what
 * separates a sweep from a leg-side swipe played standing up.
 */
/**
 * A pad is strapped to a shin and a shoe is on the foot below it, so the two
 * face the same way — always, in every stroke, whatever the leg is doing. The
 * rig did not: the pad's roll about the shin was left to whatever
 * `setFromUnitVectors` happened to produce, which put it up to 95 degrees off
 * its own shoe and turning the opposite way to the leg through the shot.
 */
describe('the front pad', () => {
  const flat = (v: Vector3) => new Vector3(v.x, 0, v.z).normalize();
  it.each(['pull', 'square', 'straight', 'cover', 'sweep', 'flat'])('faces where the %s shoe faces', kind => {
    for (const x of PLAYS[kind].reach) {
      const batter = new Batter(); batter.prepare(1); batter.update(0);
      play(batter, kind, x);
      const leg = (batter as unknown as { legs: { pad: Object3D; shoe: Object3D }[] }).legs[0];
      let worst = { off: 0, at: 0 };
      for (let time = 0; time <= STROKE_DURATION_MS; time += 8) {
        batter.update(time);
        const pad = flat(new Vector3(0, 0, 1).applyQuaternion(leg.pad.quaternion));
        const shoe = flat(new Vector3(0, 0, 1).applyQuaternion(leg.shoe.quaternion));
        const off = pad.angleTo(shoe) * 180 / Math.PI;
        if (off > worst.off) worst = { off, at: time };
      }
      // Not zero: the pad's face is square to the shin, so a shin leaning hard
      // carries it a little off the shoe's flat bearing, which is what a real
      // pad does too.
      expect(worst.off, `${kind} x=${x} ${JSON.stringify(worst)}`).toBeLessThan(25);
    }
  });
});

describe('the slog sweep', () => {
  const swept = (x = 0) => { const batter = new Batter(); batter.prepare(1); batter.update(0); play(batter, 'sweep', x); return batter; };
  it('gets down on it: the back knee goes to the turf and stays there', () => {
    const batter = swept();
    const guard = batter.inspect().hip[1];
    let lowest = Infinity, atContact = Infinity;
    for (let time = 0; time <= STROKE_DURATION_MS; time += 4) {
      batter.update(time);
      const pose = batter.inspect();
      lowest = Math.min(lowest, pose.knees[1][1]);
      if (time === SWEEP_CONTACT_MS) atContact = pose.knees[1][1];
      // Never through it: a knee under the turf reads as a man sunk into the
      // square, and it is the kind of thing only a number catches.
      expect(pose.knees[1][1], `back knee @${time}ms`).toBeGreaterThan(0);
      expect(pose.knees[0][1], `front knee @${time}ms`).toBeGreaterThan(0);
    }
    // On the ground at the ball, not on the way there.
    expect(atContact).toBeLessThan(.12);
    expect(lowest).toBeLessThan(.10);
    // And the hips go with it — he is not bending at the waist over a standing leg.
    batter.update(SWEEP_CONTACT_MS);
    expect(guard - batter.inspect().hip[1]).toBeGreaterThan(.30);
  });
  it('plants the front foot across and in front of the hips', () => {
    const batter = swept();
    batter.update(SWEEP_CONTACT_MS);
    const pose = batter.inspect();
    // The foot has to TRAVEL. Bending where it already stood while the body
    // sinks past it is the thing this catches, and it is what the rig did.
    //
    // Travel, though — not travel down the ground, which is what this asked for
    // first and which turns out to be unsatisfiable. The ball is met at a fixed
    // point, and the swing has to happen in front of the front pad, so the foot
    // has to end up BEHIND the ball. Ask for it forward of the crease as well
    // and there is nowhere left to put it: the bat cannot be ahead of a foot
    // that is ahead of the ball. So he steps across the line and sits on it,
    // which is what a slog sweep is, and the distance he covers doing it is
    // what says he moved.
    const guard = new Batter().inspect();
    const travel = Math.hypot(pose.frontFoot[0] - guard.frontFoot[0], pose.frontFoot[2] - guard.frontFoot[2]);
    expect(travel, `front foot travel from guard`).toBeGreaterThan(.28);
    expect(pose.frontFoot[0] - guard.frontFoot[0], `across`).toBeGreaterThan(.22);
    // And it stays in front of the back foot — he is not stepping backwards.
    expect(pose.frontFoot[2] - pose.backFoot[2]).toBeGreaterThan(.55);
  });
  it('swings the blade flat through the ball', () => {
    const batter = swept();
    batter.update(SWEEP_CONTACT_MS);
    const pose = batter.inspect();
    // The handle is across him, not up: a sweep met with the bat vertical is a
    // different shot, and a worse one.
    expect(Math.abs(pose.batUp[1])).toBeLessThan(.30);
    // Hands inside the line of the ball. He stands to the leg side of a ball on
    // the stumps, so the hands have to finish between him and it and the blade
    // reaches across — which is what "inside the line" means and what makes it
    // a sweep rather than a pull.
    //
    // (This previously compared the tip's WORLD x against the hands' ROOT-LOCAL
    // x. Those frames are 0.36 apart, which is the same order as the thing being
    // measured, and the assertion passed by luck rather than by being true.)
    const contact = new Vector3(...pose.bladeContact).sub(batter.root.position);
    const hands = new Vector3(...pose.hands[0]).sub(batter.root.position);
    const tip = new Vector3(...pose.bladeTip).sub(batter.root.position);
    expect(hands.x, 'hands inside the ball').toBeLessThan(contact.x - .1);
    expect(tip.x, 'blade reaching across to it').toBeGreaterThan(hands.x + .2);
  });
  it('finishes over the front shoulder, not the one it started behind', () => {
    const batter = swept();
    batter.update(560);
    const pose = batter.inspect();
    const hands = new Vector3(...pose.hands[0]).sub(batter.root.position);
    const front = new Vector3(...pose.shoulders[0]), back = new Vector3(...pose.shoulders[1]);
    // Right-handed, swept to midwicket: the bat ends up over his left, which is
    // the shoulder that led. Ending over the back one is the stroke played
    // backwards, and is exactly what the square drive did before it was rebuilt.
    expect(hands.distanceTo(front)).toBeLessThan(hands.distanceTo(back));
    // Outside that shoulder rather than in front of his face.
    expect(front.x - hands.x).toBeGreaterThan(.05);
    // And high: the bat has gone up, which is what makes it a slog.
    expect(hands.y).toBeGreaterThan(front.y - .05);
  });
  /**
   * Both fists are on one handle, so the two forearms always arrive at the same
   * place; what tells a grip from a raft paddle is whether they get there side
   * by side or reach across each other. The first slog sweep pinched the elbows
   * onto one line — 0.04m between the forearms where the other strokes keep
   * 0.13m and up — and read as a man paddling rather than swinging.
   */
  it.each(['pull', 'square', 'straight', 'cover', 'sweep', 'flat'])('keeps the %s forearms apart and the elbows unswapped', kind => {
    /** Closest approach of the elbow halves, which is the half that can cross. */
    const between = (a: Vector3, b: Vector3, c: Vector3, d: Vector3) => {
      const u = b.clone().sub(a), v = d.clone().sub(c), w = a.clone().sub(c);
      const A = u.dot(u), B = u.dot(v), C = v.dot(v), D = u.dot(w), E = v.dot(w);
      const den = A * C - B * B;
      let s = den > 1e-9 ? THREE_clamp((B * E - C * D) / den) : 0;
      const t = den > 1e-9 ? THREE_clamp((A * E - B * D) / den) : THREE_clamp(E / (C || 1));
      s = THREE_clamp(s);
      return a.clone().addScaledVector(u, s).distanceTo(c.clone().addScaledVector(v, t));
    };
    let worst = { gap: Infinity, at: 0 }, tightest = { splay: Infinity, at: 0 };
    for (const x of PLAYS[kind].reach) {
      const batter = new Batter(); batter.prepare(1); batter.update(0);
      play(batter, kind, x);
      for (let time = 0; time <= STROKE_DURATION_MS; time += 4) {
        batter.update(time);
        const pose = batter.inspect();
        const el = pose.elbows.map(a => new Vector3(...a));
        const wr = pose.wrists.map(a => new Vector3(...a));
        const sh = pose.shoulders.map(a => new Vector3(...a));
        const half = (a: Vector3, b: Vector3) => [a, a.clone().lerp(b, .55)] as const;
        const gap = between(...half(el[0], wr[0]), ...half(el[1], wr[1]));
        if (gap < worst.gap) worst = { gap, at: time };
        // Measured across his own shoulders, so it survives him turning: the
        // back elbow belongs on the back side of the front one.
        const across = sh[1].clone().sub(sh[0]);
        if (across.lengthSq() > 1e-9) {
          const splay = el[1].clone().sub(el[0]).dot(across.normalize());
          if (splay < tightest.splay) tightest = { splay, at: time };
        }
      }
    }
    // A forearm is .095 across, so anything under that is one inside the other.
    expect(worst.gap, `${kind} ${JSON.stringify(worst)}`).toBeGreaterThan(.098);
    expect(tightest.splay, `${kind} ${JSON.stringify(tightest)}`).toBeGreaterThan(.20);
  });
  /**
   * How far the blade turns about its own handle across the stroke. Wrists do
   * roll through a cross-bat shot and the blade has to turn over; what it must
   * not do is spin, and the first sweep rolled it a hundred degrees further
   * than the drives while reversing direction twice on the way.
   */
  it('turns the blade over without spinning it', () => {
    const batter = new Batter(); batter.prepare(1); batter.update(0);
    play(batter, 'sweep', 0);
    let previous = NaN, travelled = 0, worst = 0;
    for (let time = 0; time <= 620; time += 4) {
      batter.update(time);
      const up = new Vector3(...batter.inspect().batUp).normalize();
      const face = new Vector3(0, 0, 1).applyQuaternion(batter.bat.quaternion);
      const bearing = new Vector3(Math.cos(Math.atan2(up.x, up.z)), 0, -Math.sin(Math.atan2(up.x, up.z)));
      const roll = Math.atan2(up.dot(bearing.clone().cross(face)), bearing.dot(face)) * 180 / Math.PI;
      if (!Number.isNaN(previous)) {
        const step = ((roll - previous + 540) % 360) - 180;
        travelled += Math.abs(step); worst = Math.max(worst, Math.abs(step));
      }
      previous = roll;
    }
    // The pull, the other cross-bat stroke, travels about 120 degrees.
    expect(travelled).toBeLessThan(175);
    // And no frame turns it a tenth of a revolution on its own.
    expect(worst).toBeLessThan(12);
  });
  it('is over before the stroke clock is, and comes all the way home', () => {
    const batter = swept();
    const guard = new Batter().inspect();
    batter.update(STROKE_DURATION_MS);
    const pose = batter.inspect();
    expect(pose.grip).toEqual(guard.grip);
    expect(pose.frontFoot).toEqual(guard.frontFoot);
    expect(pose.backFoot).toEqual(guard.backFoot);
  });
});

describe('the arms', () => {
  const REACH = .66;   // .32 upper + .34 lower
  const headOf = (pose: { chest: number[]; hip: number[] }) => new Vector3(...pose.chest)
    .add(new Vector3(...pose.chest).sub(new Vector3(...pose.hip)).normalize().multiplyScalar(.31))
    .add(new Vector3(.01, .01, .025));
  /**
   * Nothing above the arm solver knows where the batter's head is, and the bend
   * plane that reads best for a swing is often the one that folds the arm
   * straight through his own grille. Both drives used to: the lead upper arm
   * came within 0.09 m of the centre of the helmet on the square drive, which
   * is well inside it.
   */
  it.each(['pull','square','straight','lofted','cover','cut','sweep'])('keeps the %s arms out of the helmet', kind => {
    for (const x of PLAYS[kind].reach) {
      const batter = new Batter(); batter.prepare(1); batter.update(0);
      play(batter, kind, x);
      let worst = { gap: Infinity, at: 0, part: '' };
      for (let time = 0; time <= STROKE_DURATION_MS; time += 4) {
        batter.update(time);
        const pose = batter.inspect(), head = headOf(pose);
        for (let i = 0; i < 2; i++) {
          const shoulder = new Vector3(...pose.shoulders[i]), elbow = new Vector3(...pose.elbows[i]), wrist = new Vector3(...pose.wrists[i]);
          for (const [from, to, part] of [[shoulder, elbow, 'upper'], [elbow, wrist, 'forearm']] as const) {
            const line = to.clone().sub(from);
            const at = THREE_clamp(head.clone().sub(from).dot(line) / line.lengthSq());
            const gap = head.distanceTo(from.clone().addScaledVector(line, at));
            if (gap < worst.gap) worst = { gap, at: time, part: `${part}${i}` };
          }
          // The glove is a body in its own right, not a point on the handle.
          const glove = new Vector3(...pose.hands[i]).sub(batter.root.position);
          if (head.distanceTo(glove) - .05 < worst.gap) worst = { gap: head.distanceTo(glove) - .05, at: time, part: `glove${i}` };
        }
      }
      // The helmet is about .135 across and an arm about .05, so anything under
      // .185 is already inside him.
      expect(worst.gap, `${kind} x=${x} ${JSON.stringify(worst)}`).toBeGreaterThan(.185);
    }
  });
  /**
   * The elbows open THROUGH the ball. The reference recording shows the arms
   * still folded at contact and straightening over the next quarter second, and
   * the drives used to do the opposite: they were tighter at the extension key
   * than at the contact it came out of, which is the bent-armed, shoulder-hinged
   * look the whole stroke was judged on.
   */
  it.each(['square','straight','lofted','cover'])('opens the %s elbows out through impact', kind => {
    const spec = PLAYS[kind];
    for (const x of spec.reach) {
      const batter = new Batter(); batter.prepare(1); batter.update(0);
      play(batter, kind, x);
      const spanAt = (time: number) => {
        batter.update(time);
        const pose = batter.inspect();
        return [0, 1].map(i => new Vector3(...pose.shoulders[i]).distanceTo(new Vector3(...pose.wrists[i])) / REACH);
      };
      const contact = spanAt(spec.impact), open = spanAt(spec.impact + 110);
      for (let i = 0; i < 2; i++) {
        // Neither arm folds back through the ball. Against a wide one the
        // contact is already most of the way out, so the gain is small there —
        // what must never happen is the old behaviour, where the extension key
        // was tighter than the contact it came from.
        // Once an arm is straight it only has to stay straight; below that it
        // has to be opening. Either way it never folds back through the ball,
        // which is what the drives used to do.
        expect(open[i], `${kind} x=${x} arm ${i} folded back`).toBeGreaterThan(Math.min(contact[i], .90) - .01);
        expect(open[i], `${kind} x=${x} arm ${i} still tucked`).toBeGreaterThan(.70);
      }
      // And at least one of them is genuinely straight, not merely less folded.
      expect(Math.max(...open), `${kind} x=${x}`).toBeGreaterThan(.86);
    }
  });
  /** An arm past its own length is a stretched limb, not a straight one. */
  it.each(['pull','square','straight','lofted','cover','cut','sweep'])('never reaches the %s arms past their own length', kind => {
    for (const x of PLAYS[kind].reach) {
      const batter = new Batter(); batter.prepare(1); batter.update(0);
      play(batter, kind, x);
      for (let time = 0; time <= STROKE_DURATION_MS; time += 4) {
        batter.update(time);
        const pose = batter.inspect();
        for (let i = 0; i < 2; i++)
          expect(new Vector3(...pose.shoulders[i]).distanceTo(new Vector3(...pose.wrists[i])) / REACH,
            `${kind} x=${x} arm ${i} @${time}`).toBeLessThan(1.001);
      }
    }
  });
});

describe('the square drive', () => {
  it('is played only at a ball wide enough and full enough to drive square', () => {
    const batter = new Batter();
    const squaring = (x: number, y: number) => {
      batter.reset(); batter.prepare(1); batter.update(0);
      batter.swing('COVER_LONG_OFF', 0, x, y, GAME.contactZ);
      batter.update(SQUARE_DRIVE_CONTACT_MS);
      return batter.inspect().squaring;
    };
    // Wide and driveable: the square drive. On off stump, or up at the ribs,
    // the same input is still the cover drive.
    expect(squaring(SQUARE_DRIVE.minWidth, .54)).toBe(true);
    expect(squaring(.52, .19)).toBe(true);
    expect(squaring(SQUARE_DRIVE.minWidth - .02, .54)).toBe(false);
    expect(squaring(.52, .81)).toBe(false);
    // It is the off-side input's variation and nothing else's.
    batter.reset(); batter.prepare(1); batter.update(0);
    batter.swing('SQUARE_CUT', 0, .52, .54, GAME.contactZ);
    expect(batter.inspect().squaring).toBe(false);
    // Charging overrides it, the way it overrides every other variation.
    batter.reset(); batter.prepare(1); batter.update(0);
    batter.swing('COVER_LONG_OFF', 0, .52, .54, GAME.contactZ, true);
    expect(batter.inspect().squaring).toBe(false);
  });
  it('lunges across and down the wicket, dropping onto the front foot', () => {
    const batter = new Batter(); batter.prepare(1); batter.update(0);
    play(batter, 'square', .44);
    batter.update(SQUARE_DRIVE_CONTACT_MS);
    const square = batter.inspect();
    const cover = new Batter(); cover.prepare(1); cover.update(0);
    play(cover, 'cover', .10);
    cover.update(STROKE_CONTACT_MS);
    const drive = cover.inspect();
    // Across AND further: the reference recordings show a deep lunge that takes
    // the weight, not a short step to the side.
    expect(square.frontFoot[0]).toBeGreaterThan(drive.frontFoot[0]);
    expect(square.frontFoot[2]).toBeGreaterThan(drive.frontFoot[2]);
    // And he drops into it — the hips sink well below the cover drive's.
    expect(square.hip[1]).toBeLessThan(drive.hip[1] - .08);
  });
  it('extends flat and square before it turns over into the high finish', () => {
    const batter = new Batter(); batter.prepare(1); batter.update(0);
    play(batter, 'square', .44);
    batter.update(SQUARE_DRIVE_CONTACT_MS); const contact = batter.inspect();
    batter.update(240); const through = batter.inspect();
    batter.update(430); const finish = batter.inspect();
    // The extension runs out square with the hands still low: that flat phase
    // is the whole difference between this and a cover drive played wide.
    expect(through.grip[0]).toBeGreaterThan(contact.grip[0] + .15);
    expect(through.grip[1] - contact.grip[1]).toBeLessThan(.30);
    // Then it turns over: hands high and carried across to the FRONT shoulder
    // — the left one, for a right-hander — with the blade wrapped above them,
    // and the body opened up well past where the cover drive stops. It used to
    // finish over the back shoulder, which is the one it came down from.
    expect(finish.grip[1]).toBeGreaterThan(1.25);
    const chest = new Vector3(...finish.chest);
    const toFront = new Vector3(...finish.shoulders[0]).sub(chest).normalize();
    const toBack = new Vector3(...finish.shoulders[1]).sub(chest).normalize();
    const hands = new Vector3(...finish.grip).sub(chest);
    expect(hands.dot(toFront), 'hands finish over the front shoulder').toBeGreaterThan(hands.dot(toBack) + .15);
    expect(finish.bladeTip[1]).toBeGreaterThan(finish.grip[1] + .4);
    expect(finish.yaw).toBeLessThan(contact.yaw - .9);
  });
  it('keeps both hands in front of the shoulders through the wrap', () => {
    const batter = new Batter(); batter.prepare(1); batter.update(0);
    play(batter, 'square', .44);
    for (let time = 0; time <= STROKE_DURATION_MS; time += 8) {
      batter.update(time);
      const pose = batter.inspect();
      for (let i = 0; i < 2; i++) {
        const hand = new Vector3(...pose.hands[i]).sub(batter.root.position);
        const shoulder = new Vector3(...pose.shoulders[i]);
        const chest = new Vector3(...pose.chest);
        // Behind the shoulder line is where a one-handed swing ends up, and
        // this stroke is held with two.
        expect(hand.clone().sub(chest).dot(shoulder.clone().sub(chest)) > -.05, `hand ${i} @${time}`).toBe(true);
      }
    }
  });
});

/**
 * The advance charge, rebuilt from the two recordings: the skip, the stride,
 * the bat to the sky, the lofted drive on the move, the wrap over the front
 * shoulder, and the walk back. The shared checks above already hold it to the
 * same grip, reach and clearances as everything else; this is the shape.
 */
describe('the charge', () => {
  /** A foot's position on the ground he is actually covering. */
  const world = (batter: Batter, foot: 'frontFoot' | 'backFoot') => {
    const pose = batter.inspect();
    return pose[foot][2] + GAME.stanceZ + pose.downPitch;
  };
  it('skips, strides, and meets the ball a stride and a half down the pitch', () => {
    for (const x of PLAYS.charge.reach) {
      const batter = charge(x);
      expect(batter.inspect().downPitch).toBeCloseTo(0, 6);
      const stance = { front: world(batter, 'frontFoot'), back: world(batter, 'backFoot') };
      // The skip: the back foot comes up to the front one and the front foot
      // has not gone anywhere yet.
      batter.update(110);
      expect(world(batter, 'backFoot') - stance.back, `x=${x} skip`).toBeGreaterThan(.30);
      expect(Math.abs(world(batter, 'frontFoot') - stance.front), `x=${x} front foot during the skip`).toBeLessThan(.06);
      // The stride: the front foot lands well past the crease.
      batter.update(CHARGE_CLOCK.plant);
      expect(world(batter, 'frontFoot') - GAME.creaseZ, `x=${x} stride`).toBeGreaterThan(.65);
      // Contact, out of his ground, on the intercept the game hands him.
      batter.update(CHARGE_CONTACT_MS);
      const contact = batter.inspect();
      expect(contact.charging).toBe(true);
      expect(contact.downPitch).toBeGreaterThan(.30);
      expect(contact.bladeContact[0]).toBeCloseTo(x, 6);
      expect(contact.bladeContact[1]).toBeCloseTo(.54, 6);
      expect(contact.bladeContact[2]).toBeCloseTo(GAME.contactZ + CHARGE_MEETS_AT, 6);
      // Met on the full, level with the front pad rather than beside it.
      expect(contact.bladeContact[2] - world(batter, 'frontFoot'), `x=${x} met in front`).toBeGreaterThan(-.05);
      // Low in the lunge, head over it.
      expect(contact.hip[1]).toBeLessThan(.80);
      expect(contact.chest[2]).toBeGreaterThan(contact.hip[2] + .08);
    }
  });
  it('plants the front foot and leaves it planted while he runs on over it', () => {
    for (const x of PLAYS.charge.reach) {
      const batter = charge(x);
      batter.update(CHARGE_CLOCK.plant); const planted = world(batter, 'frontFoot');
      let drift = { by: 0, at: 0 };
      for (let time = CHARGE_CLOCK.plant; time <= CHARGE_CLOCK.finish; time += 4) {
        batter.update(time);
        const slide = Math.abs(world(batter, 'frontFoot') - planted);
        if (slide > drift.by) drift = { by: slide, at: time };
      }
      // Authored on the ground he covers, so the root running on does not drag
      // the foot with it. Six centimetres is the cubic's overshoot at a key.
      expect(drift.by, `x=${x} front foot slid ${JSON.stringify(drift)}`).toBeLessThan(.06);
      // And the body genuinely runs on over it: by the finish the hips are past
      // the foot, and the back foot has come through in front of it.
      batter.update(CHARGE_CLOCK.finish);
      const finish = batter.inspect();
      expect(finish.hip[2] + GAME.stanceZ + finish.downPitch).toBeGreaterThan(planted);
      expect(world(batter, 'backFoot')).toBeGreaterThan(world(batter, 'frontFoot') + .2);
    }
  });
  it('lifts the bat to the sky over the back shoulder before it comes down', () => {
    const batter = charge();
    batter.update(CHARGE_CLOCK.plant);
    const top = batter.inspect();
    // Toe up, and high: the tip is above the helmet and the handle points down.
    expect(top.batUp[1]).toBeLessThan(-.85);
    expect(top.bladeTip[1]).toBeGreaterThan(1.75);
    // Behind him, over the back shoulder, not out in front.
    expect(top.bladeTip[2] - batter.root.position.z).toBeLessThan(top.grip[2]);
  });
  it('drives through the line and climbs over the front shoulder in one arc', () => {
    for (const x of PLAYS.charge.reach) {
      const batter = charge(x);
      batter.update(400); const through = batter.inspect();
      // Extension: blade up the ground, hands a full arm in front of the chest.
      expect(through.batUp[2]).toBeLessThan(-.6);
      expect(through.grip[2] - through.chest[2]).toBeGreaterThan(.45);
      // One arc from the ball to the top: the toe never sags on the way.
      let peak = -Infinity, sag = { drop: 0, at: 0 };
      for (let time = CHARGE_CONTACT_MS; time <= CHARGE_CLOCK.over; time += 4) {
        batter.update(time);
        const tip = batter.inspect().bladeTip[1];
        if (peak - tip > sag.drop) sag = { drop: peak - tip, at: time };
        peak = Math.max(peak, tip);
      }
      expect(sag.drop, `x=${x} toe sagging ${JSON.stringify(sag)}`).toBeLessThan(.08);
      expect(peak, `x=${x} top of the arc`).toBeGreaterThan(2.2);
      // The shoulders turn through it: side-on at the ball, square to the
      // bowler by the finish.
      batter.update(CHARGE_CONTACT_MS); const at = batter.inspect().yaw;
      batter.update(CHARGE_CLOCK.finish); expect(at - batter.inspect().yaw).toBeGreaterThan(.9);
    }
  });
  it('finishes wrapped over the front shoulder, toe down behind his back', () => {
    for (const x of PLAYS.charge.reach) {
      const batter = charge(x);
      batter.update(CHARGE_CLOCK.finish);
      const finish = batter.inspect();
      const root = batter.root.position;
      // Hands high and out beside the front (left) shoulder, in front of it.
      expect(finish.grip[1], `x=${x}`).toBeGreaterThan(1.5);
      expect(finish.grip[0] - finish.chest[0], `x=${x}`).toBeLessThan(-.2);
      for (const forward of finish.handsForward) expect(forward, `x=${x}`).toBeGreaterThan(0);
      // The blade behind him and hanging down: the toe is below the hands, and
      // behind the chest.
      expect(finish.bladeTip[1], `x=${x}`).toBeLessThan(finish.grip[1] - .45);
      expect(finish.bladeTip[2] - root.z, `x=${x}`).toBeLessThan(finish.chest[2] - .15);
      // Square to the bowler, and standing up out of the lunge.
      expect(finish.yaw, `x=${x}`).toBeLessThan(.3);
      expect(finish.hip[1], `x=${x}`).toBeGreaterThan(.84);
    }
  });
  it('never passes the bat through him, coming down, wrapping, or coming home', () => {
    // The same check the shared suite makes of every stroke, at every frame of
    // the charge's longer life, at 4 ms — the wrap goes over a shoulder and the
    // old finish went through the trunk, and a 20 ms sample missed it.
    const deepest = (a: Vector3, b: Vector3, centre: Vector3, radii: Vector3, turn: Quaternion) => {
      const inverse = turn.clone().invert();
      let worst = Infinity;
      for (let i = 0; i <= 40; i++) {
        const point = a.clone().lerp(b, i / 40).sub(centre).applyQuaternion(inverse);
        worst = Math.min(worst, Math.hypot(point.x / radii.x, point.y / radii.y, point.z / radii.z));
      }
      return worst;
    };
    for (const x of PLAYS.charge.reach) {
      const batter = charge(x);
      let worst = { value: Infinity, part: '', at: 0 };
      for (let time = 0; time <= STROKE_DURATION_MS + ADVANCE.walkBackMs; time += 4) {
        batter.update(time);
        const pose = batter.inspect();
        const chest = new Vector3(...pose.chest), hip = new Vector3(...pose.hip);
        const spine = chest.clone().sub(hip).normalize();
        const yaw = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), pose.yaw);
        const torso = new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), spine).multiply(yaw);
        const head = chest.clone().addScaledVector(spine, .31).add(new Vector3(.01, .01, .025));
        const grip = new Vector3(...pose.grip), tip = new Vector3(...pose.bladeTip).sub(batter.root.position);
        const knob = batter.bat.localToWorld(new Vector3(0, .245, 0)).sub(batter.root.position);
        const parts: [string, Vector3, Vector3, Quaternion][] = [
          ['trunk', chest.clone().addScaledVector(spine, -.075), new Vector3(.205, .275, .145), torso],
          ['hips', hip, new Vector3(.185, .145, .135), yaw],
          ['helmet', head, new Vector3(.188, .19, .195), torso],
        ];
        for (const [part, centre, radii, turn] of parts) {
          const value = Math.min(deepest(grip, tip, centre, radii, turn), deepest(grip, knob, centre, radii, turn));
          if (value < worst.value) worst = { value, part, at: time };
        }
      }
      expect(worst.value, `x=${x} reaches ${worst.value.toFixed(2)} into the ${worst.part} at ${worst.at}ms`).toBeGreaterThan(1);
    }
  });
  it('keeps both elbows off the trunk all the way down the pitch and back', () => {
    for (const x of PLAYS.charge.reach) {
      const batter = charge(x);
      let worst = { clearance: Infinity, at: 0 };
      for (let time = 0; time <= STROKE_DURATION_MS + ADVANCE.walkBackMs; time += 4) {
        batter.update(time);
        const pose = batter.inspect();
        const chest = new Vector3(...pose.chest), hip = new Vector3(...pose.hip);
        const spine = chest.clone().sub(hip).normalize(), length = chest.distanceTo(hip);
        for (const point of pose.elbows) {
          const elbow = new Vector3(...point);
          const along = Math.min(length, Math.max(0, elbow.clone().sub(hip).dot(spine)));
          const clearance = elbow.distanceTo(hip.clone().addScaledVector(spine, along));
          if (clearance < worst.clearance) worst = { clearance, at: time };
        }
      }
      expect(worst.clearance, `x=${x} ${JSON.stringify(worst)}`).toBeGreaterThan(.15);
    }
  });
  it('is one stroke on one line whatever the ball was doing', () => {
    // A chargeable ball is on the stumps; the reach is the straight drive's.
    const middle = charge(0), leg = charge(-.17);
    // The body follows the ball sideways by the drives' fraction of its line,
    // and the blade meets it on the line itself; by the guard the shift is gone.
    for (const time of [CHARGE_CLOCK.skip, CHARGE_CLOCK.plant, CHARGE_CONTACT_MS, 400, CHARGE_CLOCK.finish, 800]) {
      middle.update(time); leg.update(time);
      expect(leg.inspect().grip[0] - middle.inspect().grip[0], `at ${time}ms`).toBeCloseTo(-.17 * (time === CHARGE_CONTACT_MS ? 1 : .65), 1);
    }
    middle.update(940); leg.update(940);
    expect(leg.inspect().grip).toEqual(middle.inspect().grip);
  });
  it('runs down the pitch, stops at the finish, and walks back', () => {
    const batter = charge();
    let furthest = 0;
    for (let time = 0; time <= STROKE_DURATION_MS; time += 20) {
      batter.update(time);
      const down = batter.inspect().downPitch;
      // Forwards only, until he turns for home.
      expect(down).toBeGreaterThanOrEqual(furthest - 1e-9);
      furthest = Math.max(furthest, down);
    }
    expect(furthest).toBeCloseTo(ADVANCE.stride, 6);
    // Most of it is covered by the finish; the rest is momentum dying.
    batter.update(CHARGE_CLOCK.finish); expect(batter.inspect().downPitch).toBeGreaterThan(ADVANCE.stride * .85);
    // And he is back in his crease before the next ball.
    batter.update(STROKE_DURATION_MS + ADVANCE.walkBackMs);
    expect(batter.inspect().downPitch).toBeCloseTo(0, 6);
    batter.reset();
    expect(batter.inspect().downPitch).toBeCloseTo(0, 6);
  });
  it('walks back to the crease and stops there', () => {
    const batter = charge();
    // Well past the end of the walk: `ease` is a cubic, and fed a number past 1
    // it turns and runs away — which sent him back down the pitch at the bowler,
    // faster and faster, long after he had reached his crease.
    for (let time = 0; time <= 20000; time += 40) {
      batter.update(time);
      const down = batter.inspect().downPitch;
      expect(down, `${time}ms`).toBeGreaterThanOrEqual(0);
      expect(down, `${time}ms`).toBeLessThanOrEqual(ADVANCE.stride + 1e-9);
    }
    batter.update(STROKE_DURATION_MS + ADVANCE.walkBackMs + 4000);
    expect(batter.inspect().downPitch).toBe(0);
  });

  it('walks on its feet rather than sliding on them', () => {
    const batter = charge();
    const feet = () => {
      const pose = batter.inspect();
      return [pose.frontFoot, pose.backFoot].map(foot => foot[2] + GAME.stanceZ + pose.downPitch);
    };
    batter.update(STROKE_DURATION_MS);
    let previous = feet(), planted = 0, frames = 0;
    for (let time = STROKE_DURATION_MS + 8; time <= STROKE_DURATION_MS + ADVANCE.walkBackMs; time += 8) {
      batter.update(time);
      const now = feet();
      const moved = now.map((z, i) => Math.abs(z - previous[i]));
      // One foot is always down and still while the other swings. Translating
      // the whole batter instead leaves both feet frozen to him, skating.
      // A swinging foot covers three times this; the bar only has to be under
      // the distance the body itself travels in a frame at full walking pace.
      expect(Math.min(...moved), `both feet moving at ${time}ms`).toBeLessThan(.02);
      if (Math.min(...moved) < .0005) planted++;
      frames++; previous = now;
    }
    // And a foot is dead still for most of the walk, not just at each end. The
    // rest is the frames where the feet swap and the last stride, where the
    // step eases out into the waiting stance.
    expect(planted / frames).toBeGreaterThan(.6);
  });

  it('never outreaches an arm or a leg on the way', () => {
    for (const x of PLAYS.charge.reach) {
      const batter = charge(x);
      for (let time = 0; time <= STROKE_DURATION_MS + ADVANCE.walkBackMs + 600; time += 12) {
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
        expect(new Vector3(...pose.hands[0]).distanceTo(new Vector3(...pose.hands[1]))).toBeCloseTo(HAND_SPACING, 6);
      }
    }
  });
});

/**
 * The charge over cover: the same walk at the ball as the straight charge and
 * a different shot from the ball onwards, from the second pair of recordings.
 * The shared checks hold it to the same grip, reach and clearances; this is
 * the shape — and that the approach really is shared.
 */
describe('the charge over cover', () => {
  const coverCharge = (x = 0) => {
    const batter = new Batter(); batter.reset(); batter.prepare(1); batter.update(0);
    play(batter, 'coverCharge', x);
    return batter;
  };
  it('walks at the ball the way the straight charge does, and meets it in the same place', () => {
    for (const x of PLAYS.coverCharge.reach) {
      const straight = charge(x), cover = coverCharge(x);
      // The skip and the top of the backlift are the same keys; only the front
      // foot lands a little further to the off side from the plant onwards.
      for (const time of [40, CHARGE_CLOCK.skip, CHARGE_CLOCK.plant]) {
        straight.update(time); cover.update(time);
        expect(cover.inspect().downPitch, `x=${x} @${time}`).toBeCloseTo(straight.inspect().downPitch, 9);
        expect(cover.inspect().backFoot, `x=${x} @${time}`).toEqual(straight.inspect().backFoot);
        expect(cover.inspect().grip, `x=${x} @${time}`).toEqual(straight.inspect().grip);
      }
      cover.update(CHARGE_CONTACT_MS);
      const contact = cover.inspect();
      expect(contact.charging).toBe(true);
      expect(contact.bladeContact[0]).toBeCloseTo(x, 6);
      expect(contact.bladeContact[1]).toBeCloseTo(.54, 6);
      expect(contact.bladeContact[2]).toBeCloseTo(GAME.contactZ + CHARGE_MEETS_AT, 6);
      // Face opened to cover, body still closed: inside out.
      expect(contact.batFace[0], `x=${x} face`).toBeGreaterThan(.3);
      straight.update(CHARGE_CONTACT_MS);
      expect(contact.yaw, `x=${x} closed`).toBeGreaterThan(straight.inspect().yaw + .1);
    }
  });
  it('extends out towards extra cover and finishes high, not wrapped', () => {
    for (const x of PLAYS.coverCharge.reach) {
      const batter = coverCharge(x);
      batter.update(CHARGE_CLOCK.through);
      const through = batter.inspect();
      // The hands go out to the off side of the chest, a full reach away.
      expect(through.grip[0] - through.chest[0], `x=${x} out`).toBeGreaterThan(.3);
      expect(through.grip[2] - through.chest[2], `x=${x} forward`).toBeGreaterThan(.3);
      batter.update(580);
      const finish = batter.inspect();
      const root = batter.root.position;
      // Hands together above the helmet, the bat pointing to the sky over the
      // off shoulder: the toe is above the hands and off side of them, and
      // nothing is behind him.
      expect(finish.grip[1], `x=${x}`).toBeGreaterThan(1.75);
      expect(finish.bladeTip[1], `x=${x}`).toBeGreaterThan(finish.grip[1] + .4);
      expect(finish.bladeTip[0] - root.x, `x=${x}`).toBeGreaterThan(finish.grip[0] + .3);
      expect(finish.bladeTip[2] - root.z, `x=${x}`).toBeGreaterThan(finish.chest[2]);
      for (const forward of finish.handsForward) expect(forward, `x=${x}`).toBeGreaterThan(0);
      // Still closer to side-on than the straight charge's square finish.
      expect(finish.yaw, `x=${x}`).toBeGreaterThan(.4);
    }
  });
  it('never passes the bat through him, and keeps the elbows off the trunk', () => {
    const deepest = (a: Vector3, b: Vector3, centre: Vector3, radii: Vector3, turn: Quaternion) => {
      const inverse = turn.clone().invert();
      let worst = Infinity;
      for (let i = 0; i <= 40; i++) {
        const point = a.clone().lerp(b, i / 40).sub(centre).applyQuaternion(inverse);
        worst = Math.min(worst, Math.hypot(point.x / radii.x, point.y / radii.y, point.z / radii.z));
      }
      return worst;
    };
    for (const x of PLAYS.coverCharge.reach) {
      const batter = coverCharge(x);
      let worst = { value: Infinity, part: '', at: 0 }, elbow = { clearance: Infinity, at: 0 };
      for (let time = 0; time <= STROKE_DURATION_MS + ADVANCE.walkBackMs; time += 4) {
        batter.update(time);
        const pose = batter.inspect();
        const chest = new Vector3(...pose.chest), hip = new Vector3(...pose.hip);
        const spine = chest.clone().sub(hip).normalize(), length = chest.distanceTo(hip);
        const yaw = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), pose.yaw);
        const torso = new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), spine).multiply(yaw);
        const head = chest.clone().addScaledVector(spine, .31).add(new Vector3(.01, .01, .025));
        const grip = new Vector3(...pose.grip), tip = new Vector3(...pose.bladeTip).sub(batter.root.position);
        const knob = batter.bat.localToWorld(new Vector3(0, .245, 0)).sub(batter.root.position);
        const parts: [string, Vector3, Vector3, Quaternion][] = [
          ['trunk', chest.clone().addScaledVector(spine, -.075), new Vector3(.205, .275, .145), torso],
          ['hips', hip, new Vector3(.185, .145, .135), yaw],
          ['helmet', head, new Vector3(.188, .19, .195), torso],
        ];
        for (const [part, centre, radii, turn] of parts) {
          const value = Math.min(deepest(grip, tip, centre, radii, turn), deepest(grip, knob, centre, radii, turn));
          if (value < worst.value) worst = { value, part, at: time };
        }
        for (const point of pose.elbows) {
          const e = new Vector3(...point);
          const along = Math.min(length, Math.max(0, e.clone().sub(hip).dot(spine)));
          const clearance = e.distanceTo(hip.clone().addScaledVector(spine, along));
          if (clearance < elbow.clearance) elbow = { clearance, at: time };
        }
      }
      // The knob points down at him from a bat held up to the sky, which is
      // why the way down from the finish goes out in front of the face.
      expect(worst.value, `x=${x} reaches ${worst.value.toFixed(2)} into the ${worst.part} at ${worst.at}ms`).toBeGreaterThan(1);
      expect(elbow.clearance, `x=${x} ${JSON.stringify(elbow)}`).toBeGreaterThan(.15);
    }
  });
  it('runs down the pitch and walks back like the straight charge', () => {
    const batter = coverCharge();
    let furthest = 0;
    for (let time = 0; time <= STROKE_DURATION_MS; time += 20) {
      batter.update(time);
      const down = batter.inspect().downPitch;
      expect(down).toBeGreaterThanOrEqual(furthest - 1e-9);
      furthest = Math.max(furthest, down);
    }
    expect(furthest).toBeCloseTo(ADVANCE.stride, 6);
    batter.update(STROKE_DURATION_MS + ADVANCE.walkBackMs);
    expect(batter.inspect().downPitch).toBeCloseTo(0, 6);
    for (let time = 0; time <= STROKE_DURATION_MS + ADVANCE.walkBackMs + 600; time += 12) {
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
    }
  });
});

/** The charge over long-on: the cover shot's mirror, from the third recording. */
describe('the charge over long-on', () => {
  const onCharge = (x = 0) => {
    const batter = new Batter(); batter.reset(); batter.prepare(1); batter.update(0);
    play(batter, 'onCharge', x);
    return batter;
  };
  it('walks at the ball the way the straight charge does, with the face closed to mid-on', () => {
    for (const x of PLAYS.onCharge.reach) {
      const straight = charge(x), on = onCharge(x);
      for (const time of [40, CHARGE_CLOCK.skip, CHARGE_CLOCK.plant]) {
        straight.update(time); on.update(time);
        expect(on.inspect().downPitch, `x=${x} @${time}`).toBeCloseTo(straight.inspect().downPitch, 9);
        expect(on.inspect().backFoot, `x=${x} @${time}`).toEqual(straight.inspect().backFoot);
        expect(on.inspect().grip, `x=${x} @${time}`).toEqual(straight.inspect().grip);
      }
      on.update(CHARGE_CONTACT_MS);
      const contact = on.inspect();
      expect(contact.charging).toBe(true);
      expect(contact.bladeContact[0]).toBeCloseTo(x, 6);
      expect(contact.bladeContact[1]).toBeCloseTo(.54, 6);
      expect(contact.bladeContact[2]).toBeCloseTo(GAME.contactZ + CHARGE_MEETS_AT, 6);
      expect(contact.batFace[0], `x=${x} face`).toBeLessThan(-.2);
      straight.update(CHARGE_CONTACT_MS);
      // Already turning towards the leg side at the ball.
      expect(contact.yaw, `x=${x} open`).toBeLessThan(straight.inspect().yaw - .05);
    }
  });
  it('extends out towards long-on and wraps over the front shoulder, facing mid-on', () => {
    for (const x of PLAYS.onCharge.reach) {
      const on = onCharge(x), straight = charge(x);
      on.update(CHARGE_CLOCK.through); straight.update(CHARGE_CLOCK.through);
      // The hands go out to the leg side of where the straight charge's go.
      expect(on.inspect().grip[0], `x=${x} out`).toBeLessThan(straight.inspect().grip[0] - .2);
      expect(on.inspect().grip[2] - on.inspect().chest[2], `x=${x} forward`).toBeGreaterThan(.3);
      on.update(CHARGE_CLOCK.finish);
      const finish = on.inspect();
      const root = on.root.position;
      // A wrap over the front (left) shoulder, shallower than the straight
      // charge's: hands high and wide beside it, in front of it, the toe
      // behind him at chest height rather than hanging down behind the back.
      expect(finish.grip[1], `x=${x}`).toBeGreaterThan(1.5);
      expect(finish.grip[0] - finish.chest[0], `x=${x}`).toBeLessThan(-.2);
      for (const forward of finish.handsForward) expect(forward, `x=${x}`).toBeGreaterThan(0);
      expect(finish.bladeTip[1], `x=${x}`).toBeLessThan(finish.grip[1] - .10);
      expect(finish.bladeTip[1], `x=${x}`).toBeGreaterThan(finish.grip[1] - .40);
      expect(finish.bladeTip[2] - root.z, `x=${x}`).toBeLessThan(finish.chest[2] - .4);
      // And it never comes near vertical on the way: the bat turns much less
      // than the straight charge's on this stroke.
      let steepest = 0;
      for (let time = CHARGE_CLOCK.carry; time <= CHARGE_CLOCK.finish; time += 4) { on.update(time); steepest = Math.max(steepest, -on.inspect().batUp[1]); }
      expect(steepest, `x=${x} toe pointing straight up`).toBeLessThan(.6);
      // Facing mid-on: a shade less square to the bowler than the straight
      // charge's finish. Only a shade — turned any further, the front elbow
      // outran the shared speed limit on the way out of the wrap.
      straight.update(CHARGE_CLOCK.finish);
      expect(finish.yaw, `x=${x}`).toBeGreaterThan(straight.inspect().yaw + .04);
    }
  });
  it('never passes the bat through him, and keeps the elbows off the trunk', () => {
    const deepest = (a: Vector3, b: Vector3, centre: Vector3, radii: Vector3, turn: Quaternion) => {
      const inverse = turn.clone().invert();
      let worst = Infinity;
      for (let i = 0; i <= 40; i++) {
        const point = a.clone().lerp(b, i / 40).sub(centre).applyQuaternion(inverse);
        worst = Math.min(worst, Math.hypot(point.x / radii.x, point.y / radii.y, point.z / radii.z));
      }
      return worst;
    };
    for (const x of PLAYS.onCharge.reach) {
      const batter = onCharge(x);
      let worst = { value: Infinity, part: '', at: 0 }, elbow = { clearance: Infinity, at: 0 };
      for (let time = 0; time <= STROKE_DURATION_MS + ADVANCE.walkBackMs; time += 4) {
        batter.update(time);
        const pose = batter.inspect();
        const chest = new Vector3(...pose.chest), hip = new Vector3(...pose.hip);
        const spine = chest.clone().sub(hip).normalize(), length = chest.distanceTo(hip);
        const yaw = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), pose.yaw);
        const torso = new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), spine).multiply(yaw);
        const head = chest.clone().addScaledVector(spine, .31).add(new Vector3(.01, .01, .025));
        const grip = new Vector3(...pose.grip), tip = new Vector3(...pose.bladeTip).sub(batter.root.position);
        const knob = batter.bat.localToWorld(new Vector3(0, .245, 0)).sub(batter.root.position);
        const parts: [string, Vector3, Vector3, Quaternion][] = [
          ['trunk', chest.clone().addScaledVector(spine, -.075), new Vector3(.205, .275, .145), torso],
          ['hips', hip, new Vector3(.185, .145, .135), yaw],
          ['helmet', head, new Vector3(.188, .19, .195), torso],
        ];
        for (const [part, centre, radii, turn] of parts) {
          const value = Math.min(deepest(grip, tip, centre, radii, turn), deepest(grip, knob, centre, radii, turn));
          if (value < worst.value) worst = { value, part, at: time };
        }
        for (const point of pose.elbows) {
          const e = new Vector3(...point);
          const along = Math.min(length, Math.max(0, e.clone().sub(hip).dot(spine)));
          const clearance = e.distanceTo(hip.clone().addScaledVector(spine, along));
          if (clearance < elbow.clearance) elbow = { clearance, at: time };
        }
      }
      expect(worst.value, `x=${x} reaches ${worst.value.toFixed(2)} into the ${worst.part} at ${worst.at}ms`).toBeGreaterThan(1);
      expect(elbow.clearance, `x=${x} ${JSON.stringify(elbow)}`).toBeGreaterThan(.15);
    }
  });
  it.each([['straight', charge], ['long-on', onCharge]])('the %s charge comes home back over the top, on the arc it went over on', (_, make) => {
    for (const x of PLAYS.onCharge.reach) {
      const batter = make(x);
      // Up out of the wrap the way it went in: by the unwrap key the toe is
      // back up above the hands and behind him, as it was over the top on
      // the way in; by the across key it is up and in front of him, and the
      // hands have come down towards the chest.
      batter.update(CHARGE_CLOCK.unwrap);
      let pose = batter.inspect();
      expect(pose.bladeTip[1], `x=${x} unwrap toe up`).toBeGreaterThan(pose.grip[1] + .25);
      expect(pose.bladeTip[2] - batter.root.position.z, `x=${x} unwrap toe behind`).toBeLessThan(pose.grip[2]);
      batter.update(CHARGE_CLOCK.across);
      pose = batter.inspect();
      expect(pose.bladeTip[1], `x=${x} across toe up`).toBeGreaterThan(pose.grip[1] + .35);
      expect(pose.bladeTip[2] - batter.root.position.z, `x=${x} across toe in front`).toBeGreaterThan(pose.grip[2] + .3);
      expect(pose.grip[1], `x=${x} across hands down`).toBeLessThan(1.45);
      // And it never hangs the blade down beside the hip on the way, which
      // was the first route home and the one that slid down the shoulder: the
      // toe stays above the waist all the way, where the hang had it at the
      // knee. (The straight charge's wrap itself hangs the toe down behind
      // the back, at the hip — that is the finish, not the way home.)
      for (let time = CHARGE_CLOCK.hold; time <= CHARGE_CLOCK.recover; time += 4) {
        batter.update(time);
        expect(batter.inspect().bladeTip[1], `x=${x} toe dropped at ${time}ms`).toBeGreaterThan(.8);
      }
    }
  });
  it('runs down the pitch and walks back like the straight charge', () => {
    const batter = onCharge();
    let furthest = 0;
    for (let time = 0; time <= STROKE_DURATION_MS; time += 20) {
      batter.update(time);
      const down = batter.inspect().downPitch;
      expect(down).toBeGreaterThanOrEqual(furthest - 1e-9);
      furthest = Math.max(furthest, down);
    }
    expect(furthest).toBeCloseTo(ADVANCE.stride, 6);
    batter.update(STROKE_DURATION_MS + ADVANCE.walkBackMs);
    expect(batter.inspect().downPitch).toBeCloseTo(0, 6);
    for (let time = 0; time <= STROKE_DURATION_MS + ADVANCE.walkBackMs + 600; time += 12) {
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
    }
  });
});

/**
 * The on drive's six, from a broadcast recording: the on drive's own contact,
 * then a lofted follow-through of its own. The on drive along the ground is
 * what every other timing plays, and it is untouched.
 */
describe('the lofted on drive', () => {
  const played = (lofted: boolean, x = -.2) => {
    const batter = new Batter(); batter.reset(); batter.prepare(1); batter.update(0);
    batter.swing('LONG_ON', 0, x, .54, GAME.contactZ, false, lofted);
    return batter;
  };
  it('shares the on drive\'s ball and contact, and only then goes up', () => {
    for (const x of PLAYS.onLofted.reach) {
      const four = played(false, x), six = played(true, x);
      four.update(STROKE_CONTACT_MS); six.update(STROKE_CONTACT_MS);
      for (const part of ['grip', 'batUp', 'frontFoot'] as const)
        for (let axis = 0; axis < 3; axis++) expect(six.inspect()[part][axis], `x=${x} ${part}`).toBeCloseTo(four.inspect()[part][axis], 9);
      expect(six.inspect().bladeContact[0], `x=${x}`).toBeCloseTo(Math.max(-.55, Math.min(.08, x)), 6);
      six.update(220);
      const through = six.inspect();
      // Out towards long-on: the hands well forward of the chest and on the
      // leg side of the straight drive's line.
      expect(through.grip[2] - through.chest[2], `x=${x}`).toBeGreaterThan(.35);
      six.update(410); four.update(410);
      const finish = six.inspect(), root = six.root.position;
      // Both arms up: hands above the helmet, the toe above them and to the
      // leg side, over the front shoulder; the back foot on its toe.
      expect(finish.grip[1], `x=${x}`).toBeGreaterThan(1.75);
      expect(finish.grip[1], `x=${x}`).toBeGreaterThan(four.inspect().grip[1] + .25);
      expect(finish.bladeTip[1], `x=${x}`).toBeGreaterThan(finish.grip[1] + .4);
      expect(finish.bladeTip[0] - root.x, `x=${x}`).toBeLessThan(finish.grip[0] - .2);
      expect(finish.backFoot[1], `x=${x}`).toBeGreaterThan(.1);
      for (const forward of finish.handsForward) expect(forward, `x=${x}`).toBeGreaterThan(0);
      // The blade climbs in one arc from the ball to the finish.
      let peak = -Infinity, sag = { drop: 0, at: 0 };
      for (let time = STROKE_CONTACT_MS; time <= 410; time += 4) {
        six.update(time);
        const tip = six.inspect().bladeTip[1];
        if (peak - tip > sag.drop) sag = { drop: peak - tip, at: time };
        peak = Math.max(peak, tip);
      }
      expect(sag.drop, `x=${x} toe sagging ${JSON.stringify(sag)}`).toBeLessThan(.08);
    }
  });
  it('never passes the bat through him, coming up or coming home', () => {
    const deepest = (a: Vector3, b: Vector3, centre: Vector3, radii: Vector3, turn: Quaternion) => {
      const inverse = turn.clone().invert();
      let worst = Infinity;
      for (let i = 0; i <= 40; i++) {
        const point = a.clone().lerp(b, i / 40).sub(centre).applyQuaternion(inverse);
        worst = Math.min(worst, Math.hypot(point.x / radii.x, point.y / radii.y, point.z / radii.z));
      }
      return worst;
    };
    for (const x of PLAYS.onLofted.reach) {
      const batter = played(true, x);
      let worst = { value: Infinity, part: '', at: 0 }, elbow = { clearance: Infinity, at: 0 };
      for (let time = 0; time <= STROKE_DURATION_MS; time += 4) {
        batter.update(time);
        const pose = batter.inspect();
        const chest = new Vector3(...pose.chest), hip = new Vector3(...pose.hip);
        const spine = chest.clone().sub(hip).normalize(), length = chest.distanceTo(hip);
        const yaw = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), pose.yaw);
        const torso = new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), spine).multiply(yaw);
        const head = chest.clone().addScaledVector(spine, .31).add(new Vector3(.01, .01, .025));
        const grip = new Vector3(...pose.grip), tip = new Vector3(...pose.bladeTip).sub(batter.root.position);
        const knob = batter.bat.localToWorld(new Vector3(0, .245, 0)).sub(batter.root.position);
        const parts: [string, Vector3, Vector3, Quaternion][] = [
          ['trunk', chest.clone().addScaledVector(spine, -.075), new Vector3(.205, .275, .145), torso],
          ['hips', hip, new Vector3(.185, .145, .135), yaw],
          ['helmet', head, new Vector3(.188, .19, .195), torso],
        ];
        for (const [part, centre, radii, turn] of parts) {
          // The pick-up is the on drive's own, shared with the stroke along
          // the ground, and is held to what the shared check holds it to: the
          // blade. From the ball onwards this stroke is new, and the handle
          // is measured as well.
          const value = time < STROKE_CONTACT_MS ? deepest(grip, tip, centre, radii, turn)
            : Math.min(deepest(grip, tip, centre, radii, turn), deepest(grip, knob, centre, radii, turn));
          if (value < worst.value) worst = { value, part, at: time };
        }
        for (const point of pose.elbows) {
          const e = new Vector3(...point);
          const along = Math.min(length, Math.max(0, e.clone().sub(hip).dot(spine)));
          const clearance = e.distanceTo(hip.clone().addScaledVector(spine, along));
          if (clearance < elbow.clearance) elbow = { clearance, at: time };
        }
      }
      expect(worst.value, `x=${x} reaches ${worst.value.toFixed(2)} into the ${worst.part} at ${worst.at}ms`).toBeGreaterThan(1);
      expect(elbow.clearance, `x=${x} ${JSON.stringify(elbow)}`).toBeGreaterThan(.15);
    }
  });
});

/**
 * The scoops: the two strokes played behind the wicket, each from a broadcast
 * recording. The scoop is a ramp — down early, face to the sky, the ball
 * ridden over the keeper's shoulder — and the reverse is the sweep's kneel
 * with the bat taken out under the ball on the off side and up over the
 * head to leg, the shoulders turning with it.
 */
const deepestOf = (a: Vector3, b: Vector3, centre: Vector3, radii: Vector3, turn: Quaternion) => {
  const inverse = turn.clone().invert();
  let worst = Infinity;
  for (let i = 0; i <= 40; i++) {
    const point = a.clone().lerp(b, i / 40).sub(centre).applyQuaternion(inverse);
    worst = Math.min(worst, Math.hypot(point.x / radii.x, point.y / radii.y, point.z / radii.z));
  }
  return worst;
};
/** The bat against the trunk, hips and helmet, and the elbows against the trunk, every 4ms of a stroke. */
const throughHim = (batter: Batter) => {
  let worst = { value: Infinity, part: '', at: 0 }, elbow = { clearance: Infinity, at: 0 };
  for (let time = 0; time <= STROKE_DURATION_MS; time += 4) {
    batter.update(time);
    const pose = batter.inspect();
    const chest = new Vector3(...pose.chest), hip = new Vector3(...pose.hip);
    const spine = chest.clone().sub(hip).normalize(), length = chest.distanceTo(hip);
    const yaw = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), pose.yaw);
    const torso = new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), spine).multiply(yaw);
    const head = chest.clone().addScaledVector(spine, .31).add(new Vector3(.01, .01, .025));
    const grip = new Vector3(...pose.grip), tip = new Vector3(...pose.bladeTip).sub(batter.root.position);
    const knob = batter.bat.localToWorld(new Vector3(0, .245, 0)).sub(batter.root.position);
    const parts: [string, Vector3, Vector3, Quaternion][] = [
      ['trunk', chest.clone().addScaledVector(spine, -.075), new Vector3(.205, .275, .145), torso],
      ['hips', hip, new Vector3(.185, .145, .135), yaw],
      ['helmet', head, new Vector3(.188, .19, .195), torso],
    ];
    for (const [part, centre, radii, turn] of parts) {
      const value = Math.min(deepestOf(grip, tip, centre, radii, turn), deepestOf(grip, knob, centre, radii, turn));
      if (value < worst.value) worst = { value, part, at: time };
    }
    for (const point of pose.elbows) {
      const e = new Vector3(...point);
      const along = Math.min(length, Math.max(0, e.clone().sub(hip).dot(spine)));
      const clearance = e.distanceTo(hip.clone().addScaledVector(spine, along));
      if (clearance < elbow.clearance) elbow = { clearance, at: time };
    }
  }
  return { worst, elbow };
};
describe('the scoop', () => {
  const scoop = (x = -.07) => {
    const batter = new Batter(); batter.reset(); batter.prepare(1); batter.update(0);
    play(batter, 'scoop', x);
    return batter;
  };
  it('is already down before the ball, and ramps it off a face turned to the sky', () => {
    for (const x of PLAYS.scoop.reach) {
      const batter = scoop(x);
      // Set before the ball: the crouch and the low bat are there by the set
      // key, well before contact.
      batter.update(70);
      const set = batter.inspect();
      expect(set.hip[1], `x=${x} set`).toBeLessThan(.80);
      expect(set.grip[1], `x=${x} set hands`).toBeLessThan(.90);
      batter.update(SCOOP_CONTACT_MS);
      const contact = batter.inspect();
      expect(contact.bladeContact[0]).toBeCloseTo(x, 6);
      expect(contact.bladeContact[1]).toBeCloseTo(.54, 6);
      expect(contact.bladeContact[2]).toBeCloseTo(GAME.contactZ, 6);
      // Crouched, square to the bowler, hands at the front hip.
      expect(contact.hip[1], `x=${x} crouch`).toBeLessThan(.75);
      expect(contact.yaw, `x=${x} square`).toBeLessThan(.6);
      expect(contact.grip[1], `x=${x} hands low`).toBeLessThan(.90);
      // The toe down and forward to the off side, the face up at the bowler.
      const tip = new Vector3(...contact.bladeTip).sub(batter.root.position);
      expect(tip.y, `x=${x} toe down`).toBeLessThan(contact.grip[1] - .3);
      expect(tip.x, `x=${x} toe to off`).toBeGreaterThan(contact.grip[0] + .5);
      expect(tip.z, `x=${x} toe forward`).toBeGreaterThan(contact.grip[2] + .2);
      expect(contact.batFace[1], `x=${x} face up`).toBeGreaterThan(.75);
      expect(contact.batFace[2], `x=${x} face to the bowler`).toBeGreaterThan(0);
    }
  });
  it('lifts the bat face first, toe up in front of him and over the front shoulder, without turning it in the hands', () => {
    for (const x of PLAYS.scoop.reach) {
      const batter = scoop(x);
      const root = batter.root.position;
      batter.update(SCOOP_CONTACT_MS);
      const contact = batter.inspect();
      const toe0 = new Vector3(...contact.batUp).negate();
      // A quarter of the way round the blade is level, out to the off side,
      // the face still to the sky.
      batter.update(250);
      const through = batter.inspect();
      expect(Math.abs(through.batUp[1]), `x=${x} level through`).toBeLessThan(.5);
      expect(through.batUp[0], `x=${x} toe to off`).toBeLessThan(-.7);
      expect(through.batFace[1], `x=${x} face up`).toBeGreaterThan(.8);
      // Half way the toe is up past the head in front of him, and the face
      // is where the toe was pointing at the ball: one turn, no roll.
      batter.update(360);
      const carry = batter.inspect();
      expect(carry.bladeTip[1], `x=${x} toe up`).toBeGreaterThan(carry.grip[1] + .5);
      expect(carry.bladeTip[2] - root.z, `x=${x} toe in front`).toBeGreaterThan(carry.grip[2]);
      expect(new Vector3(...carry.batFace).dot(toe0), `x=${x} face led`).toBeLessThan(-.8);
      // And at the top it curls back over the front shoulder, the back of
      // the bat to the sky, the hands high beside that shoulder.
      batter.update(470);
      const finish = batter.inspect();
      expect(finish.grip[1], `x=${x} hands high`).toBeGreaterThan(1.35);
      expect(finish.grip[0] - finish.chest[0], `x=${x} beside the front shoulder`).toBeLessThan(-.15);
      expect(finish.batUp[1], `x=${x} bat up`).toBeLessThan(-.7);
      expect(finish.bladeTip[0], `x=${x} toe over the leg shoulder`).toBeLessThan(finish.grip[0] - .25);
      expect(finish.bladeTip[2] - root.z, `x=${x} toe curled back`).toBeLessThan(finish.grip[2]);
      expect(finish.batFace[1], `x=${x} back of the bat to the sky`).toBeLessThan(-.3);
      expect(finish.hip[1], `x=${x} up a little, not standing`).toBeLessThan(.90);
      // Both hands in front of the shoulder line, never round it.
      for (const forward of finish.handsForward) expect(forward, `x=${x}`).toBeGreaterThan(0);
      // And home to the guard.
      batter.update(STROKE_DURATION_MS);
      expect(batter.inspect().grip).toEqual(new Batter().inspect().grip);
    }
  });
  it('never passes the bat through him, and keeps the elbows off the trunk', () => {
    for (const x of PLAYS.scoop.reach) {
      const { worst, elbow } = throughHim(scoop(x));
      expect(worst.value, `x=${x} reaches ${worst.value.toFixed(2)} into the ${worst.part} at ${worst.at}ms`).toBeGreaterThan(1);
      expect(elbow.clearance, `x=${x} ${JSON.stringify(elbow)}`).toBeGreaterThan(.15);
    }
  });
});
describe('the reverse scoop', () => {
  const reverse = (x = .28) => {
    const batter = new Batter(); batter.reset(); batter.prepare(1); batter.update(0);
    play(batter, 'reverse', x);
    return batter;
  };
  it('kneels, and takes the level blade out under the ball on the off side with the face up', () => {
    for (const x of PLAYS.reverse.reach) {
      const batter = reverse(x);
      let lowest = Infinity;
      for (let time = 0; time <= 600; time += 10) {
        batter.update(time);
        const pose = batter.inspect();
        lowest = Math.min(lowest, pose.knees[1][1]);
        expect(pose.knees[1][1], `x=${x} back knee @${time}ms`).toBeGreaterThan(0);
        expect(pose.knees[0][1], `x=${x} front knee @${time}ms`).toBeGreaterThan(0);
      }
      // Down on the back knee by the ball, and still there at the finish.
      expect(lowest, `x=${x} knee`).toBeLessThan(.16);
      batter.update(REVERSE_CONTACT_MS);
      const contact = batter.inspect();
      expect(contact.knees[1][1], `x=${x} knee at the ball`).toBeLessThan(.16);
      expect(contact.bladeContact[0]).toBeCloseTo(x, 6);
      expect(contact.bladeContact[1]).toBeCloseTo(.54, 6);
      expect(contact.bladeContact[2]).toBeCloseTo(GAME.contactZ, 6);
      // Level, pointing at point, face to the sky.
      expect(Math.abs(contact.batUp[1]), `x=${x} level`).toBeLessThan(.35);
      expect(contact.batUp[0], `x=${x} to the off`).toBeLessThan(-.8);
      expect(contact.batFace[1], `x=${x} face up`).toBeGreaterThan(.85);
      const tip = new Vector3(...contact.bladeTip).sub(batter.root.position);
      expect(tip.x, `x=${x} toe out to the off`).toBeGreaterThan(contact.grip[0] + .6);
      batter.update(600);
      expect(batter.inspect().knees[1][1], `x=${x} knee at the finish`).toBeLessThan(.16);
    }
  });
  it('carries the bat up over the head to leg and turns the shoulders under it, then gets up and comes home', () => {
    for (const x of PLAYS.reverse.reach) {
      const batter = reverse(x);
      // Up past the vertical on the way.
      let highest = 0;
      for (let time = REVERSE_CONTACT_MS; time <= 600; time += 4) { batter.update(time); highest = Math.max(highest, batter.inspect().bladeTip[1]); }
      expect(highest, `x=${x} over the top`).toBeGreaterThan(1.9);
      batter.update(600);
      const finish = batter.inspect();
      expect(finish.yaw, `x=${x} turned to leg`).toBeLessThan(-.8);
      expect(finish.grip[0] - finish.chest[0], `x=${x} hands on the leg side`).toBeLessThan(-.25);
      expect(finish.grip[1], `x=${x} hands high`).toBeGreaterThan(1.15);
      expect(finish.batUp[1], `x=${x} bat up`).toBeLessThan(-.6);
      for (const forward of finish.handsForward) expect(forward, `x=${x}`).toBeGreaterThan(-.06);
      batter.update(STROKE_DURATION_MS);
      expect(batter.inspect().grip).toEqual(new Batter().inspect().grip);
      expect(batter.inspect().yaw).toBeCloseTo(new Batter().inspect().yaw, 9);
    }
  });
  it('never passes the bat through him, and keeps the elbows off the trunk', () => {
    for (const x of PLAYS.reverse.reach) {
      const { worst, elbow } = throughHim(reverse(x));
      expect(worst.value, `x=${x} reaches ${worst.value.toFixed(2)} into the ${worst.part} at ${worst.at}ms`).toBeGreaterThan(1);
      expect(elbow.clearance, `x=${x} ${JSON.stringify(elbow)}`).toBeGreaterThan(.15);
    }
  });
});
