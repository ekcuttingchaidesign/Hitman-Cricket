import { describe, it, expect } from 'vitest';
import { Batter, PULL_LOAD_MS, PULL_CONTACT_MS, STROKE_DURATION_MS, CHARGE_CONTACT_MS, CHARGE_DURATION_MS } from '../src/entities/Batter';
import { ADVANCE, GAME, LINE_X, SHOTS } from '../src/config/gameplay';
import type { ShotType } from '../src/game/types';
import { Quaternion, Vector3 } from 'three';
import { bladeGeometry } from '../src/entities/batGeometry';
// Every stroke the batter can be asked to play, defence included.
const STROKES: ShotType[] = [...SHOTS, 'DEFEND'];

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
  it('continues the straight drive past the upright blade into a high finish',()=>{
    const batter=new Batter(); batter.prepare(1); batter.update(0); batter.swing('STRAIGHT',0,0);
    batter.update(220); const through=batter.inspect();
    batter.update(410); const finish=batter.inspect();
    expect(finish.bladeTip[1]-through.bladeTip[1]).toBeGreaterThan(.6);
    expect(finish.grip[1]).toBeGreaterThan(1.6);
    expect(finish.batUp[2]).toBeLessThan(-.9);
  });
  it('carries both drives through impact and extension without stopping at a pose key',()=>{
    for(const shot of ['STRAIGHT','COVER_LONG_OFF'] as const) {
      const batter=new Batter(); batter.prepare(1); batter.update(0);
      batter.swing(shot,0,shot==='STRAIGHT'?0:.30);
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
      expect(finish.elbows[0][1]-finish.shoulders[0][1]).toBeGreaterThan(.12);
      if(shot==='STRAIGHT') {
        expect(finish.batUp[2]).toBeLessThan(-.9);
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
    for (const charge of [false, true]) {
      const batter = new Batter(); batter.prepare(1); batter.update(0);
      batter.swing(charge ? 'STRAIGHT' : 'LEG', 0, 0, charge ? .54 : 1.12, GAME.contactZ, charge);
      for (const time of charge ? [CHARGE_CONTACT_MS, 560] : [PULL_CONTACT_MS, 340]) {
        const positions = [time-1, time, time+1].map(t => { batter.update(t); return new Vector3(...batter.inspect().bladeTip); });
        const before = positions[1].clone().sub(positions[0]), after = positions[2].clone().sub(positions[1]);
        expect(before.length(), `${charge} stopped at ${time}`).toBeGreaterThan(.001);
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
  it.each(['straight','cover','charge'])('uses a diagonal top-hand wrist and leading elbow for %s',kind=>{
    const batter=new Batter(); batter.prepare(1); batter.update(0);
    batter.swing(kind==='cover'?'COVER_LONG_OFF':'STRAIGHT',0,kind==='cover'?.3:0,.54,GAME.contactZ,kind==='charge');
    batter.update(kind==='charge'?CHARGE_CONTACT_MS:110);
    const p=batter.inspect(), axis=new Vector3(0,1,0).applyQuaternion(batter.bat.quaternion);
    const topHand=new Vector3(...p.hands[0]).sub(batter.root.position);
    const wrist=new Vector3(...p.wrists[0]);
    expect(wrist.clone().sub(topHand).dot(axis)).toBeGreaterThan(.015);
    expect(p.elbows[0][1]-wrist.y).toBeGreaterThan(.10);
  });
  it('does not flip an elbow or wrist between frames, including entering and leaving guard', () => {
    for (const kind of ['pull','charge','straight','cover']) for (const x of kind==='pull'?[-.55,0,.32]:kind==='cover'?[-.08,.30,.55]:[-.17,0,.17]) {
      const charge=kind==='charge';
      const batter = new Batter(); batter.prepare(1); batter.update(0);
      let previous = batter.inspect();
      batter.swing(kind==='pull'?'LEG':kind==='cover'?'COVER_LONG_OFF':'STRAIGHT',0,x,kind==='pull'?1.12:.54,GAME.contactZ,charge);
      for (let t=0;t<=(charge?CHARGE_DURATION_MS:STROKE_DURATION_MS);t+=2) {
        batter.update(t); const pose=batter.inspect();
        for (let i=0;i<2;i++) {
          const where=`${kind} x=${x} arm=${i} @${t}`;
          expect(new Vector3(...pose.elbows[i]).distanceTo(new Vector3(...previous.elbows[i])),where).toBeLessThan(.025);
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
          // Both thumb/index webs remain on the back spine. The former
          // independent fist rotations passed grasp-axis tests but failed this.
          for (const alignment of pose.vSpineAlignment) expect(alignment).toBeCloseTo(1,9);
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
  it.each(['straight','cover','charge'])('powers the %s follow-through with upper-arm travel', kind => {
    const batter=new Batter(); batter.prepare(1); batter.update(0);
    batter.swing(kind==='cover'?'COVER_LONG_OFF':'STRAIGHT',0,kind==='cover'?.3:0,.54,GAME.contactZ,kind==='charge');
    batter.update(kind==='charge'?440:110); const contact=batter.inspect();
    batter.update(kind==='charge'?810:410); const finish=batter.inspect();
    for(let i=0;i<2;i++) {
      const from=new Vector3(...contact.elbows[i]).sub(new Vector3(...contact.shoulders[i]));
      const to=new Vector3(...finish.elbows[i]).sub(new Vector3(...finish.shoulders[i]));
      expect(from.angleTo(to)).toBeGreaterThan(Math.PI/4);
    }
    expect(finish.grip[1]-contact.grip[1]).toBeGreaterThan(.5);
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
      ['the charge', () => batter.swing('STRAIGHT', 0, 0, .54, GAME.contactZ, true)],
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

describe('the charge', () => {
  it('holds a coiled gather, accelerates through contact and holds the power finish',()=>{
    const batter=new Batter(); batter.prepare(1); batter.update(0);
    batter.swing('STRAIGHT',0,0,.54,GAME.contactZ,true);
    batter.update(330); const gather=batter.inspect();
    expect(gather.yaw).toBeGreaterThan(1.4);
    expect(gather.grip[1]).toBeGreaterThan(1.1);
    batter.update(439); const before=new Vector3(...batter.inspect().bladeTip);
    batter.update(441); const after=new Vector3(...batter.inspect().bladeTip);
    expect(after.distanceTo(before)/.002).toBeGreaterThan(11);
    expect(batter.strikeAt).toBe(CHARGE_CONTACT_MS);
    batter.update(740); const finish=batter.inspect();
    batter.update(970); expect(batter.inspect().grip).toEqual(finish.grip);
  });
  it.each(['straight','cover','charge'])('presents the flat face from face-down pickup into %s contact',kind=>{
    for(const x of [-.17,0,.17]) {
      const batter=new Batter(); batter.prepare(1); batter.update(0);
      expect(batter.inspect().batFace[1]).toBeLessThan(-.4);
      const impact=kind==='charge'?CHARGE_CONTACT_MS:110;
      batter.swing(kind==='cover'?'COVER_LONG_OFF':'STRAIGHT',0,x,.54,GAME.contactZ,kind==='charge');
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
        expect(new Vector3(...pose.batFace).dot(unrolled)).toBeGreaterThan(.5);
        // Both palms retain the handle axis; wrists must never fold backwards.
        for(const axis of pose.gripAxis) expect(axis).toBeCloseTo(1,9);
        for(const cuff of pose.cuffAim) expect(cuff.flex).toBeLessThan(Math.PI/2);
      }
      expect(batter.inspect().batFace[2]).toBeGreaterThan(.8);
    }
  });
  it.each(['pull','charge','straight','cover'])('keeps the %s blade volume outside body, helmet, joints and forearms', (kind) => {
    const geometry=bladeGeometry(), positions=geometry.getAttribute('position'), index=geometry.getIndex()!;
    const samples=Array.from({length:positions.count},(_,i)=>new Vector3().fromBufferAttribute(positions,i));
    for(let i=0;i<index.count;i+=3) samples.push(
      new Vector3().add(samples[index.getX(i)]).add(samples[index.getX(i+1)]).add(samples[index.getX(i+2)]).divideScalar(3));
    geometry.dispose();
    for (const x of kind==='pull'?[-.55,0,.32]:kind==='cover'?[-.08,.30,.55]:[-.17,0,.17]) {
      const charge=kind==='charge';
      const batter = new Batter(); batter.prepare(1); batter.update(0);
      batter.swing(kind==='pull'?'LEG':kind==='cover'?'COVER_LONG_OFF':'STRAIGHT',0,x,kind==='pull'?1.12:.54,GAME.contactZ,charge);
      const spheres: import('three').Mesh[] = [];
      batter.root.traverse(object => {
        const mesh = object as import('three').Mesh;
        if (mesh.isMesh && mesh.geometry.type === 'SphereGeometry') spheres.push(mesh);
      });
      let worst = {distance: Infinity, time: 0, part: ''};
      let forearmClearance = {distance: Infinity, time: 0, arm: 0};
      const end = charge ? CHARGE_DURATION_MS : STROKE_DURATION_MS;
      for (let time = 0; time <= end; time += 4) {
        batter.update(time); batter.root.updateMatrixWorld(true);
        const pose=batter.inspect();
        for (const lengths of pose.armLengths) expect(lengths[1], `${charge} ${x} arm @${time}`).toBeLessThan(.345);
        for (const lengths of pose.legLengths) expect(lengths[1], `${charge} ${x} leg @${time}`).toBeLessThan(.445);
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
  it('finishes the drive on a braced front leg with high hands', () => {
    const batter = new Batter(); batter.swing('STRAIGHT', 0, 0, .54, GAME.contactZ, true);
    batter.update(810); const pose = batter.inspect();
    expect(pose.frontFoot[1]).toBeCloseTo(.08);
    expect(pose.frontFoot[2]).toBeGreaterThan(pose.hip[2]);
    expect(pose.grip[1]).toBeGreaterThan(1.4);
    // New supplied video ends high over the lead shoulder, blade still raised.
    expect(pose.batUp[1]).toBeLessThan(-.85);
    expect(pose.bladeTip[1]).toBeGreaterThan(pose.grip[1]+.7);
  });
  it('walks down the pitch, launches it, and walks back', () => {
    const batter = new Batter();
    batter.reset(); batter.prepare(1); batter.update(0);
    expect(batter.inspect().downPitch).toBeCloseTo(0, 6);
    batter.swing('STRAIGHT', 0, 0, .54, GAME.contactZ, true);
    // Advance before impact; the presentation ball meets him down the pitch.
    batter.update(CHARGE_CONTACT_MS);
    const contact = batter.inspect();
    expect(contact.charging).toBe(true);
    expect(contact.downPitch).toBeCloseTo(ADVANCE.stride, 6);
    expect(contact.bladeContact[2]).toBeCloseTo(GAME.contactZ + ADVANCE.stride, 6);
    expect(contact.bladeContact[1]).toBeCloseTo(.54, 6);
    let furthest = 0;
    for (let time = 0; time <= STROKE_DURATION_MS; time += 16) {
      batter.update(time);
      furthest = Math.max(furthest, batter.inspect().downPitch);
    }
    expect(furthest).toBeGreaterThan(1.5);
    // And he is back in his crease before the next ball.
    batter.update(CHARGE_DURATION_MS + ADVANCE.walkBackMs);
    expect(batter.inspect().downPitch).toBeCloseTo(0, 6);
    batter.reset();
    expect(batter.inspect().downPitch).toBeCloseTo(0, 6);
  });
  it('walks back to the crease and stops there', () => {
    const batter = new Batter();
    batter.reset(); batter.prepare(1); batter.update(0);
    batter.swing('STRAIGHT', 0, 0, .54, GAME.contactZ, true);
    // Well past the end of the walk: `ease` is a cubic, and fed a number past 1
    // it turns and runs away — which sent him back down the pitch at the bowler,
    // faster and faster, long after he had reached his crease.
    for (let time = 0; time <= 20000; time += 40) {
      batter.update(time);
      const down = batter.inspect().downPitch;
      expect(down, `${time}ms`).toBeGreaterThanOrEqual(0);
      expect(down, `${time}ms`).toBeLessThanOrEqual(ADVANCE.stride + 1e-9);
    }
    batter.update(CHARGE_DURATION_MS + ADVANCE.walkBackMs + 4000);
    expect(batter.inspect().downPitch).toBe(0);
  });

  it('walks on its feet rather than sliding on them', () => {
    const batter = new Batter();
    batter.reset(); batter.prepare(1); batter.update(0);
    batter.swing('STRAIGHT', 0, 0, .54, GAME.contactZ, true);
    const world = () => {
      const pose = batter.inspect();
      return [pose.frontFoot, pose.backFoot].map(foot => foot[2] + GAME.stanceZ + pose.downPitch);
    };
    batter.update(CHARGE_DURATION_MS);
    let previous = world(), planted = 0, frames = 0;
    for (let time = CHARGE_DURATION_MS + 8; time <= CHARGE_DURATION_MS + ADVANCE.walkBackMs; time += 8) {
      batter.update(time);
      const now = world();
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
    const batter = new Batter();
    batter.reset(); batter.prepare(1); batter.update(0);
    batter.swing('STRAIGHT', 0, 0, .54, GAME.contactZ, true);
    for (let time = 0; time <= CHARGE_DURATION_MS + ADVANCE.walkBackMs + 600; time += 12) {
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
      expect(new Vector3(...pose.hands[0]).distanceTo(new Vector3(...pose.hands[1]))).toBeCloseTo(.110, 6);
    }
  });
});
