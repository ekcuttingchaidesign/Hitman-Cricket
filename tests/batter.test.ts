import { describe, it, expect } from 'vitest';
import { Batter, COVER_V3_MEETS_AT, ON_DRIVE_MEETS_AT, ON_LOFT_HOLD, ON_LOFT_ROLL, CELEBRATION_MS, FIFTY_MS, CHARGE_CLOCK, REVERSE_CONTACT_MS, SCOOP_CONTACT_MS, CHARGE_CONTACT_MS, CHARGE_MEETS_AT, HAND_SPACING, PULL_LOAD_MS, PULL_CONTACT_MS, PULL_MEETS_AT, PULL_HEIGHT, PULL_V1_CONTACT_MS, PULL_V1_HOLD_MS, PULL_V1_LOAD_MS, DEFENCE_FRONT_MEETS_AT, DEFENCE_BACK_MEETS_AT, DEFENCE_FRONT_CONTACT_MS, DEFENCE_BACK_CONTACT_MS, DEFENCE_BACK_HEIGHT, SPIN_CUT_CONTACT_MS, SPIN_CUT_HOLD_MS, LATE_CUT_CONTACT_MS, LATE_CUT_MEETS_AT, SLOG_MEETS_AT, SLOG_CLOCK, SLOG_HOLD_MS, HOOK_CONTACT_MS, HOOK_HOLD_MS, HOOK_MEETS_AT, SQUARE_DRIVE_CONTACT_MS, STROKE_CONTACT_MS, STROKE_DURATION_MS, SWEEP_CONTACT_MS, CELEBRATION_LENGTHS, ADMIRE_MS, AFTER_BALL_MS, LOFT_V2_CLOCK, loftVersionOf, pullVersionOf, SCOOP_CLOCK, REVERSE_CLOCK, type AfterBall } from '../src/entities/Batter';
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
const PLAYS: Record<string, { shot: ShotType; ballY: number; impact: number; reach: number[]; lofted?: boolean; sweeping?: boolean; levelled?: boolean; charging?: boolean; settle: number; version?: 1 | 2 | 3; meets?: number; spinCut?: boolean }> = {
  pull: { shot: 'LEG', ballY: 1.12, impact: PULL_CONTACT_MS, reach: [-.55, 0, .32], settle: 500, meets: PULL_MEETS_AT, version: 2 },
  // Pull version one: met beside him, standing where he hit it.
  pullV1: { shot: 'LEG', ballY: 1.12, impact: PULL_V1_CONTACT_MS, reach: [-.55, 0, .32], settle: 500, version: 1 },
  // The block: forward at a ball pitched up, back at one back of a length and at a bouncer.
  defend: { shot: 'DEFEND', ballY: .54, impact: DEFENCE_FRONT_CONTACT_MS, reach: [-.30, 0, .30], settle: 220, meets: DEFENCE_FRONT_MEETS_AT },
  defendBack: { shot: 'DEFEND', ballY: .81, impact: DEFENCE_BACK_CONTACT_MS, reach: [-.30, 0, .30], settle: 240, meets: DEFENCE_BACK_MEETS_AT },
  defendBouncer: { shot: 'DEFEND', ballY: 1.13, impact: DEFENCE_BACK_CONTACT_MS, reach: [-.30, 0, .30], settle: 240, meets: DEFENCE_BACK_MEETS_AT },
  straight: { shot: 'STRAIGHT', ballY: .54, impact: STROKE_CONTACT_MS, reach: [-.17, 0, .17], settle: 410 },
  cover: { shot: 'COVER_LONG_OFF', ballY: .54, impact: STROKE_CONTACT_MS, reach: [-.08, .10, .28], settle: 410 },
  // Version three of it: the same ball, met beside the front pad.
  cover3: { shot: 'COVER_LONG_OFF', ballY: .54, impact: STROKE_CONTACT_MS, reach: [-.08, .10, .28], settle: 410, version: 3 },
  square: { shot: 'COVER_LONG_OFF', ballY: .40, impact: SQUARE_DRIVE_CONTACT_MS, reach: [.30, .44, .55], settle: 430 },
  // The six: the same ball and the same contact as the classic drive above,
  // and a different follow-through, which is the whole of the difference.
  lofted: { shot: 'STRAIGHT', ballY: .54, impact: STROKE_CONTACT_MS, reach: [-.17, 0, .17], lofted: true, settle: 410, version: 1 },
  loftedV2: { shot: 'STRAIGHT', ballY: .54, impact: STROKE_CONTACT_MS, reach: [-.17, 0, .17], lofted: true, settle: 430, version: 2 },
  // The standing cut, at the chest-high ball it answers.
  cut: { shot: 'SQUARE_CUT', ballY: .92, impact: STROKE_CONTACT_MS, reach: [.11, .40, .62], settle: 410 },
  // And off a length, crouched.
  cutLow: { shot: 'SQUARE_CUT', ballY: .55, impact: STROKE_CONTACT_MS, reach: [.11, .40, .62], settle: 410 },
  // The slog sweep: the second special stroke, off the knee at a spinner's
  // length. It runs on the shared rig and so it takes the shared checks.
  sweep: { shot: 'LEG', ballY: .48, impact: SWEEP_CONTACT_MS, reach: [-.30, 0, .26], sweeping: true, settle: 600, meets: SLOG_MEETS_AT },
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
  onLofted: { shot: 'LONG_ON', ballY: .54, impact: STROKE_CONTACT_MS, reach: [-.55, -.2, .08], lofted: true, settle: 410, meets: ON_DRIVE_MEETS_AT },
  // The on drive along the ground: the cover drive's mirror, to long-on.
  on: { shot: 'LONG_ON', ballY: .54, impact: STROKE_CONTACT_MS, reach: [-.55, -.2, .08], settle: 410, meets: ON_DRIVE_MEETS_AT },
  // The hook: the bouncer on off stump and the one wide of it, at the height
  // a bouncer arrives, round to fine leg off the back foot.
  hook: { shot: 'HOOK', ballY: 1.134, impact: HOOK_CONTACT_MS, reach: [.14, .28, .42], settle: 500, meets: HOOK_MEETS_AT },
  // The cut off the spinner, making room for a ball on any line: from one
  // down the leg side to one wide of off, at the height a spinner's arrives.
  spinCut: { shot: 'SQUARE_CUT', ballY: .54, impact: SPIN_CUT_CONTACT_MS, reach: [-.30, 0, .42], settle: 520, spinCut: true },
  // The late cut: off stump and wider, met beside the back pad, let come past him.
  lateCut: { shot: 'LATE_CUT', ballY: .56, impact: LATE_CUT_CONTACT_MS, reach: [.14, .30, .42], settle: 600, meets: LATE_CUT_MEETS_AT },
};
const play = (batter: Batter, kind: string, x = 0) => {
  const spec = PLAYS[kind];
  batter.swing(spec.shot, 0, x, spec.ballY, GAME.contactZ + (spec.charging ? CHARGE_MEETS_AT : spec.version === 3 ? COVER_V3_MEETS_AT : spec.meets ?? 0),
    spec.charging ?? false, spec.lofted ?? false, spec.sweeping ?? false, spec.levelled ?? false, spec.version ?? 2, spec.spinCut ?? false);
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
        // Met where the game meets it: a pull out in front of him.
        batter.reset(); batter.prepare(1); batter.update(0); batter.swing(shot, 0, ballX, ballY, GAME.contactZ + (shot === 'LEG' && ballY > PULL_HEIGHT ? PULL_MEETS_AT : 0));
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
      // The block meets it at the end of its stride, at its own time (`DEFENCE_FRONT_CONTACT_MS`).
      batter.reset(); batter.swing(shot, 0, ballX); batter.update(shot === 'DEFEND' ? DEFENCE_FRONT_CONTACT_MS : 110);
      const point = batter.inspect().bladeContact;
      expect(point[0]).toBeCloseTo(ballX, 6); expect(point[1]).toBeCloseTo(.54, 6); expect(point[2]).toBeCloseTo(GAME.contactZ, 6);
    }
  });
});

describe('bat travel', () => {
  it('carries the lofted straight drive past the upright blade and up over the shoulder',()=>{
    const batter=new Batter(); batter.prepare(1); batter.update(0); batter.swing('STRAIGHT',0,0,.54,GAME.contactZ,false,true,false,false,1);
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
  it('plays the second lofted straight drive seven times in ten, the same ball the same way every time', () => {
    let two = 0, n = 0;
    for (let seed = 1; seed < 200; seed++) for (let ball = 0; ball < 60; ball++) {
      n++; if (loftVersionOf(seed * 7919, ball) === 2) two++;
      expect(loftVersionOf(seed * 7919, ball)).toBe(loftVersionOf(seed * 7919, ball));
    }
    expect(two / n).toBeGreaterThan(.67); expect(two / n).toBeLessThan(.73);
  });
  it('ends the second lofted straight drive with the arms long up the line off a long stride, and holds it', () => {
    const batter = new Batter(); batter.prepare(1); batter.update(0);
    batter.swing('STRAIGHT', 0, 0, .54, GAME.contactZ, false, true, false, false, 2);
    batter.update(LOFT_V2_CLOCK.plant); const planted = batter.inspect();
    batter.update(STROKE_CONTACT_MS); const contact = batter.inspect();
    batter.update(LOFT_V2_CLOCK.finish + 20); const ended = batter.inspect();
    batter.update(LOFT_V2_CLOCK.hold - 20); const held = batter.inspect();
    // The front foot is down the line and planted before the bat arrives, and stays there.
    expect(planted.frontFoot[2]).toBeGreaterThan(.6);
    expect(contact.frontFoot).toEqual(planted.frontFoot);
    expect(ended.frontFoot).toEqual(planted.frontFoot);
    // A straight bat at the ball, under his eyes.
    expect(contact.bladeTip[1]).toBeLessThan(contact.grip[1] - .6);
    for (const pose of [ended, held]) {
      const hands = [0, 1, 2].map(i => (pose.hands[0][i] + pose.hands[1][i]) / 2);
      // The hands high and out in front of him, over the front shoulder rather than the off side of his head.
      expect(pose.grip[1]).toBeGreaterThan(pose.chest[1] + .35);
      expect(pose.grip[2]).toBeGreaterThan(pose.chest[2] + .35);
      expect(pose.grip[0]).toBeLessThan(pose.chest[0]);
      // The blade carried on up the line after the ball, toe up and ahead of the hands: no wrap.
      expect(pose.bladeTip[2]).toBeGreaterThan(hands[2] + .4);
      expect(pose.bladeTip[1]).toBeGreaterThan(hands[1]);
    }
    // Held still.
    expect(held.bladeTip.map((v, i) => Math.abs(v - ended.bladeTip[i])).every(d => d < .02)).toBe(true);
    batter.update(STROKE_DURATION_MS); const home = batter.inspect();
    // In the same guard as version one comes home to.
    const one = new Batter(); one.prepare(1); one.update(0);
    one.swing('STRAIGHT', 0, 0, .54, GAME.contactZ, false, true, false, false, 1); one.update(STROKE_DURATION_MS);
    home.grip.forEach((v, i) => expect(v).toBeCloseTo(one.inspect().grip[i], 2));
    home.frontFoot.forEach((v, i) => expect(v).toBeCloseTo(one.inspect().frontFoot[i], 2));
  });
  it('keeps the classic straight drive below the lofted one it shares a contact with',()=>{
    const played = (lofted: boolean) => {
      const batter=new Batter(); batter.prepare(1); batter.update(0);
      batter.swing('STRAIGHT',0,0,.54,GAME.contactZ,false,lofted,false,false,1);
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
      else {
        // The cover drive's checked finish, from the recording: the bat points
        // out after the ball to cover — off side and up the ground at once —
        // with the toe below the hands, not square of the wicket.
        expect(finish.batUp[0]).toBeLessThan(-.5);
        expect(finish.batUp[2]).toBeLessThan(-.5);
        expect(finish.batUp[1]).toBeGreaterThan(.3);
      }
    }
  });
  it('keeps the cover drive as it always was for version one, beside the rebuilt one', () => {
    const played = (version: 1 | 2) => {
      const batter = new Batter(); batter.prepare(1); batter.update(0);
      batter.swing('COVER_LONG_OFF', 0, .10, .54, GAME.contactZ, false, false, false, false, version);
      batter.update(STROKE_CONTACT_MS); const contact = batter.inspect();
      batter.update(410); return { contact, finish: batter.inspect() };
    };
    const one = played(1), two = played(2);
    // Version one: the short step and the finish pointing square of the wicket.
    expect(one.contact.frontFoot[2] - one.contact.backFoot[2]).toBeLessThan(.9);
    expect(one.finish.batUp[0]).toBeLessThan(-.8);
    // Version two: the long lunge and the finish out to cover and down.
    expect(two.contact.frontFoot[2] - two.contact.backFoot[2]).toBeGreaterThan(.95);
    expect(two.finish.batUp[0]).toBeGreaterThan(-.8);
    // The same ball met in the same place either way.
    one.contact.bladeContact.forEach((v: number, i: number) => expect(v).toBeCloseTo(two.contact.bladeContact[i], 6));
  });
  it('plants the cover drive\'s front foot before the bat comes down, and lunges long', () => {
    const batter = new Batter(); batter.prepare(1); batter.update(0);
    play(batter, 'cover', .10);
    batter.update(STROKE_CONTACT_MS); const contact = batter.inspect();
    batter.update(55); const plant = batter.inspect();
    // Down already, with the bat still on its way: the blade is halfway
    // down its arc, well up off the turf.
    expect(Math.abs(plant.frontFoot[2] - contact.frontFoot[2])).toBeLessThan(.02);
    expect(plant.bladeTip[1]).toBeGreaterThan(contact.bladeTip[1] + .2);
    // A stride of a metre, the back leg long behind him rather than folded
    // under the hips, and the back heel off the turf.
    expect(contact.frontFoot[2] - contact.backFoot[2]).toBeGreaterThan(.95);
    expect(contact.knees[1][1]).toBeGreaterThan(.3);
    expect(contact.backToe[1]).toBeCloseTo(.01, 5);
  });
  it('takes the cover drive home back along its own swing, never over his head', () => {
    const batter = new Batter(); batter.prepare(1); batter.update(0);
    play(batter, 'cover', .10);
    // From the held finish down through the carry and the extension and under
    // him, the toe hangs below the hands all the way; only then does it go up
    // behind into the pick-up. Over the top, the bat turned in his hands twice.
    for (let time = 620; time <= 820; time += 4) {
      batter.update(time); const pose = batter.inspect();
      expect(pose.bladeTip[1], `@${time}`).toBeLessThan(pose.grip[1]);
    }
  });
  it('does not turn the bat in his hands on the cover drive\'s way home, nor flick it into the guard', () => {
    const batter = new Batter(); batter.prepare(1); batter.update(0);
    play(batter, 'cover', .10);
    const at = (time: number) => { batter.update(time); return batter.bat.quaternion.clone(); };
    // How far the face turns about the handle between two frames, once the
    // handle's own swing is taken out.
    const roll = (a: Quaternion, b: Quaternion) => {
      const up = new Vector3(0, 1, 0).applyQuaternion(b);
      const carried = new Vector3(0, 0, 1).applyQuaternion(a).applyQuaternion(new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0).applyQuaternion(a), up));
      const face = new Vector3(0, 0, 1).applyQuaternion(b);
      return Math.abs(Math.atan2(up.dot(carried.clone().cross(face)), carried.dot(face)));
    };
    // From the extension on back to the pick-up, the face rides the handle.
    let previous = at(770);
    for (let time = 774; time <= STROKE_DURATION_MS; time += 4) {
      const now = at(time);
      expect(roll(previous, now), `@${time}`).toBeLessThan(MathUtils.degToRad(2));
      previous = now;
    }
    // And the frame before he is back is the guard he is back in.
    const last = at(STROKE_DURATION_MS - .5), home = at(STROKE_DURATION_MS + 50);
    expect(last.angleTo(home)).toBeLessThan(MathUtils.degToRad(1));
  });
  it('plays the on drive as a drive to long-on, not a flick over the leg-side shoulder', () => {
    for (const x of [-.42, -.2, 0]) {
      const batter = new Batter(); batter.prepare(1); batter.update(0);
      play(batter, 'on', x);
      // The front foot well down the pitch, the bat upright at the ball.
      batter.update(STROKE_CONTACT_MS); const contact = batter.inspect();
      expect(contact.frontFoot[2] - contact.backFoot[2], `x=${x}`).toBeGreaterThan(.75);
      expect(new Vector3(...contact.batUp).normalize().y, `x=${x}`).toBeGreaterThan(.95);
      // After the ball the toe stays out in front of him, going on to long-on:
      // it used to swing across the front of him to three quarters of a metre
      // on the leg side of his chest and wrap over the shoulder.
      for (let time = STROKE_CONTACT_MS + 4; time <= 600; time += 4) {
        batter.update(time); const pose = batter.inspect();
        const tip = new Vector3(...pose.bladeTip).sub(batter.root.position);
        expect(tip.x - pose.chest[0], `x=${x} @${time}`).toBeGreaterThan(-.45);
        expect(tip.z - pose.chest[2], `x=${x} @${time}`).toBeGreaterThan(.3);
      }
      // Arms out along the line at the extension, and the hands high in front
      // of him at the finish with the blade up the ground after the ball.
      batter.update(220); const through = batter.inspect();
      expect(through.grip[2] - through.chest[2], `x=${x}`).toBeGreaterThan(.35);
      batter.update(500); const finish = batter.inspect();
      expect(finish.grip[1], `x=${x}`).toBeGreaterThan(1.45);
      expect(finish.bladeTip[1], `x=${x}`).toBeGreaterThan(finish.grip[1]);
      expect(finish.bladeTip[2], `x=${x}`).toBeGreaterThan(finish.grip[2] + batter.root.position.z);
    }
  });
  it('does not turn the bat in his hands through the on drive, nor on its way home', () => {
    const batter = new Batter(); batter.prepare(1); batter.update(0);
    play(batter, 'on', -.2);
    const at = (time: number) => { batter.update(time); return batter.bat.quaternion.clone(); };
    const roll = (a: Quaternion, b: Quaternion) => {
      const up = new Vector3(0, 1, 0).applyQuaternion(b);
      const carried = new Vector3(0, 0, 1).applyQuaternion(a).applyQuaternion(new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0).applyQuaternion(a), up));
      const face = new Vector3(0, 0, 1).applyQuaternion(b);
      return Math.atan2(up.dot(carried.clone().cross(face)), carried.dot(face));
    };
    // Over the whole stroke the face turns about the handle no more than it
    // has to, to close towards mid-on and open again: it used to turn more
    // than once round in his hands.
    let previous = at(0), net = 0;
    for (let time = 4; time <= STROKE_DURATION_MS; time += 4) {
      const now = at(time), turn = roll(previous, now);
      net += turn;
      // And from the ball on, home included, it rides the handle.
      if (time > STROKE_CONTACT_MS + 20) expect(Math.abs(turn), `@${time}`).toBeLessThan(MathUtils.degToRad(2));
      previous = now;
    }
    expect(Math.abs(net)).toBeLessThan(MathUtils.degToRad(30));
    const last = at(STROKE_DURATION_MS - .5), home = at(STROKE_DURATION_MS + 50);
    expect(last.angleTo(home)).toBeLessThan(MathUtils.degToRad(1));
  });
  it('carries the bat up into the charge over cover\'s high finish without turning it in his hands, face to the sky', () => {
    const batter = charge(); batter.reset(); batter.prepare(1); batter.update(0); play(batter, 'coverCharge');
    const at = (time: number) => { batter.update(time); return batter.bat.quaternion.clone(); };
    const roll = (a: Quaternion, b: Quaternion) => {
      const up = new Vector3(0, 1, 0).applyQuaternion(b);
      const carried = new Vector3(0, 0, 1).applyQuaternion(a).applyQuaternion(new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0).applyQuaternion(a), up));
      const face = new Vector3(0, 0, 1).applyQuaternion(b);
      return Math.abs(Math.atan2(up.dot(carried.clone().cross(face)), carried.dot(face)));
    };
    // From the ball up to the hold, the face rides the handle.
    let previous = at(CHARGE_CONTACT_MS);
    for (let time = CHARGE_CONTACT_MS + 4; time <= CHARGE_CLOCK.hold; time += 4) {
      const now = at(time);
      expect(roll(previous, now), `@${time}`).toBeLessThan(MathUtils.degToRad(2));
      previous = now;
    }
    // Up there the sky sees the face of the blade, not its edge.
    expect(new Vector3(0, 0, 1).applyQuaternion(at(580)).y).toBeGreaterThan(.5);
    // And coming home it turns no more than it has to: not the full turns it spun before.
    let turned = 0; previous = at(CHARGE_CLOCK.hold);
    for (let time = CHARGE_CLOCK.hold + 4; time <= STROKE_DURATION_MS; time += 4) { const now = at(time); turned += roll(previous, now); previous = now; }
    expect(turned).toBeLessThan(MathUtils.degToRad(150));
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
    // Every stroke, and both other versions of the cover drive beside the default.
    const plays = [...STROKES.map(shot => [shot, 2, shot === 'LONG_ON' ? ON_DRIVE_MEETS_AT : 0] as const), ['COVER_LONG_OFF', 1, 0] as const, ['COVER_LONG_OFF', 3, COVER_V3_MEETS_AT] as const];
    for (const [shot, version, ahead] of plays) {
      let worst = { value: Infinity, part: '', where: '' };
      for (const ballY of [.54, 1.12]) for (const ballX of [-.55, -.42, -.3, -.14, 0, .14, .42, .55]) {
        const batter = new Batter();
        batter.reset(); batter.prepare(1); batter.update(0); batter.swing(shot, 0, ballX, ballY, GAME.contactZ + ahead, false, false, false, false, version);
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
      expect(worst.value, `${shot} v${version} reaches ${worst.value.toFixed(2)} into the ${worst.part} at ${worst.where}`).toBeGreaterThan(1);
    }
  }, 20_000); // Every stroke, every frame: six seconds and more on a slow host.

  // Once the ball is done with he may do something before he settles back:
  // tap the bat after a drive, watch a loft go, twirl the bat after a pull,
  // brush his pad after a sweep, rehearse a stroke he missed. Each starts
  // where the stroke ends and ends in the guard, never takes the bat through
  // him or into the turf, and moves no faster than the strokes are held to.
  const AFTER: [AfterBall, ShotType, (b: Batter) => void][] = [
    ['admire', 'STRAIGHT', b => b.swing('STRAIGHT', 0, 0, .54)],
    ['admire', 'COVER_LONG_OFF', b => b.swing('COVER_LONG_OFF', 0, 0, .54)],
    ['admire', 'LONG_ON', b => b.swing('LONG_ON', 0, 0, .54)],
    ['watch', 'STRAIGHT', b => b.swing('STRAIGHT', 0, 0, .54, GAME.contactZ, false, true)],
    ['watch', 'LONG_ON', b => b.swing('LONG_ON', 0, 0, .54, GAME.contactZ, false, true)],
    ['twirl', 'LEG', b => b.swing('LEG', 0, 0, 1.1)],
    ['brush', 'LEG', b => b.swing('LEG', 0, 0, .48, GAME.contactZ, false, false, true)],
    ['brush', 'REVERSE_SCOOP', b => b.swing('REVERSE_SCOOP', 0, 0, .54)],
    ['shadow', 'STRAIGHT', b => b.swing('STRAIGHT', 0, 0, .54)],
    ['shadow', 'COVER_LONG_OFF', b => b.swing('COVER_LONG_OFF', 0, 0, .54)],
    ['shadow', 'LONG_ON', b => b.swing('LONG_ON', 0, 0, .54)],
    ['scrub', 'LONG_ON', b => b.swing('LONG_ON', 0, 0, .54)],
    ['scrub', 'STRAIGHT', b => b.swing('STRAIGHT', 0, 0, .54)],
    ['shadow', 'DEFEND', b => b.swing('DEFEND', 0, 0, .54)],
    ['scrub', 'COVER_LONG_OFF', b => b.swing('COVER_LONG_OFF', 0, 0, .54)],
    ['scrub', 'DEFEND', b => b.swing('DEFEND', 0, 0, .54)],
    ['sky', 'COVER_LONG_OFF', b => b.swing('COVER_LONG_OFF', 0, 0, .54)],
    ['down', 'COVER_LONG_OFF', b => b.swing('COVER_LONG_OFF', 0, 0, .54)],
    ['down', 'DEFEND', b => b.swing('DEFEND', 0, 0, .54)],
    ['ribs', 'DEFEND', b => b.swing('DEFEND', 0, 0, .54)],
    ['sting', 'DEFEND', b => b.swing('DEFEND', 0, 0, .54)],
    ['dazed', 'DEFEND', b => b.swing('DEFEND', 0, 0, .54)],
    ['ribs', 'LEG', b => b.swing('LEG', 0, 0, 1.1)],
    ['lean', 'STRAIGHT', b => b.swing('STRAIGHT', 0, 0, .54)],
    ['lean', 'COVER_LONG_OFF', b => b.swing('COVER_LONG_OFF', 0, 0, .54)],
  ];
  for (const [kind, shot, play] of AFTER) it(`${kind}s after a ${shot.toLowerCase()} and settles back without a jump`, () => {
    const root = new Vector3(GAME.stanceX, 0, GAME.stanceZ);
    const batter = new Batter(); batter.reset(); batter.prepare(1); batter.update(0); play(batter);
    // A drive's hold has to be asked for before the finish; the rest once the ball is dead.
    const asked = kind === 'admire' || kind === 'lean' ? 150 : 600;
    for (let t = 0; t < asked; t += 2) batter.update(t);
    batter.afterBall(kind, asked);
    const guard = new Batter(); guard.reset(); guard.update(0);
    let previous = batter.inspect(), stood = 0;
    const end = STROKE_DURATION_MS + AFTER_BALL_MS + 400;
    for (let t = asked; t <= end; t += 2) {
      batter.update(t); const pose = batter.inspect();
      const where = `${kind} ${shot} @${t}`;
      for (let i = 0; i < 2; i++) {
        expect(new Vector3(...pose.elbows[i]).distanceTo(new Vector3(...previous.elbows[i])), where).toBeLessThan(.032);
        expect(new Quaternion(...pose.gripRotation[i]).angleTo(new Quaternion(...previous.gripRotation[i])), where).toBeLessThan(.30);
      }
      if (t >= STROKE_DURATION_MS) {
        const chest = new Vector3(...pose.chest), hip = new Vector3(...pose.hip);
        const spine = chest.clone().sub(hip).normalize();
        const yaw = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), pose.yaw);
        const torso = new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), spine).multiply(yaw);
        const head = chest.clone().addScaledVector(spine, .31).add(new Vector3(.01, .01, .025));
        const bat: [Vector3, Vector3] = [new Vector3(...pose.grip), new Vector3(...pose.bladeTip).sub(root)];
        for (const [part, centre, radii, turn] of [
          ['trunk', chest.clone().addScaledVector(spine, -.075), new Vector3(.205, .275, .145), torso],
          ['hips', hip, new Vector3(.185, .145, .135), yaw],
          ['helmet', head, new Vector3(.188, .19, .195), torso],
        ] as [string, Vector3, Vector3, Quaternion][]) expect(deepest(...bat, centre, radii, turn), `${where} ${part}`).toBeGreaterThan(1);
        expect(pose.bladeTip[1], where).toBeGreaterThan(0);
        stood = Math.max(stood, pose.hip[1] - guard.inspect().hip[1]);
      }
      previous = pose;
    }
    // Stood up for the ones that stand him up, and back in his guard at the end.
    if (kind !== 'brush' && kind !== 'shadow' && kind !== 'scrub') expect(stood, kind).toBeGreaterThan(.04);
    const last = batter.inspect(), still = guard.inspect();
    for (let i = 0; i < 3; i++) expect(Math.abs(last.grip[i] - still.grip[i]), kind).toBeLessThan(.01);
  });

  for (const [kind, shot, play] of AFTER) it(`${kind} after a ${shot.toLowerCase()} finishes through the next run-up and leaves him ready`, () => {
    // The bowler runs in while he finishes: the new ball's reset is asked for
    // a run-up before he is done, and is taken once he is, with the bat
    // coming up for the ball the whole time and nothing jumping.
    const batter = new Batter(); batter.reset(); batter.prepare(1); batter.update(0); play(batter);
    const asked = kind === 'admire' || kind === 'lean' ? 150 : 600;
    for (let t = 0; t < asked; t += 2) batter.update(t);
    const done = batter.afterBall(kind, asked), runup = done - GAME.runupMs;
    for (let t = asked; t < runup; t += 2) batter.update(t);
    let previous = batter.inspect();
    batter.reset(true);
    for (let t = runup; t <= done + 200; t += 2) {
      batter.prepare(Math.min(1, (t - runup) / GAME.runupMs)); batter.update(t);
      const pose = batter.inspect(), where = `${kind} ${shot} @${t}`;
      for (let i = 0; i < 2; i++) {
        expect(new Vector3(...pose.elbows[i]).distanceTo(new Vector3(...previous.elbows[i])), where).toBeLessThan(.032);
        expect(new Quaternion(...pose.gripRotation[i]).angleTo(new Quaternion(...previous.gripRotation[i])), where).toBeLessThan(.30);
      }
      expect(new Vector3(...pose.grip).distanceTo(new Vector3(...previous.grip)), where).toBeLessThan(.02);
      previous = pose;
    }
    // Waiting for the ball as a man who had stood still all along would be,
    // and the stroke he played put away with the last ball.
    const ready = new Batter(); ready.reset(); ready.prepare(1); ready.update(done + 200);
    for (let i = 0; i < 3; i++) expect(Math.abs(batter.inspect().grip[i] - ready.inspect().grip[i]), kind).toBeLessThan(.01);
    expect(batter.played, kind).toMatchObject({ pulled: false, swept: false, lofted: false });
  });

  for (const kind of ['sky', 'down'] as AfterBall[]) it(`${kind} off a ball left alone: from the leave, without a jump, and back in his guard`, () => {
    // Shouldering arms on 99 and bowled: there is no stroke, and the bat is
    // still up from waiting for the ball when he starts.
    const batter = new Batter(); batter.reset(); batter.prepare(1); batter.update(0); batter.update(900);
    const done = batter.afterBall(kind, 1000);
    expect(done, kind).toBeGreaterThan(1000);
    const guard = new Batter(); guard.reset(); guard.update(0);
    let previous = batter.inspect(), moved = 0;
    for (let t = 1000; t <= done + 300; t += 2) {
      batter.update(t); const pose = batter.inspect();
      for (let i = 0; i < 2; i++) expect(new Vector3(...pose.elbows[i]).distanceTo(new Vector3(...previous.elbows[i])), `${kind} @${t}`).toBeLessThan(.032);
      expect(new Vector3(...pose.grip).distanceTo(new Vector3(...previous.grip)), `${kind} @${t}`).toBeLessThan(.02);
      moved = Math.max(moved, Math.abs(pose.yaw - guard.inspect().yaw));
      previous = pose;
    }
    expect(moved, kind).toBeGreaterThan(.5);
    for (let i = 0; i < 3; i++) expect(Math.abs(batter.inspect().grip[i] - guard.inspect().grip[i]), kind).toBeLessThan(.01);
  });

  for (const where of ['HELMET', 'RIBS', 'GLOVES', 'THIGH'] as const) it(`retired hurt by a blow on the ${where.toLowerCase()}: down onto his knees without a jump, and stays there`, () => {
    // From his guard, and from the middle of a pull, which is where a bouncer
    // finds him.
    for (const from of ['guard', 'pull'] as const) {
      const batter = new Batter(); batter.reset(); batter.prepare(1); batter.update(0);
      if (from === 'pull') { batter.swing('LEG', 0, 0, 1.1); for (let t = 0; t <= 200; t += 2) batter.update(t); }
      const at = from === 'pull' ? 200 : 0;
      batter.fall(at, where);
      let previous = batter.inspect();
      for (let t = at; t <= at + 2600; t += 2) {
        batter.update(t); const pose = batter.inspect(), here = `${where} from ${from} @${t - at}`;
        for (let i = 0; i < 2; i++) expect(new Vector3(...pose.elbows[i]).distanceTo(new Vector3(...previous.elbows[i])), here).toBeLessThan(.05);
        expect(new Vector3(...pose.grip).distanceTo(new Vector3(...previous.grip)), here).toBeLessThan(.03);
        expect(pose.bladeTip[1], here).toBeGreaterThan(-.03);
        previous = pose;
      }
      // On his knees, not sitting and not standing, and still there.
      const down = batter.inspect();
      expect(down.hip[1], `${where} from ${from}`).toBeGreaterThan(.4);
      expect(down.hip[1], `${where} from ${from}`).toBeLessThan(.6);
      expect(batter.felled).toBe(true);
    }
  });

  it('holds an admired drive at its finish, and only if asked before it gets there', () => {
    const held = new Batter(); held.reset(); held.prepare(1); held.update(0); held.swing('STRAIGHT', 0, 0, .54);
    held.update(150); held.afterBall('admire', 150);
    held.update(480); const at = held.inspect().grip;
    held.update(480 + ADMIRE_MS - 20); expect(held.inspect().grip).toEqual(at);
    const late = new Batter(); late.reset(); late.prepare(1); late.update(0); late.swing('STRAIGHT', 0, 0, .54);
    late.update(600); late.afterBall('admire', 600); late.update(700);
    const plain = new Batter(); plain.reset(); plain.prepare(1); plain.update(0); plain.swing('STRAIGHT', 0, 0, .54); plain.update(700);
    expect(late.inspect().grip).toEqual(plain.inspect().grip);
  });

  it('does nothing after a charge, and a new ball cancels it', () => {
    const charged = new Batter(); charged.reset(); charged.prepare(1); charged.update(0);
    charged.swing('STRAIGHT', 0, 0, .54, GAME.contactZ + CHARGE_MEETS_AT, true);
    charged.update(500); charged.afterBall('watch', 500); charged.update(STROKE_DURATION_MS + 300);
    const walking = new Batter(); walking.reset(); walking.prepare(1); walking.update(0);
    walking.swing('STRAIGHT', 0, 0, .54, GAME.contactZ + CHARGE_MEETS_AT, true); walking.update(STROKE_DURATION_MS + 300);
    expect(charged.inspect().hip).toEqual(walking.inspect().hip);
    const batter = new Batter(); batter.reset(); batter.prepare(1); batter.update(0); batter.swing('STRAIGHT', 0, 0, .54);
    batter.update(500); batter.afterBall('watch', 500); batter.reset(); batter.update(STROKE_DURATION_MS + 300);
    const guard = new Batter(); guard.reset(); guard.update(STROKE_DURATION_MS + 300);
    expect(batter.inspect().hip).toEqual(guard.inspect().hip);
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
        // Met where the game meets it: a pull out in front of him.
        batter.reset(); batter.prepare(1); batter.update(0); batter.swing(shot, 0, ballX, ballY, GAME.contactZ + (shot === 'LEG' && ballY > PULL_HEIGHT ? PULL_MEETS_AT : 0));
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
  it('goes back and across with the bat high, meets it out in front with the arms long, swings round flat and wraps', () => {
    // From a net session filmed from the bowler's end, square on the off side
    // and close on the arms: the pull is the hook's stroke at a ball on the body.
    const at = (time: number, ballX = 0) => {
      const batter = new Batter();
      batter.prepare(1); batter.update(0); batter.swing('LEG', 0, ballX, 1.12, GAME.contactZ + PULL_MEETS_AT); batter.update(time);
      return { pose: batter.inspect(), strikeAt: batter.strikeAt };
    };
    /** The angle at the elbow, in degrees: 180 is a straight arm. */
    const elbow = (pose: ReturnType<typeof at>['pose'], arm: number) => {
      const joint = new Vector3(...pose.elbows[arm]);
      return MathUtils.radToDeg(new Vector3(...pose.shoulders[arm]).sub(joint).angleTo(new Vector3(...pose.wrists[arm]).sub(joint)));
    };
    const guard = new Batter().inspect();
    // Back and across, the bat taken high: the hands above his shoulders and
    // the blade up behind them. The first build's backlift was at his hip.
    const load = at(PULL_LOAD_MS).pose;
    expect(load.grip[1]).toBeGreaterThan(load.chest[1] + .2);
    expect(load.batUp[1]).toBeLessThan(-.75);
    expect(load.backFoot[2]).toBeLessThan(guard.backFoot[2] - .1);
    expect(load.backFoot[0]).toBeGreaterThan(guard.backFoot[0] + .15);
    for (const ballX of [-.4, 0, .3]) {
      const { pose: contact, strikeAt } = at(PULL_CONTACT_MS, ballX);
      expect(strikeAt).toBe(PULL_CONTACT_MS);
      // Met out in front of his chest with the bat level and the arms opened
      // out. The first build met it at his chest, the elbows at 57 and 66.
      expect(contact.grip[2], `x ${ballX}`).toBeGreaterThan(contact.chest[2] + .4);
      expect(Math.abs(contact.batUp[1]), `x ${ballX}`).toBeLessThan(.15);
      for (const arm of [0, 1]) expect(elbow(contact, arm), `x ${ballX} arm ${arm}`).toBeGreaterThan(80);
      // The flat face meets it, looking back up the pitch at the ball. The
      // first build's looked at square leg, and the ball took it side on.
      expect(contact.batFace[2], `x ${ballX}`).toBeGreaterThan(.85);
    }
    // Swung round flat with the arms still long, out past him to leg,
    const leg = at(315).pose;
    expect(leg.grip[0]).toBeLessThan(leg.chest[0] - .5);
    expect(elbow(leg, 1)).toBeGreaterThan(150);
    // then wrapped behind his head with the hands above it,
    const wrap = at(520).pose;
    expect(wrap.grip[1]).toBeGreaterThan(wrap.chest[1] + .5);
    // the curved back of the blade against the front shoulder, the face out,
    const middle = new Vector3(...wrap.grip).lerp(new Vector3(...wrap.bladeTip).sub(new Vector3(GAME.stanceX, 0, GAME.stanceZ)), .5);
    expect(new Vector3(...wrap.batFace).dot(new Vector3(...wrap.shoulders[0]).sub(middle).normalize())).toBeLessThan(-.7);
    // and turned on round until his back is to the bowler.
    expect(at(720).pose.yaw).toBeLessThan(-2.5);
  });
  it('plays each version of the pull half the time, the same ball the same way every time', () => {
    let two = 0, n = 0;
    for (let seed = 1; seed < 200; seed++) for (let ball = 0; ball < 60; ball++) {
      n++; if (pullVersionOf(seed * 7919, ball) === 2) two++;
      expect(pullVersionOf(seed * 7919, ball)).toBe(pullVersionOf(seed * 7919, ball));
    }
    expect(two / n).toBeGreaterThan(.47); expect(two / n).toBeLessThan(.53);
  });
  it('swings version one\'s bat as version two does, without the turn', () => {
    // The first build's body, standing where he hit it, with the bat swung
    // as the clip swings it: up high, the flat face to the ball with the arms
    // out at it, round flat to leg with the back arm long, and wrapped over
    // the front shoulder with the back of the blade on it.
    const at = (time: number, ballX = 0) => {
      const batter = new Batter();
      batter.prepare(1); batter.update(0); batter.swing('LEG', 0, ballX, 1.12, GAME.contactZ, false, false, false, false, 1); batter.update(time);
      return { pose: batter.inspect(), strikeAt: batter.strikeAt };
    };
    const elbow = (pose: ReturnType<typeof at>['pose'], arm: number) => {
      const joint = new Vector3(...pose.elbows[arm]);
      return MathUtils.radToDeg(new Vector3(...pose.shoulders[arm]).sub(joint).angleTo(new Vector3(...pose.wrists[arm]).sub(joint)));
    };
    const root = new Vector3(GAME.stanceX, 0, GAME.stanceZ);
    // Up high behind the back shoulder: the first build's backlift stopped at his hip.
    const load = at(PULL_V1_LOAD_MS).pose;
    expect(load.grip[1]).toBeGreaterThan(load.chest[1] + .1);
    for (const ballX of [-.4, 0, .3]) {
      const { pose: contact, strikeAt } = at(PULL_V1_CONTACT_MS, ballX), where = `x ${ballX}`;
      expect(strikeAt).toBe(PULL_V1_CONTACT_MS);
      // The face to the ball, which the first build met looking at square leg,
      expect(contact.batFace[2], where).toBeGreaterThan(.85);
      // with the bat level and the hands out in front of his chest, not at it.
      expect(Math.abs(contact.batUp[1]), where).toBeLessThan(.15);
      expect(contact.grip[2], where).toBeGreaterThan(contact.chest[2] + .35);
      // Round flat to leg with the back arm straight,
      const through = at(340, ballX).pose;
      expect(through.grip[0], where).toBeLessThan(through.chest[0] - .3);
      expect(elbow(through, 1), where).toBeGreaterThan(150);
      expect(Math.abs(through.batUp[1]), where).toBeLessThan(.2);
      // and wrapped over the front shoulder with the back of the blade on it,
      // the hands up by his head rather than at his chest.
      const finish = at(500, ballX).pose;
      const middle = new Vector3(...finish.grip).lerp(new Vector3(...finish.bladeTip).sub(root), .5);
      expect(new Vector3(...finish.batFace).dot(new Vector3(...finish.shoulders[0]).sub(middle).normalize()), where).toBeLessThan(-.7);
      expect(finish.grip[1], where).toBeGreaterThan(finish.chest[1] + .3);
      // No turn: he never gets round past square, where version two turns
      // his back to the bowler.
      expect(finish.yaw, where).toBeGreaterThan(-.6);
      // Held there a moment longer than the stroke's own clock, then home.
      const held = at(570 + PULL_V1_HOLD_MS, ballX).pose;
      expect(new Vector3(...held.grip).distanceTo(new Vector3(...finish.grip)), where).toBeLessThan(.001);
      const home = at(STROKE_DURATION_MS + PULL_V1_HOLD_MS, ballX).pose, guard = new Batter().inspect();
      expect(new Vector3(...home.grip).distanceTo(new Vector3(...guard.grip)), where).toBeLessThan(.01);
    }
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

describe('the block', () => {
  // From two net clips in slow motion: the forward defence at a ball pitched
  // up, the back-foot defence at one back of a length or a bouncer.
  const at = (time: number, ballY: number, ballX = 0) => {
    const meets = ballY > DEFENCE_BACK_HEIGHT ? DEFENCE_BACK_MEETS_AT : DEFENCE_FRONT_MEETS_AT;
    const batter = new Batter(); batter.prepare(1); batter.update(0);
    batter.swing('DEFEND', 0, ballX, ballY, GAME.contactZ + meets); batter.update(time);
    return { pose: batter.inspect(), strikeAt: batter.strikeAt };
  };
  const guard = new Batter().inspect();
  const elbowAboveWrist = (pose: ReturnType<typeof at>['pose']) => pose.elbows[0][1] - pose.wrists[0][1];

  it('strides out to a ball pitched up, the head over it and the bat straight beside the front pad', () => {
    for (const ballX of [-.3, 0, .3]) {
      const { pose, strikeAt } = at(DEFENCE_FRONT_CONTACT_MS, .54, ballX), where = `x ${ballX}`;
      expect(strikeAt).toBe(DEFENCE_FRONT_CONTACT_MS);
      // A long stride down the line, the front knee bent and the hips down:
      // the first build's was a short step, standing up.
      expect(pose.frontFoot[2] - guard.frontFoot[2], where).toBeGreaterThan(.3);
      expect(pose.hip[1], where).toBeLessThan(guard.hip[1] - .12);
      // The head out over the front knee, the chest well ahead of the hips.
      expect(pose.chest[2] - pose.hip[2], where).toBeGreaterThan(.15);
      // The bat straight and angled with the handle ahead of the blade, the
      // face looking at the bowler and down at the pitch,
      expect(pose.batUp[1], where).toBeGreaterThan(.85);
      expect(pose.batUp[2], where).toBeGreaterThan(.15);
      expect(pose.batFace[2], where).toBeGreaterThan(.8);
      expect(pose.batFace[1], where).toBeLessThan(-.15);
      // met beside the front pad, with the top hand's elbow up over the wrist.
      expect(Math.abs(GAME.contactZ + DEFENCE_FRONT_MEETS_AT - GAME.stanceZ - pose.frontFoot[2]), where).toBeLessThan(.2);
      expect(elbowAboveWrist(pose), where).toBeGreaterThan(.05);
    }
  });

  it('goes back and across to a ball back of a length or a bouncer, tall, the bat straight in front of him', () => {
    for (const ballY of [.81, 1.13]) for (const ballX of [-.3, 0, .3]) {
      const { pose, strikeAt } = at(DEFENCE_BACK_CONTACT_MS, ballY, ballX), where = `y ${ballY} x ${ballX}`;
      expect(strikeAt).toBe(DEFENCE_BACK_CONTACT_MS);
      // Back and across, the front foot drawn back after it, and tall on it.
      expect(pose.backFoot[2], where).toBeLessThan(guard.backFoot[2] - .12);
      expect(pose.frontFoot[2], where).toBeLessThan(guard.frontFoot[2]);
      expect(pose.hip[1], where).toBeGreaterThan(guard.hip[1] - .02);
      // The bat straight, handle ahead, face to the bowler and down; the ball
      // met in front of him at its own height, not under the bat's tucked-in
      // waist-high stance as the first build met everything.
      expect(pose.batUp[1], where).toBeGreaterThan(.85);
      expect(pose.batUp[2], where).toBeGreaterThan(.15);
      expect(pose.batFace[2], where).toBeGreaterThan(.8);
      expect(pose.bladeContact[1], where).toBeCloseTo(ballY, 2);
      expect(pose.grip[2], where).toBeGreaterThan(pose.chest[2]);
      // The top hand's elbow up: over the wrist off a length, and at a bouncer,
      // where the hands are up by his chin, level with the shoulder.
      if (ballY < 1) expect(elbowAboveWrist(pose), where).toBeGreaterThan(.05);
      else expect(pose.elbows[0][1], where).toBeGreaterThan(pose.shoulders[0][1] - .05);
    }
  });

  it('picks the defence by the length of the ball', () => {
    // Every ball pitched up reaches him at .54, back of a length .81, a bouncer 1.13.
    expect(at(DEFENCE_FRONT_CONTACT_MS, .54).pose.frontFoot[2]).toBeGreaterThan(guard.frontFoot[2] + .3);
    for (const ballY of [.81, 1.13]) expect(at(DEFENCE_BACK_CONTACT_MS, ballY).pose.frontFoot[2]).toBeLessThan(guard.frontFoot[2]);
  });

  it('holds the shape with soft hands, then goes home', () => {
    for (const ballY of [.54, .81, 1.13]) {
      const held = at(300, ballY).pose, later = at(550, ballY).pose;
      expect(new Vector3(...held.grip).distanceTo(new Vector3(...later.grip)), `y ${ballY}`).toBeLessThan(.001);
      const home = at(STROKE_DURATION_MS, ballY).pose;
      expect(new Vector3(...home.grip).distanceTo(new Vector3(...guard.grip)), `y ${ballY}`).toBeLessThan(.01);
    }
  });

  it('goes home in one movement without turning the bat in his hands', () => {
    // Taken up and over in front of him after a stop for the elbow, the bat
    // read as twirled by the wrists on the way back into the guard.
    for (const ballY of [.54, .81, 1.13]) for (const ballX of [-.3, 0, .3]) {
      const where = `y ${ballY} x ${ballX}`;
      const batter = new Batter(); batter.prepare(1); batter.update(0);
      batter.swing('DEFEND', 0, ballX, ballY, GAME.contactZ + (ballY > DEFENCE_BACK_HEIGHT ? DEFENCE_BACK_MEETS_AT : DEFENCE_FRONT_MEETS_AT));
      let turned = 0, previous: { up: Vector3; face: Vector3 } | null = null;
      const speeds: number[] = []; let tip: Vector3 | null = null;
      for (let time = 560; time <= STROKE_DURATION_MS; time += 10) {
        batter.update(time); const pose = batter.inspect();
        const up = new Vector3(...pose.batUp).normalize(), face = new Vector3(...pose.batFace);
        // The face carried along with the handle from the last step, against where it is now.
        if (previous) {
          const carried = previous.face.clone().applyQuaternion(new Quaternion().setFromUnitVectors(previous.up, up));
          turned += Math.abs(Math.atan2(up.dot(carried.clone().cross(face)), carried.dot(face)));
        }
        previous = { up, face };
        const now = new Vector3(...pose.bladeTip);
        if (tip) speeds.push(now.distanceTo(tip)); tip = now;
      }
      expect(MathUtils.radToDeg(turned), where).toBeLessThan(5);
      // One rise and one fall: never slowing and then speeding up again.
      const peak = speeds.indexOf(Math.max(...speeds));
      speeds.forEach((speed, n) => {
        if (n > 0 && n <= peak) expect(speed, `${where} at ${560 + n * 10}`).toBeGreaterThan(speeds[n - 1] - .002);
        if (n > peak) expect(speed, `${where} at ${560 + n * 10}`).toBeLessThan(speeds[n - 1] + .002);
      });
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

  it('meets the ball with the flat face, the arms out straight', () => {
    /** The angle at the elbow, in degrees: 180 is a straight arm. */
    const elbow = (pose: ReturnType<typeof at>, arm: number) => {
      const joint = new Vector3(...pose.elbows[arm]);
      return MathUtils.radToDeg(new Vector3(...pose.shoulders[arm]).sub(joint).angleTo(new Vector3(...pose.wrists[arm]).sub(joint)));
    };
    for (const ballY of [.54, 1.12]) for (const ballX of [.11, .28, .46, .62]) {
      const contact = at(110, ballX, ballY), where = `x ${ballX} y ${ballY}`;
      // The face looks back up the pitch at the ball, a little over it. Drawn
      // from the keys, it looked at the keeper: the back of the blade hit it.
      expect(contact.batFace[2], where).toBeGreaterThan(.85);
      expect(contact.batFace[1], where).toBeLessThan(0);
      // Played away from the body: the bottom arm out straight, the top one
      // well open. Following the ball by the drives' share of its width put
      // the hands under his chin, at 60 and 25 degrees. At the chest the
      // hands are up by the shoulders and the bottom arm has less to unfold.
      expect(elbow(contact, 1), where).toBeGreaterThan(ballY > 1 ? 115 : 135);
      expect(elbow(contact, 0), where).toBeGreaterThan(ballY > 1 ? 65 : 70);
    }
  });

  it('wraps the bat onto the front shoulder with the back of the blade against it', () => {
    for (const ballY of [.54, 1.12]) for (const time of [410, 500]) {
      const pose = at(time, .46, ballY), where = `y ${ballY} ${time}ms`;
      const middle = new Vector3(...pose.grip).lerp(new Vector3(...pose.bladeTip).sub(root), .5);
      const toShoulder = new Vector3(...pose.shoulders[0]).sub(middle).normalize();
      // The flat face looks out, away from the shoulder the blade lies on.
      expect(new Vector3(...pose.batFace).dot(toShoulder), where).toBeLessThan(-.7);
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
  it.each(['straight','cover','cover3','on','square'])('uses a diagonal top-hand wrist and leading elbow for %s',kind=>{
    const batter=new Batter(); batter.prepare(1); batter.update(0);
    play(batter, kind, PLAYS[kind].reach[1]);
    batter.update(PLAYS[kind].impact);
    const p=batter.inspect(), axis=new Vector3(0,1,0).applyQuaternion(batter.bat.quaternion);
    const topHand=new Vector3(...p.hands[0]).sub(batter.root.position);
    const wrist=new Vector3(...p.wrists[0]);
    expect(wrist.clone().sub(topHand).dot(axis)).toBeGreaterThan(.015);
    expect(p.elbows[0][1]-wrist.y).toBeGreaterThan(.10);
  });
  // Every stroke frame by frame: a second or two alone, near the default five
  // seconds when the whole suite runs at once, so it is given room.
  it('does not flip an elbow or wrist between frames, including entering and leaving guard', () => {
    for (const kind of ['pull','pullV1','defend','defendBack','defendBouncer','hook','spinCut','lateCut','cut','cutLow','square','straight','cover','cover3','on','sweep','flat','charge','coverCharge','onCharge','onLofted','scoop','reverse']) for (const x of PLAYS[kind].reach) {
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
  }, 20_000);
  it('holds the handle with two hands that agree about it', () => {
    const batter = new Batter();
    let flattest = Infinity, wristWhere = '';
    for (const [shot, ballY] of STROKES.flatMap(s => [[s, .54], [s, 1.12]] as const)) {
      for (const ballX of [-.5, 0, .5]) {
        // Each where the game meets it: the on drive a little further on.
        batter.reset(); batter.prepare(1); batter.update(0); batter.swing(shot, 0, ballX, ballY, GAME.contactZ + (shot === 'LONG_ON' ? ON_DRIVE_MEETS_AT : 0));
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
  it.each(['straight','lofted','loftedV2','cover','cover3','on','square','charge','coverCharge','onCharge','onLofted'])('powers the %s follow-through with upper-arm travel', kind => {
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
  it.each(['straight','cover','cover3','on','square','charge','coverCharge','onCharge','onLofted','scoop','reverse'])('presents the flat face from face-down pickup into %s contact',kind=>{
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
  it.each(['pull','pullV1','defend','defendBack','defendBouncer','hook','spinCut','lateCut','cut','cutLow','square','straight','cover','cover3','on','sweep','flat','charge','coverCharge','onCharge','onLofted','loftedV2','scoop','reverse'])('keeps the %s blade volume outside body, helmet, joints and forearms', (kind) => {
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
  it.each(['pull','pullV1','defend','defendBack','defendBouncer', 'hook','spinCut','lateCut','cut','cutLow', 'square', 'straight', 'cover','cover3','on', 'sweep', 'flat'])('faces where the %s shoe faces', kind => {
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
  it.each(['pull','pullV1','defend','defendBack','defendBouncer', 'hook','spinCut','lateCut','cut','cutLow', 'square', 'straight', 'cover','cover3','on', 'sweep', 'flat'])('keeps the %s forearms apart and the elbows unswapped', kind => {
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
   * Into the ball the swing turns the face, never his wrists. After it the
   * forearms roll it over once, evenly, as the bat climbs out over the leg side
   * and over his head, so that behind his head the flat face looks up at the
   * sky and the curved back lies against him; riding the handle alone, it came
   * down there face first onto his shoulders. Then nothing turns it while it
   * is held, and it unwinds once on the way home.
   */
  it('rolls the face over once on the climb, and holds it there', () => {
    for (const x of PLAYS.sweep.reach) {
      const batter = swept(x);
      let previous = batter.bat.quaternion.clone(), into = 0, rolled = 0, held = 0, home = 0, way = 0;
      for (let time = 4; time <= STROKE_DURATION_MS + SLOG_HOLD_MS; time += 4) {
        batter.update(time);
        const step = previous.clone().invert().multiply(batter.bat.quaternion);
        const signed = 2 * Math.atan2(step.y, step.w), turn = Math.abs(Math.atan2(Math.sin(signed), Math.cos(signed))) * 180 / Math.PI;
        if (time <= SWEEP_CONTACT_MS) into += turn;
        else if (time <= SLOG_CLOCK.through) held += turn;
        else if (time <= SLOG_CLOCK.finish) {
          rolled += turn;
          if (turn > .5) { const sign = Math.sign(Math.atan2(Math.sin(signed), Math.cos(signed))); expect(way === 0 || sign === way, `x=${x} @${time}ms one way`).toBe(true); way = sign; }
        }
        else if (time <= SLOG_CLOCK.finish + 200) held += turn;
        else home += turn;
        expect(turn / .004, `x=${x} @${time}ms`).toBeLessThan(900);
        previous = batter.bat.quaternion.clone();
      }
      expect(into, `x=${x} into the ball`).toBeLessThan(30);
      expect(rolled, `x=${x} rolled over on the climb`).toBeGreaterThan(90);
      expect(rolled, `x=${x} once`).toBeLessThan(180);
      expect(held, `x=${x} after the ball and in the hold`).toBeLessThan(1);
      expect(home, `x=${x} home`).toBeLessThan(200);
    }
  });
  it('lunges down the pitch and meets the ball out in front of the front pad, the arms long', () => {
    const guard = new Batter().inspect();
    for (const x of PLAYS.sweep.reach) {
      const batter = swept(x);
      batter.update(SWEEP_CONTACT_MS);
      const pose = batter.inspect();
      expect(pose.frontFoot[2] - guard.frontFoot[2], `x=${x} the stride`).toBeGreaterThan(.18);
      const ball = new Vector3(...pose.bladeContact).sub(batter.root.position);
      expect(ball.z - pose.frontFoot[2], `x=${x} in front of the pad`).toBeGreaterThan(.12);
      expect(new Vector3(...pose.grip).distanceTo(new Vector3(...pose.chest)), `x=${x} away from his body`).toBeGreaterThan(.5);
    }
  });
  /**
   * After the ball the bat keeps going round: out at the bowler at chest
   * height, then up and out over the leg side with the hands out that way at
   * his shoulder, upright beside his head, and only then over the top and down
   * behind it. The first rebuild sent it straight up the pitch from the ball
   * and over his head, which is a different stroke.
   */
  it('swings round to the leg side and up beside his head before dropping the bat behind it', () => {
    for (const x of PLAYS.sweep.reach) {
      const batter = swept(x);
      const root = () => batter.root.position;
      const tip = () => new Vector3(...batter.inspect().bladeTip).sub(root());
      for (let time = SLOG_CLOCK.through; time <= SLOG_CLOCK.over; time += 4) {
        batter.update(time);
        expect(batter.inspect().batFace[0], `x=${x} @${time}ms face to leg`).toBeLessThan(-.4);
      }
      batter.update(SLOG_CLOCK.through);
      let pose = batter.inspect();
      expect(tip().z, `x=${x} out at the bowler`).toBeGreaterThan(pose.grip[2] + .6);
      expect(new Vector3(...pose.grip).distanceTo(new Vector3(...pose.chest)), `x=${x} an arm's length out`).toBeGreaterThan(.55);
      batter.update(SLOG_CLOCK.carry);
      pose = batter.inspect();
      expect(tip().x, `x=${x} out over the leg side`).toBeLessThan(pose.grip[0] - .4);
      expect(tip().y, `x=${x} climbing`).toBeGreaterThan(pose.grip[1] + .4);
      expect(pose.grip[0], `x=${x} the hands out to leg`).toBeLessThan(pose.chest[0] - .3);
      batter.update(SLOG_CLOCK.over);
      pose = batter.inspect();
      expect(tip().y, `x=${x} upright`).toBeGreaterThan(pose.grip[1] + .7);
      batter.update(SLOG_CLOCK.finish);
      const finish = batter.inspect();
      const chest = new Vector3(...finish.chest);
      const head = chest.clone().add(chest.clone().sub(new Vector3(...finish.hip)).normalize().multiplyScalar(.31));
      expect(finish.grip[1] - head.y, `x=${x} hands over his head`).toBeGreaterThan(.25);
      expect(tip().z, `x=${x} bat behind his head`).toBeLessThan(head.z - .3);
      expect(tip().x, `x=${x} lying out towards the off`).toBeGreaterThan(finish.grip[0] + .2);
      expect(finish.batFace[1], `x=${x} the flat face up, the curved back against him`).toBeGreaterThan(.8);
      expect(finish.knees[1][1], `x=${x} still on the knee`).toBeLessThan(.15);
    }
  });
  /**
   * The blade against the sleeves, both halves of both arms. The rig's own
   * checks hold the blade off the forearm's line and off the joints, and
   * nothing held it off the upper arm: the bat came down out of the backlift
   * straight through the back one, past a back elbow stuck out at shoulder
   * height. A sleeve is .09 across at the shoulder and .046 at the cuff.
   */
  it('keeps the blade outside both sleeves, the whole way round', () => {
    const geometry = bladeGeometry(), positions = geometry.getAttribute('position');
    const samples = Array.from({ length: positions.count }, (_, i) => new Vector3().fromBufferAttribute(positions, i));
    geometry.dispose();
    const off = (p: Vector3, a: Vector3, b: Vector3) => {
      const line = b.clone().sub(a), at = THREE_clamp(p.clone().sub(a).dot(line) / line.lengthSq());
      return p.distanceTo(a.clone().addScaledVector(line, at));
    };
    for (const x of PLAYS.sweep.reach) {
      const batter = swept(x);
      let upper = { gap: Infinity, at: 0 }, lower = { gap: Infinity, at: 0 };
      for (let time = 0; time <= STROKE_DURATION_MS + SLOG_HOLD_MS; time += 4) {
        batter.update(time); batter.root.updateMatrixWorld(true);
        const pose = batter.inspect();
        for (const sample of samples) {
          const local = batter.bat.localToWorld(sample.clone()).sub(batter.root.position);
          for (let i = 0; i < 2; i++) {
            const shoulder = new Vector3(...pose.shoulders[i]), elbow = new Vector3(...pose.elbows[i]), wrist = new Vector3(...pose.wrists[i]);
            const u = off(local, shoulder, elbow), l = off(local, elbow, wrist);
            if (u < upper.gap) upper = { gap: u, at: time };
            if (l < lower.gap) lower = { gap: l, at: time };
          }
        }
      }
      expect(upper.gap, `x=${x} upper arm ${JSON.stringify(upper)}`).toBeGreaterThan(.08);
      expect(lower.gap, `x=${x} forearm ${JSON.stringify(lower)}`).toBeGreaterThan(.055);
    }
  });
  it('takes the hands out away from him as the bat comes down', () => {
    for (const x of PLAYS.sweep.reach) {
      const batter = swept(x);
      for (const time of [SLOG_CLOCK.down, SWEEP_CONTACT_MS, SLOG_CLOCK.through, SLOG_CLOCK.carry]) {
        batter.update(time);
        const pose = batter.inspect();
        expect(new Vector3(...pose.grip).distanceTo(new Vector3(...pose.chest)), `x=${x} @${time}ms`).toBeGreaterThan(.42);
      }
    }
  });
  /**
   * Held behind his head a good while, then home unhurried (`SLOG_HOLD_MS`).
   * At the strokes' own clock the hold was a twelfth of a second and the hands
   * were back in the guard in a third of one.
   */
  it('holds the finish, then comes all the way home without hurrying', () => {
    const batter = swept();
    const guard = new Batter().inspect();
    batter.update(SLOG_CLOCK.finish);
    const finish = batter.inspect().grip;
    batter.update(SLOG_CLOCK.finish + 200);
    for (let i = 0; i < 3; i++) expect(Math.abs(batter.inspect().grip[i] - finish[i]), 'held').toBeLessThan(.005);
    let previous = new Vector3(...batter.inspect().grip), fastest = 0;
    for (let time = SLOG_CLOCK.finish + 204; time <= STROKE_DURATION_MS + SLOG_HOLD_MS; time += 4) {
      batter.update(time);
      const grip = new Vector3(...batter.inspect().grip);
      fastest = Math.max(fastest, grip.distanceTo(previous) / .004); previous = grip;
    }
    expect(fastest, 'hands, metres a second on the way home').toBeLessThan(4);
    const pose = batter.inspect();
    expect(pose.grip).toEqual(guard.grip);
    expect(pose.frontFoot).toEqual(guard.frontFoot);
    expect(pose.backFoot).toEqual(guard.backFoot);
  });
  it('kneels on the back foot with its sole to the keeper', () => {
    for (const x of PLAYS.sweep.reach) {
      const batter = swept(x);
      const shoe = (batter as unknown as { legs: { shoe: Object3D }[] }).legs[1].shoe;
      for (const time of [SWEEP_CONTACT_MS, SLOG_CLOCK.carry, SLOG_CLOCK.finish, SLOG_CLOCK.finish + 200]) {
        batter.update(time); batter.root.updateMatrixWorld(true);
        const sole = new Vector3(0, -1, 0).applyQuaternion(shoe.getWorldQuaternion(new Quaternion()));
        expect(sole.z, `x=${x} @${time}ms`).toBeLessThan(-.9);
      }
    }
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
  it.each(['pull','pullV1','defend','defendBack','defendBouncer','hook','spinCut','lateCut','square','straight','lofted','loftedV2','cover','cover3','on','cut','cutLow','sweep'])('keeps the %s arms out of the helmet', kind => {
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
  it.each(['square','straight','lofted','loftedV2','cover','cover3','on'])('opens the %s elbows out through impact', kind => {
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
  it.each(['pull','pullV1','defend','defendBack','defendBouncer','hook','spinCut','lateCut','square','straight','lofted','loftedV2','cover','cover3','on','cut','cutLow','sweep'])('never reaches the %s arms past their own length', kind => {
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
 * The on drive's six: the on drive's own contact, then a lofted follow-through
 * of its own that wraps the bat over the front shoulder. The on drive along the
 * ground is what every other timing plays.
 */
describe('the lofted on drive', () => {
  const played = (lofted: boolean, x = -.2) => {
    const batter = new Batter(); batter.reset(); batter.prepare(1); batter.update(0);
    batter.swing('LONG_ON', 0, x, .54, GAME.contactZ + ON_DRIVE_MEETS_AT, false, lofted);
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
      // Out towards long-on: the hands well forward of the chest.
      expect(through.grip[2] - through.chest[2], `x=${x}`).toBeGreaterThan(.35);
      // The blade climbs in one arc from the ball to the top of the carry.
      let peak = -Infinity, sag = { drop: 0, at: 0 };
      for (let time = STROKE_CONTACT_MS; time <= 340; time += 4) {
        six.update(time);
        const tip = six.inspect().bladeTip[1];
        if (peak - tip > sag.drop) sag = { drop: peak - tip, at: time };
        peak = Math.max(peak, tip);
      }
      expect(sag.drop, `x=${x} toe sagging ${JSON.stringify(sag)}`).toBeLessThan(.08);
    }
  });
  it('wraps the bat over the front shoulder, the elbows bent, rather than reaching for the sky', () => {
    for (const x of PLAYS.onLofted.reach) {
      const six = played(true, x);
      six.update(500);
      const finish = six.inspect(), root = six.root.position;
      const [front, back] = finish.shoulders, grip = new Vector3(...finish.grip), tip = new Vector3(...finish.bladeTip).sub(root);
      // The hands just over the front shoulder, not up at arm's length.
      expect(grip.y - front[1], `x=${x}`).toBeGreaterThan(.1);
      expect(grip.y - front[1], `x=${x}`).toBeLessThan(.3);
      expect(Math.hypot(grip.x - front[0], grip.z - front[2]), `x=${x}`).toBeLessThan(.25);
      // The bat lying back over it: the toe above the hands, behind them, and
      // across towards the other shoulder.
      expect(tip.y - grip.y, `x=${x}`).toBeGreaterThan(.3);
      expect(grip.z - tip.z, `x=${x}`).toBeGreaterThan(.3);
      expect(Math.abs(tip.x - back[0]), `x=${x}`).toBeLessThan(Math.abs(grip.x - back[0]));
      // The front elbow up beside his head, the back one across in front of his face.
      expect(finish.elbows[0][1] - front[1], `x=${x}`).toBeGreaterThan(.2);
      expect(finish.elbows[1][2], `x=${x}`).toBeGreaterThan((six as unknown as { head: Object3D }).head.position.z);
      // The back foot up on its toe.
      expect(finish.backFoot[1], `x=${x}`).toBeGreaterThan(.1);
    }
  });
  it('takes the bat over with the arms: the bottom hand rolls over once, and the back of the blade lands on the shoulder', () => {
    for (const x of PLAYS.onLofted.reach) {
      const six = played(true, x);
      const at = (time: number) => { six.update(time); return six.bat.quaternion.clone(); };
      const roll = (a: Quaternion, b: Quaternion) => {
        const up = new Vector3(0, 1, 0).applyQuaternion(b);
        const carried = new Vector3(0, 0, 1).applyQuaternion(a).applyQuaternion(new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0).applyQuaternion(a), up));
        const face = new Vector3(0, 0, 1).applyQuaternion(b);
        return Math.atan2(up.dot(carried.clone().cross(face)), carried.dot(face));
      };
      // From the ball to the extension the face rides the handle; through the
      // carry the bottom hand rolls over the top one, evenly and one way only;
      // held, nothing; on the way home it settles into the guard a little at a time.
      let previous = at(STROKE_CONTACT_MS + 4), rolled = 0, way = 0;
      for (let time = STROKE_CONTACT_MS + 8; time <= STROKE_DURATION_MS; time += 4) {
        const now = at(time), turn = roll(previous, now);
        const rolling = time > ON_LOFT_ROLL[0] && time <= ON_LOFT_ROLL[1] + 4;
        if (rolling) { rolled += turn; if (Math.abs(turn) > MathUtils.degToRad(.2)) { if (!way) way = Math.sign(turn); expect(Math.sign(turn), `x=${x} @${time}`).toBe(way); } }
        expect(Math.abs(turn), `x=${x} @${time}`).toBeLessThan(MathUtils.degToRad(rolling ? 5 : time < ON_LOFT_HOLD ? .5 : 4));
        previous = now;
      }
      expect(Math.abs(rolled), `x=${x}`).toBeLessThan(Math.PI);
      // And at the wrap the face looks away from the front shoulder: the back
      // of the blade is what lies against it.
      six.update(500);
      const finish = six.inspect(), axis = new Vector3(0, 1, 0).applyQuaternion(six.bat.quaternion);
      const away = new Vector3(...finish.grip).addScaledVector(axis, -.45).sub(new Vector3(...finish.shoulders[0]));
      away.addScaledVector(axis, -away.dot(axis)).normalize();
      expect(new Vector3(0, 0, 1).applyQuaternion(six.bat.quaternion).dot(away), `x=${x}`).toBeGreaterThan(.95);
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
 * The scoops: the two strokes played behind the wicket, each from a net
 * session. The scoop is a ramp — across and down early, face to the sky, the
 * ball ridden over the keeper's shoulder — and the reverse is played as a
 * left-hander would: the bat up the leg side, a long stride out to the off,
 * down on the back knee, the level blade out under the ball on the off side
 * and up after it to upright, face to the keeper.
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
const throughHim = (batter: Batter, until = STROKE_DURATION_MS) => {
  let worst = { value: Infinity, part: '', at: 0 }, elbow = { clearance: Infinity, at: 0 };
  for (let time = 0; time <= until; time += 4) {
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
  it('steps across outside the line and squares up before the ball, and ramps it off a face turned to the sky', () => {
    for (const x of PLAYS.scoop.reach) {
      const batter = scoop(x);
      const line = x - batter.root.position.x;
      // Across and down before the ball: the crouch, the low bat, and his body
      // off to the off side of where the ball is coming.
      batter.update(SCOOP_CLOCK.set);
      const set = batter.inspect();
      expect(set.hip[1], `x=${x} set`).toBeLessThan(.80);
      expect(set.grip[1], `x=${x} set hands`).toBeLessThan(.90);
      expect(set.hip[0], `x=${x} out of the line`).toBeGreaterThan(line + .12);
      expect(set.backFoot[0] - set.frontFoot[0], `x=${x} feet across the crease`).toBeGreaterThan(.45);
      batter.update(SCOOP_CONTACT_MS);
      const contact = batter.inspect();
      expect(contact.bladeContact[0]).toBeCloseTo(x, 6);
      expect(contact.bladeContact[1]).toBeCloseTo(.54, 6);
      expect(contact.bladeContact[2]).toBeCloseTo(GAME.contactZ, 6);
      // Crouched, square to the bowler, the hands low.
      expect(contact.hip[1], `x=${x} crouch`).toBeLessThan(.75);
      expect(Math.abs(contact.yaw), `x=${x} square`).toBeLessThan(.3);
      expect(contact.grip[1], `x=${x} hands low`).toBeLessThan(.90);
      expect(contact.hip[0], `x=${x} still out of the line`).toBeGreaterThan(line + .12);
      // Laid back almost flat, pointing at the bowler, the face up.
      const tip = new Vector3(...contact.bladeTip).sub(batter.root.position);
      expect(tip.z, `x=${x} toe at the bowler`).toBeGreaterThan(contact.grip[2] + .6);
      expect(Math.abs(tip.y - contact.grip[1]), `x=${x} nearly flat`).toBeLessThan(.4);
      expect(contact.batFace[1], `x=${x} face up`).toBeGreaterThan(.75);
      expect(contact.batFace[2], `x=${x} face to the bowler`).toBeGreaterThan(0);
    }
  });
  it('lifts the bat toe first to upright in front of the front shoulder, without turning it in the hands', () => {
    for (const x of PLAYS.scoop.reach) {
      const batter = scoop(x);
      const root = batter.root.position;
      batter.update(SCOOP_CONTACT_MS);
      const contact = batter.inspect();
      const toe0 = new Vector3(...contact.batUp).negate();
      // Out in front and climbing, the face still mostly to the sky.
      batter.update(SCOOP_CLOCK.through);
      const through = batter.inspect();
      expect(through.bladeTip[2] - root.z, `x=${x} toe in front`).toBeGreaterThan(through.grip[2] + .5);
      expect(through.batFace[1], `x=${x} face up`).toBeGreaterThan(.8);
      // One turn about the line of the shoulders: the face goes where the toe was.
      batter.update(SCOOP_CLOCK.carry);
      expect(new Vector3(...batter.inspect().batFace).dot(toe0), `x=${x} face led`).toBeLessThan(-.5);
      // Upright in front of the front shoulder, the hands at his chin.
      batter.update(SCOOP_CLOCK.finish + 40);
      const finish = batter.inspect();
      expect(finish.batUp[1], `x=${x} upright`).toBeLessThan(-.9);
      expect(finish.bladeTip[1], `x=${x} toe up`).toBeGreaterThan(finish.grip[1] + .6);
      expect(finish.grip[1] - finish.chest[1], `x=${x} hands at the chin`).toBeGreaterThan(0);
      expect(finish.grip[1] - finish.chest[1], `x=${x} not over the head`).toBeLessThan(.3);
      expect(finish.grip[2] - finish.chest[2], `x=${x} in front of him`).toBeGreaterThan(.2);
      expect(finish.grip[0] - finish.chest[0], `x=${x} on the leg side`).toBeLessThan(-.1);
      expect(finish.hip[1], `x=${x} still low`).toBeLessThan(.90);
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
  /** How far a knee is bent, in degrees: nothing for a leg held straight. */
  const bend = (batter: Batter, leg: number) => {
    const { cap, knee, shoe } = (batter as unknown as { legs: { cap: Object3D; knee: Object3D; shoe: Object3D }[] }).legs[leg];
    return 180 - cap.position.clone().sub(knee.position).angleTo(shoe.position.clone().sub(knee.position)) * 180 / Math.PI;
  };
  it('takes the bat up the leg side like a left-hander, the hands out in front of him, while the front foot strides out long to the off', () => {
    const guard = new Batter().inspect();
    for (const x of PLAYS.reverse.reach) {
      const batter = reverse(x);
      const root = batter.root.position;
      batter.update(REVERSE_CLOCK.lift);
      const lift = batter.inspect();
      // Upright, the toe up and leaning out over the leg side, the hands out in
      // front of him on that side — not tucked in under the front arm.
      expect(lift.bladeTip[1], `x=${x} toe up`).toBeGreaterThan(lift.grip[1] + .6);
      expect(lift.bladeTip[0] - root.x, `x=${x} toe to leg`).toBeLessThan(lift.grip[0] - .15);
      expect(lift.grip[0] - lift.chest[0], `x=${x} hands on the leg side`).toBeLessThan(-.1);
      for (const forward of lift.handsForward) expect(forward, `x=${x} hands out in front`).toBeGreaterThan(.25);
      // The stride is taken: out to the off and forward, and planted.
      expect(lift.frontFoot[0] - guard.frontFoot[0], `x=${x} out to the off`).toBeGreaterThan(.55);
      expect(lift.frontFoot[2] - guard.frontFoot[2], `x=${x} and forward`).toBeGreaterThan(.1);
      // And the front leg stays long from the ball to the end of the hold.
      for (let time = REVERSE_CONTACT_MS; time <= REVERSE_CLOCK.hold; time += 10) {
        batter.update(time);
        expect(bend(batter, 0), `x=${x} front knee @${time}ms`).toBeLessThan(38);
        batter.inspect().frontFoot.forEach((v, i) => expect(v, `x=${x} planted @${time}ms`).toBeCloseTo(lift.frontFoot[i], 6));
      }
    }
  });
  it('climbs up the off side after the ball to stand upright out in front of him, face to the keeper, held on the knee, and comes home', () => {
    for (const x of PLAYS.reverse.reach) {
      const batter = reverse(x);
      const root = batter.root.position;
      // Out to the off and climbing the way it was going.
      batter.update(REVERSE_CLOCK.through);
      const through = batter.inspect();
      expect(through.bladeTip[0] - root.x, `x=${x} toe out to the off`).toBeGreaterThan(through.grip[0] + .45);
      expect(through.bladeTip[1], `x=${x} climbing`).toBeGreaterThan(through.grip[1] + .2);
      // Upright out in front of him at chest height, the arms long towards the
      // off and the face to the keeper, still down on the knee; and no
      // higher, never over the top.
      let highest = 0;
      for (let time = REVERSE_CONTACT_MS; time <= REVERSE_CLOCK.hold; time += 4) { batter.update(time); highest = Math.max(highest, batter.inspect().bladeTip[1]); }
      expect(highest, `x=${x} never over the top`).toBeLessThan(1.95);
      batter.update(REVERSE_CLOCK.finish + 40);
      const finish = batter.inspect();
      expect(finish.batUp[1], `x=${x} upright`).toBeLessThan(-.9);
      expect(finish.bladeTip[1], `x=${x} toe up`).toBeGreaterThan(finish.grip[1] + .7);
      expect(finish.grip[1] - finish.chest[1], `x=${x} at chest height`).toBeGreaterThan(-.05);
      expect(finish.grip[1] - finish.chest[1], `x=${x} not at the helmet`).toBeLessThan(.2);
      expect(finish.grip[0] - finish.chest[0], `x=${x} out towards the off`).toBeGreaterThan(.35);
      expect(finish.batFace[2], `x=${x} face to the keeper`).toBeLessThan(-.9);
      expect(finish.knees[1][1], `x=${x} on the knee`).toBeLessThan(.16);
      for (const forward of finish.handsForward) expect(forward, `x=${x} arms long`).toBeGreaterThan(.45);
      // The bat swings into the ball without turning in his hands at all: the
      // swing brings the face round. After the ball the forearms roll it over
      // to the keeper, one way and evenly, never in a flick, and home again.
      let previous = batter.bat.quaternion.clone();
      batter.update(0); previous = batter.bat.quaternion.clone();
      for (let time = 4; time <= STROKE_DURATION_MS; time += 4) {
        batter.update(time);
        const step = previous.clone().invert().multiply(batter.bat.quaternion);
        const twist = Math.abs(2 * Math.atan2(step.y, step.w));
        const turn = Math.min(twist, Math.PI * 2 - twist) / .004 * 180 / Math.PI;
        expect(turn, `x=${x} @${time}ms`).toBeLessThan(time <= REVERSE_CONTACT_MS ? 100 : 800);
        previous = batter.bat.quaternion.clone();
      }
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

/**
 * The hundred: turned to the camera, the bat up beside his head in his right
 * hand and his left fist punching the sky, two pumps, and both hands back on
 * the bat into his guard. It is not a stroke, so none of the stroke tables
 * above reach it, and every rule they hold a stroke to is held here instead —
 * bar the one it exists to break, that both hands stay on the handle.
 */
describe('the hundred', () => {
  const celebrating = () => { const batter = new Batter(); batter.update(0); batter.celebrate(0); return batter; };
  const apart = (pose: ReturnType<Batter['inspect']>) => new Vector3(...pose.hands[0]).distanceTo(new Vector3(...pose.hands[1]));
  const helmet = (pose: ReturnType<Batter['inspect']>) => {
    const chest = new Vector3(...pose.chest), spine = chest.clone().sub(new Vector3(...pose.hip)).normalize();
    return chest.addScaledVector(spine, .31).add(new Vector3(.01, .01, .025));
  };

  it('keeps the bat in his right hand, and both arms whole', () => {
    const batter = celebrating();
    for (let time = 0; time <= CELEBRATION_MS; time += 8) {
      batter.update(time);
      const pose = batter.inspect();
      expect(pose.handGrip[1], `bat hand on the handle at ${time}ms`).toBeCloseTo(-.035, 9);
      for (const [upper, lower] of pose.armLengths) {
        expect(upper, `${time}ms`).toBeCloseTo(.32, 3);
        expect(lower, `${time}ms`).toBeLessThan(.345);
      }
    }
  });

  it('lets go with his left and punches the sky, the bat up beside his head', () => {
    const batter = celebrating();
    for (const time of [390, 690, 990]) {
      batter.update(time);
      const pose = batter.inspect();
      expect(apart(pose), `hands apart at ${time}ms`).toBeGreaterThan(.40);
      expect(pose.hands[0][1], `fist above the helmet at ${time}ms`).toBeGreaterThan(helmet(pose).y + .25);
      expect(pose.bladeTip[1] - pose.grip[1], `blade up at ${time}ms`).toBeGreaterThan(.6);
      expect(pose.grip[1], `bat hand up by his head at ${time}ms`).toBeGreaterThan(1.6);
    }
  });

  it('keeps the punching arm off the helmet', () => {
    const batter = celebrating();
    for (let time = 0; time <= CELEBRATION_MS; time += 4) {
      batter.update(time);
      const pose = batter.inspect(), head = helmet(pose);
      if (apart(pose) < .2) continue;
      for (const point of [pose.elbows[0], pose.hands[0]])
        expect(new Vector3(...point).distanceTo(head), `at ${time}ms`).toBeGreaterThan(.26);
    }
  });

  it('takes the bat in both hands again before he settles', () => {
    const batter = celebrating();
    for (let time = 1130; time <= CELEBRATION_MS; time += 16) {
      batter.update(time);
      expect(apart(batter.inspect()), `${time}ms`).toBeCloseTo(.110, 6);
    }
  });

  it('does not flip an elbow or wrist between frames, going up or coming down', () => {
    const batter = celebrating();
    let previous = batter.inspect();
    for (let time = 0; time <= CELEBRATION_MS + 32; time += 2) {
      batter.update(time); const pose = batter.inspect();
      for (let i = 0; i < 2; i++) {
        const where = `arm=${i} @${time}`;
        expect(new Vector3(...pose.elbows[i]).distanceTo(new Vector3(...previous.elbows[i])), where).toBeLessThan(.032);
        expect(new Quaternion(...pose.gripRotation[i]).angleTo(new Quaternion(...previous.gripRotation[i])), where).toBeLessThan(.30);
        expect(pose.cuffAim[i].socketError, where).toBeLessThan(1e-9);
        expect(pose.cuffAim[i].flex, where).toBeLessThan(Math.PI / 2);
        expect(pose.elbowCoverage[i], where).toBeGreaterThan(0);
      }
      previous = pose;
    }
  });

  it('never puts the bat through him, or an elbow into him', () => {
    const { worst, elbow } = throughHim(celebrating(), CELEBRATION_MS);
    expect(worst.value, `reaches ${worst.value.toFixed(2)} into the ${worst.part} at ${worst.at}ms`).toBeGreaterThan(1);
    expect(elbow.clearance, JSON.stringify(elbow)).toBeGreaterThan(.15);
  });

  it('is over in a second and a half, and ends in his guard', () => {
    expect(CELEBRATION_MS).toBeLessThanOrEqual(1600);
    const batter = celebrating(), fresh = new Batter(); fresh.update(0);
    batter.update(CELEBRATION_MS);
    const done = batter.inspect(), guard = fresh.inspect();
    for (const key of ['grip', 'frontFoot', 'backFoot', 'hip', 'chest'] as const) {
      done[key].forEach((v, i) => expect(v, key).toBeCloseTo(guard[key][i], 6));
    }
    expect(done.hands).toEqual(guard.hands);
  });
});

/**
 * The fifty: the hundred's gesture, half of it. The bat up beside his head in
 * his right hand, the left down by his side, and back in his guard in a
 * little over a second. The same rules as the hundred.
 */
describe('the fifty', () => {
  const nodding = () => { const batter = new Batter(); batter.update(0); batter.celebrate(0, 'fifty'); return batter; };
  const apart = (pose: ReturnType<Batter['inspect']>) => new Vector3(...pose.hands[0]).distanceTo(new Vector3(...pose.hands[1]));

  it('keeps the bat in his right hand, and both arms whole', () => {
    const batter = nodding();
    for (let time = 0; time <= FIFTY_MS; time += 8) {
      batter.update(time);
      const pose = batter.inspect();
      expect(pose.handGrip[1], `${time}ms`).toBeCloseTo(-.035, 9);
      for (const [upper, lower] of pose.armLengths) {
        expect(upper, `${time}ms`).toBeCloseTo(.32, 3);
        expect(lower, `${time}ms`).toBeLessThan(.345);
      }
    }
  });

  it('puts the bat up beside his head, the left hand down by his side', () => {
    const batter = nodding();
    for (const time of [360, 600]) {
      batter.update(time);
      const pose = batter.inspect();
      expect(pose.grip[1], `bat hand up at ${time}ms`).toBeGreaterThan(1.55);
      expect(pose.bladeTip[1] - pose.grip[1], `blade up at ${time}ms`).toBeGreaterThan(.6);
      expect(apart(pose), `hands apart at ${time}ms`).toBeGreaterThan(.6);
      expect(pose.hands[0][1], `left hand down at ${time}ms`).toBeLessThan(pose.hip[1] + .15);
    }
  });

  it('does not flip an elbow or wrist between frames', () => {
    const batter = nodding();
    let previous = batter.inspect();
    for (let time = 0; time <= FIFTY_MS + 32; time += 2) {
      batter.update(time); const pose = batter.inspect();
      for (let i = 0; i < 2; i++) {
        const where = `arm=${i} @${time}`;
        expect(new Vector3(...pose.elbows[i]).distanceTo(new Vector3(...previous.elbows[i])), where).toBeLessThan(.032);
        expect(new Quaternion(...pose.gripRotation[i]).angleTo(new Quaternion(...previous.gripRotation[i])), where).toBeLessThan(.30);
        expect(pose.cuffAim[i].flex, where).toBeLessThan(Math.PI / 2);
        expect(pose.elbowCoverage[i], where).toBeGreaterThan(0);
      }
      previous = pose;
    }
  });

  it('never puts the bat through him, or an elbow into him', () => {
    const { worst, elbow } = throughHim(nodding(), FIFTY_MS);
    expect(worst.value, `reaches ${worst.value.toFixed(2)} into the ${worst.part} at ${worst.at}ms`).toBeGreaterThan(1);
    expect(elbow.clearance, JSON.stringify(elbow)).toBeGreaterThan(.15);
  });

  it('is shorter than the hundred, and ends in his guard', () => {
    expect(FIFTY_MS).toBeLessThan(CELEBRATION_MS);
    const batter = nodding(), fresh = new Batter(); fresh.update(0);
    batter.update(FIFTY_MS);
    const done = batter.inspect(), guard = fresh.inspect();
    for (const key of ['grip', 'frontFoot', 'backFoot', 'hip', 'chest'] as const) {
      done[key].forEach((v, i) => expect(v, key).toBeCloseTo(guard[key][i], 6));
    }
    expect(done.hands).toEqual(guard.hands);
  });
});

/**
 * The Marathon's three big ones — a double, a triple, four hundred — each a
 * pose of its own: the double biceps, the bat stood up in his right fist;
 * arms flung wide, the bat out along the arm; the champion, bat straight up
 * and the left fist pumped down. The hundred's rules hold for all three, and
 * each has its own shape to answer for.
 */
describe.each([['double', 2360], ['triple', 2400], ['four', 2760]] as const)('the %s', (kind, lasts) => {
  const celebrating = () => { const batter = new Batter(); batter.update(0); batter.celebrate(0, kind); return batter; };
  const apart = (pose: ReturnType<Batter['inspect']>) => new Vector3(...pose.hands[0]).distanceTo(new Vector3(...pose.hands[1]));
  const helmet = (pose: ReturnType<Batter['inspect']>) => {
    const chest = new Vector3(...pose.chest), spine = chest.clone().sub(new Vector3(...pose.hip)).normalize();
    return chest.addScaledVector(spine, .31).add(new Vector3(.01, .01, .025));
  };

  it('lasts as long as it says, and ends in his guard', () => {
    expect(CELEBRATION_LENGTHS[kind]).toBe(lasts);
    const batter = celebrating(), fresh = new Batter(); fresh.update(0);
    batter.update(lasts);
    const done = batter.inspect(), guard = fresh.inspect();
    for (const key of ['grip', 'frontFoot', 'backFoot', 'hip', 'chest'] as const) {
      done[key].forEach((v, i) => expect(v, key).toBeCloseTo(guard[key][i], 6));
    }
    expect(done.hands).toEqual(guard.hands);
  });

  it('keeps the bat in his right hand, and both arms whole', () => {
    const batter = celebrating();
    for (let time = 0; time <= lasts; time += 8) {
      batter.update(time);
      const pose = batter.inspect();
      expect(pose.handGrip[1], `bat hand on the handle at ${time}ms`).toBeCloseTo(-.035, 9);
      for (const [upper, lower] of pose.armLengths) {
        expect(upper, `${time}ms`).toBeCloseTo(.32, 3);
        expect(lower, `${time}ms`).toBeLessThan(.345);
      }
    }
  });

  it('does not flip an elbow or wrist between frames', () => {
    const batter = celebrating();
    let previous = batter.inspect();
    for (let time = 0; time <= lasts + 32; time += 2) {
      batter.update(time); const pose = batter.inspect();
      for (let i = 0; i < 2; i++) {
        const where = `arm=${i} @${time}`;
        expect(new Vector3(...pose.elbows[i]).distanceTo(new Vector3(...previous.elbows[i])), where).toBeLessThan(.032);
        expect(new Quaternion(...pose.gripRotation[i]).angleTo(new Quaternion(...previous.gripRotation[i])), where).toBeLessThan(.30);
        expect(pose.cuffAim[i].socketError, where).toBeLessThan(1e-9);
        expect(pose.cuffAim[i].flex, where).toBeLessThan(Math.PI / 2);
        expect(pose.elbowCoverage[i], where).toBeGreaterThan(0);
      }
      previous = pose;
    }
  });

  it('never puts the bat through him, or an elbow into him', () => {
    const { worst, elbow } = throughHim(celebrating(), lasts);
    expect(worst.value, `reaches ${worst.value.toFixed(2)} into the ${worst.part} at ${worst.at}ms`).toBeGreaterThan(1);
    expect(elbow.clearance, JSON.stringify(elbow)).toBeGreaterThan(.15);
  });

  it('keeps every foot on or above the turf', () => {
    const batter = celebrating();
    for (let time = 0; time <= lasts; time += 16) {
      batter.update(time);
      const pose = batter.inspect();
      for (const foot of [pose.frontFoot, pose.backFoot]) expect(foot[1], `${time}ms`).toBeGreaterThan(.02);
    }
  });

  if (kind === 'double') it('flexes both arms, fists by the helmet and elbows out, the bat stood up', () => {
    const batter = celebrating();
    for (const time of [560, 840, 1400, 1640]) {
      batter.update(time);
      const pose = batter.inspect(), head = helmet(pose);
      for (let i = 0; i < 2; i++) {
        const hand = pose.hands[i], elbow = pose.elbows[i];
        // Forearms upright off elbows at the shoulders puts the fists level with the top of his head.
        expect(hand[1] - head.y, `fist ${i} up beside the helmet at ${time}ms`).toBeGreaterThan(-.05);
        expect(hand[1] - head.y, `and not reaching over it at ${time}ms`).toBeLessThan(.28);
        expect(hand[1] - elbow[1], `forearm ${i} up from the elbow at ${time}ms`).toBeGreaterThan(.18);
        expect(Math.abs(elbow[1] - pose.chest[1] - .12), `elbow ${i} at shoulder height at ${time}ms`).toBeLessThan(.12);
      }
      expect(apart(pose), `fists apart at ${time}ms`).toBeGreaterThan(.5);
      expect(pose.bladeTip[1], `the toe to the sky at ${time}ms`).toBeGreaterThan(pose.grip[1] + .6);
    }
  });

  if (kind === 'triple') it('flings both arms wide, a little above the shoulders, the bat out along the arm', () => {
    const batter = celebrating();
    for (const time of [640, 1150, 1600]) {
      batter.update(time);
      const pose = batter.inspect();
      expect(apart(pose), `arms wide at ${time}ms`).toBeGreaterThan(.95);
      for (const hand of pose.hands) {
        const above = hand[1] - pose.chest[1];
        expect(above, `hand up at the shoulders at ${time}ms`).toBeGreaterThan(.1);
        expect(above, `and not over his head at ${time}ms`).toBeLessThan(.45);
      }
      expect(pose.bladeTip[1] - pose.grip[1], `blade along the arm at ${time}ms`).toBeGreaterThan(-.05);
      expect(pose.bladeTip[1] - pose.grip[1], `and not stood up at ${time}ms`).toBeLessThan(.45);
    }
  });

  if (kind === 'four') it('stands wide, the bat straight up at full stretch and the left fist pumped down', () => {
    const batter = celebrating();
    for (const time of [520, 760, 980, 1420, 1960]) {
      batter.update(time);
      const pose = batter.inspect(), head = helmet(pose);
      expect(Math.abs(pose.frontFoot[0] - pose.backFoot[0]) + Math.abs(pose.frontFoot[2] - pose.backFoot[2]), `feet wide at ${time}ms`).toBeGreaterThan(.5);
      expect(pose.hands[1][1], `bat hand high over the helmet at ${time}ms`).toBeGreaterThan(head.y + .3);
      expect(pose.bladeTip[1], `the toe to the sky at ${time}ms`).toBeGreaterThan(pose.grip[1] + .7);
      expect(pose.hands[0][1], `left fist down by the hip at ${time}ms`).toBeLessThan(pose.chest[1] - .1);
    }
});
});

/**
 * The hook, held to a net session filmed end on in slow motion: met well away
 * from him with the arms straight, swung round flat with them still long, the
 * bat never spun in his hands, the wrap held, and home without a jump. The
 * first build kept the hands at his chest and turned the bat on its handle.
 */
describe('the hook', () => {
  const hooked = (x = .28) => {
    const batter = new Batter(); batter.prepare(1); batter.update(0);
    batter.swing('HOOK', 0, x, 1.134, GAME.contactZ + HOOK_MEETS_AT);
    return batter;
  };
  const reach = (batter: Batter) => {
    const pose = batter.inspect();
    return Math.min(...[0, 1].map(i => new Vector3(...pose.shoulders[i]).distanceTo(new Vector3(...pose.wrists[i]))));
  };
  it('meets the ball out in front and towards off with both arms straight, on the middle of the bat', () => {
    for (const x of [.14, .28, .42]) {
      const batter = hooked(x); batter.update(HOOK_CONTACT_MS); batter.root.updateMatrixWorld(true);
      expect(reach(batter), `x=${x}`).toBeGreaterThan(.56);
      const middle = batter.bat.localToWorld(new Vector3(0, -.44, 0));
      expect(middle.distanceTo(new Vector3(x, 1.134, GAME.contactZ + HOOK_MEETS_AT)), `x=${x}`).toBeLessThan(.02);
      const pose = batter.inspect(), hands = new Vector3(...pose.hands[0]).sub(batter.root.position);
      expect(hands.z - pose.chest[2], `x=${x} hands in front of the chest`).toBeGreaterThan(.4);
    }
  });
  it('swings it round flat, out in front and then to leg, with the arms still long', () => {
    for (const time of [255, 315]) {
      const batter = hooked(); batter.update(time); batter.root.updateMatrixWorld(true);
      expect(reach(batter), `@${time}`).toBeGreaterThan(.5);
      const up = new Vector3(0, 1, 0).applyQuaternion(batter.bat.getWorldQuaternion(new Quaternion()));
      expect(Math.abs(up.y), `@${time} the bat level`).toBeLessThan(.45);
    }
    // Out in front, then to leg: the toe goes round from off to leg.
    const toe = (time: number) => { const b = hooked(); b.update(time); b.root.updateMatrixWorld(true); return b.bat.localToWorld(new Vector3(0, -.8, 0)).sub(b.root.position); };
    expect(toe(HOOK_CONTACT_MS).x).toBeGreaterThan(toe(255).x);
    expect(toe(255).x).toBeGreaterThan(toe(315).x);
  });
  it('never spins the bat in his hands, and wraps it with the back of the blade on the front shoulder', () => {
    const batter = hooked();
    let previous: Quaternion | null = null, worst = { roll: 0, time: 0 };
    for (let time = 0; time <= STROKE_DURATION_MS + HOOK_HOLD_MS; time += 4) {
      batter.update(time); batter.root.updateMatrixWorld(true);
      const q = batter.bat.getWorldQuaternion(new Quaternion());
      if (previous) {
        const up = new Vector3(0, 1, 0).applyQuaternion(q), was = new Vector3(0, 1, 0).applyQuaternion(previous);
        const left = new Quaternion().setFromUnitVectors(was, up).multiply(previous).invert().multiply(q);
        const roll = Math.abs(2 * Math.atan2(left.y, left.w)) * 180 / Math.PI;
        if (Math.min(roll, 360 - roll) > worst.roll) worst = { roll: Math.min(roll, 360 - roll), time };
      }
      previous = q;
    }
    expect(worst.roll, JSON.stringify(worst)).toBeLessThan(5);
    batter.update(520); batter.root.updateMatrixWorld(true);
    const pose = batter.inspect(), face = new Vector3(0, 0, 1).applyQuaternion(batter.bat.getWorldQuaternion(new Quaternion()));
    const away = batter.bat.localToWorld(new Vector3(0, -.45, 0)).sub(batter.root.position).sub(new Vector3(...pose.shoulders[0])).normalize();
    expect(face.dot(away)).toBeGreaterThan(.9);
  });
  it('turns on round on his feet until his back is to the bowler, holds it, then settles back into his guard without a jump', () => {
    const batter = hooked();
    const toeAt = (time: number) => { batter.update(time); batter.root.updateMatrixWorld(true); return batter.bat.localToWorld(new Vector3(0, -.8, 0)); };
    // Square to the leg side on the way, and the feet going round with him:
    // the front foot coming off the turf, the back one pivoting on its toe.
    toeAt(700);
    let pose = batter.inspect();
    expect(pose.yaw).toBeLessThan(-1.5);
    // Then his back to the bowler, held a moment: the front foot over towards
    // off stump and the back one towards leg, the two the other way round
    // from where he hit it.
    toeAt(800); pose = batter.inspect();
    expect(pose.yaw).toBeLessThan(-2.5);
    expect(pose.frontFoot[0]).toBeGreaterThan(pose.backFoot[0] + .25);
    expect(toeAt(850).distanceTo(toeAt(760))).toBeLessThan(.01);
    let last = toeAt(860), fastest = 0;
    for (let time = 864; time <= STROKE_DURATION_MS + HOOK_HOLD_MS; time += 4) { const toe = toeAt(time); fastest = Math.max(fastest, toe.distanceTo(last)); last = toe; }
    expect(fastest).toBeLessThan(.08);
  });
  it('turns round in one movement with the swing: fastest through the ball and slowing all the way', () => {
    const batter = hooked();
    const rates: number[] = [];
    let last = 0;
    for (let time = HOOK_CONTACT_MS; time <= 760; time += 20) {
      batter.update(time); const yaw = batter.inspect().yaw;
      if (time > HOOK_CONTACT_MS) rates.push((last - yaw) / .02);
      last = yaw;
    }
    // Turning to leg the whole way until he stops, never back.
    expect(Math.min(...rates)).toBeGreaterThan(-.05);
    // Past its peak it only slows: nothing stalls at the wrap and then
    // spins again after it, the first build's two movements.
    const peak = rates.indexOf(Math.max(...rates));
    for (let i = peak + 1; i < rates.length; i++) expect(rates[i], `@${HOOK_CONTACT_MS + 20 * (i + 1)}`).toBeLessThanOrEqual(rates[i - 1] + .35);
  });
  it('twirls the bat after one that scores, as after a pull', () => {
    const batter = hooked(); batter.update(HOOK_CONTACT_MS);
    expect(batter.played.pulled).toBe(true);
  });
});

/**
 * The cut off the spinner, from a net session filmed from in front: room made
 * by stepping away to leg, the ball met low and away with the arms long off
 * the back foot, and the bat over his head and down onto the front shoulder.
 */
describe('the cut off the spinner', () => {
  const cut = (x = 0) => {
    const batter = new Batter(); batter.prepare(1); batter.update(0);
    batter.swing('SQUARE_CUT', 0, x, .54, GAME.contactZ, false, false, false, false, 2, true);
    return batter;
  };
  it('makes room for it: the straighter the ball the further he goes to leg, and it is always out on his off side', () => {
    const room = [-.30, 0, .42].map(x => {
      const batter = cut(x); batter.update(SPIN_CUT_CONTACT_MS);
      const pose = batter.inspect();
      return { x, hip: pose.hip[0], gap: x - batter.root.position.x - pose.hip[0], frontFoot: pose.frontFoot, backFoot: pose.backFoot };
    });
    expect(room[0].hip).toBeLessThan(room[1].hip);
    expect(room[1].hip).toBeLessThan(room[2].hip);
    for (const { gap, x } of room) expect(gap, `x=${x}`).toBeGreaterThan(.6);
    // A wide base, off the back foot: the front foot well out to leg.
    for (const { frontFoot, backFoot, x } of room) expect(backFoot[0] - frontFoot[0], `x=${x}`).toBeGreaterThan(.5);
  });
  it('meets it low and away towards off, on the middle of the bat, with the arms long and the weight back', () => {
    for (const x of [-.30, 0, .42]) {
      const batter = cut(x); batter.update(SPIN_CUT_CONTACT_MS); batter.root.updateMatrixWorld(true);
      const middle = batter.bat.localToWorld(new Vector3(0, -.44, 0));
      expect(middle.distanceTo(new Vector3(x, .54, GAME.contactZ)), `x=${x}`).toBeLessThan(.02);
      const pose = batter.inspect();
      const reach = [0, 1].map(i => new Vector3(...pose.shoulders[i]).distanceTo(new Vector3(...pose.wrists[i])));
      expect(Math.min(...reach), `x=${x}`).toBeGreaterThan(.42);
      expect(Math.max(...reach), `x=${x}`).toBeGreaterThan(.58);
      expect(pose.hip[1], `x=${x} sunk on the back leg`).toBeLessThan(.86);
    }
  });
  it('never spins the bat in his hands, and lands it on the front shoulder with the back of the blade to it', () => {
    const batter = cut();
    let previous: Quaternion | null = null, worst = 0;
    for (let time = 0; time <= STROKE_DURATION_MS; time += 4) {
      batter.update(time); batter.root.updateMatrixWorld(true);
      const q = batter.bat.getWorldQuaternion(new Quaternion());
      if (previous) {
        const up = new Vector3(0, 1, 0).applyQuaternion(q), was = new Vector3(0, 1, 0).applyQuaternion(previous);
        const left = new Quaternion().setFromUnitVectors(was, up).multiply(previous).invert().multiply(q);
        const roll = Math.abs(2 * Math.atan2(left.y, left.w)) * 180 / Math.PI;
        worst = Math.max(worst, Math.min(roll, 360 - roll));
      }
      previous = q;
    }
    expect(worst).toBeLessThan(5);
    batter.update(560); batter.root.updateMatrixWorld(true);
    const pose = batter.inspect(), root = batter.root.position;
    // Back past his head onto the front shoulder: the toe on the leg side of
    // him, below the hands, behind his head.
    const toe = batter.bat.localToWorld(new Vector3(0, -.8, 0)).sub(root), hands = new Vector3(...pose.hands[0]).sub(root);
    expect(toe.x).toBeLessThan(pose.chest[0] - .2);
    expect(toe.y).toBeLessThan(hands.y);
    expect(toe.z).toBeLessThan(pose.chest[2]);
    const face = new Vector3(0, 0, 1).applyQuaternion(batter.bat.getWorldQuaternion(new Quaternion()));
    const away = batter.bat.localToWorld(new Vector3(0, -.45, 0)).sub(root).sub(new Vector3(...pose.shoulders[0])).normalize();
    expect(face.dot(away)).toBeGreaterThan(.9);
  });
  it('never takes the hands or the bat over his head: the gloves stop at the peak, in front of his face', () => {
    const batter = cut();
    for (let time = 0; time <= STROKE_DURATION_MS + SPIN_CUT_HOLD_MS; time += 4) {
      batter.update(time); batter.root.updateMatrixWorld(true);
      const pose = batter.inspect(), root = batter.root.position;
      for (const hand of pose.hands) expect(hand[1] - root.y - pose.chest[1], `hand at ${time}ms`).toBeLessThan(.5);
    }
    batter.update(560);
    const pose = batter.inspect(), root = batter.root.position;
    for (const hand of pose.hands) expect(hand[2] - root.z, 'gloves in front of his face').toBeGreaterThan(pose.chest[2] + .2);
  });
  it('holds the bat on the shoulder before it goes home, as the hook does', () => {
    const batter = cut();
    const toeAt = (time: number) => { batter.update(time); batter.root.updateMatrixWorld(true); return batter.bat.localToWorld(new Vector3(0, -.8, 0)); };
    expect(toeAt(560).distanceTo(toeAt(760))).toBeLessThan(.02);
    expect(toeAt(STROKE_DURATION_MS).distanceTo(toeAt(560))).toBeGreaterThan(.2);
    // and still going home after the stroke's own clock, slowed by the hold.
    expect(toeAt(STROKE_DURATION_MS).distanceTo(toeAt(STROKE_DURATION_MS + SPIN_CUT_HOLD_MS * .6))).toBeGreaterThan(.05);
  });
});

describe('the late cut', () => {
  const lateCut = (x = .30) => {
    const batter = new Batter(); batter.prepare(1); batter.update(0);
    play(batter, 'lateCut', x);
    return batter;
  };
  it('goes back and across and down on the back leg, and meets the ball late, beside the back pad', () => {
    for (const x of PLAYS.lateCut.reach) {
      const batter = lateCut(x), guard = new Batter(); guard.prepare(1); guard.update(0);
      const stance = guard.inspect();
      batter.update(LATE_CUT_CONTACT_MS); batter.root.updateMatrixWorld(true);
      const pose = batter.inspect(), root = batter.root.position;
      // The back foot further back than it stood, and across towards off; the front left where it was.
      expect(pose.backFoot[2], `x=${x}`).toBeLessThan(stance.backFoot[2] - .25);
      expect(pose.backFoot[0] - pose.hip[0], `x=${x}`).toBeGreaterThan(stance.backFoot[0] - stance.hip[0]);
      expect(Math.abs(pose.frontFoot[2] - stance.frontFoot[2]), `x=${x}`).toBeLessThan(.05);
      // Sunk low on it.
      expect(pose.hip[1], `x=${x}`).toBeLessThan(.66);
      // The middle of the blade on the ball, which is behind where every other stroke meets it.
      const middle = batter.bat.localToWorld(new Vector3(0, -.44, 0));
      expect(middle.distanceTo(new Vector3(x, .56, GAME.contactZ + LATE_CUT_MEETS_AT)), `x=${x}`).toBeLessThan(.02);
      expect(GAME.contactZ + LATE_CUT_MEETS_AT - root.z).toBeLessThan(0);
    }
  });
  it('lets the blade go on down to the turf behind him and holds it there, then gets up into his guard', () => {
    const batter = lateCut();
    const toeAt = (time: number) => { batter.update(time); batter.root.updateMatrixWorld(true); return batter.bat.localToWorld(new Vector3(0, -.8, 0)); };
    const handsAt = (time: number) => { batter.update(time); return new Vector3(...batter.inspect().hands[0]); };
    // The toe below the hands and behind them: shown the way, not struck through.
    const toe = toeAt(450), hands = handsAt(450);
    expect(toe.y).toBeLessThan(hands.y - .2);
    expect(toe.z).toBeLessThan(hands.z - .2);
    // Held.
    expect(toeAt(400).distanceTo(toeAt(600))).toBeLessThan(.02);
    // And home.
    batter.update(STROKE_DURATION_MS); expect(batter.inspect().hip[1]).toBeGreaterThan(.9);
  });
});
