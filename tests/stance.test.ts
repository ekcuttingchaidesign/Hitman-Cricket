import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { Batter } from '../src/entities/Batter';

/** A batter alive in his guard, whose waits tap (`tap`) or only waggle. */
function waiting(tap: boolean) {
  const batter = new Batter(); batter.alive = true;
  // The rhythm, its phase, and then whether the wait taps.
  const draws = [.4, .2, tap ? 0 : .99]; let i = 0;
  batter.idleRandom = () => draws[Math.min(i++, draws.length - 1)];
  batter.reset();
  return batter;
}
/** Played on a frame's clock from nought to `until`, the bowler running in from `runupFrom` over 840ms. */
function run(batter: Batter, until: number, each: (time: number) => void = () => {}, runupFrom = Infinity) {
  for (let time = 0; time <= until; time += 16) {
    if (time >= runupFrom) batter.runup(Math.min(1, (time - runupFrom) / 840));
    batter.update(time); each(time);
  }
}
const tip = (batter: Batter) => new Vector3(...batter.inspect().bladeTip);
const bat = (batter: Batter) => batter.bat.quaternion.clone();

describe('alive in his guard', () => {
  it('stands still where he is not alive: the previews and the Dressing Room', () => {
    const batter = new Batter(); batter.reset();
    const heights: number[] = [];
    run(batter, 3000, () => heights.push(tip(batter).y));
    expect(Math.max(...heights) - Math.min(...heights)).toBeLessThan(.01);
  });
  it('rocks the bat up and down from the wrists, the hands and the head hardly moving', () => {
    const batter = waiting(false);
    const tips: number[] = [], grips: Vector3[] = [], chests: Vector3[] = [];
    run(batter, 3000, time => {
      if (time < 700) return;
      const pose = batter.inspect();
      tips.push(tip(batter).y); grips.push(new Vector3(...pose.grip)); chests.push(new Vector3(...pose.chest));
    });
    // The toe tips up and down by a hand's breadth or more each way.
    expect(Math.max(...tips) - Math.min(...tips)).toBeGreaterThan(.12);
    const spread = (points: Vector3[]) => Math.max(...points.map(p => p.distanceTo(points[0])));
    expect(spread(grips)).toBeLessThan(.03);
    expect(spread(chests)).toBeLessThan(.012);
    // Never down to the turf on a wait that only waggles.
    expect(Math.min(...tips)).toBeGreaterThan(1);
  });
  it('before some balls lets the bat down to tap the turf behind his back foot twice, and lifts it back', () => {
    const batter = waiting(true);
    const tips: { time: number; y: number; z: number }[] = [];
    let backFoot = 0;
    run(batter, 2400, time => {
      const at = tip(batter);
      tips.push({ time, y: at.y, z: at.z - batter.root.position.z });
      backFoot = batter.inspect().backFoot[2];
      const pose = batter.inspect();
      // His hands stay on the bat and nothing is stretched past its length.
      for (const [, forearm] of pose.armLengths) expect(forearm, `forearm @${time}`).toBeLessThan(.345);
      for (const [, shin] of pose.legLengths) expect(shin, `shin @${time}`).toBeLessThan(.445);
      for (const aim of pose.cuffAim) expect(aim.socketError, `@${time}`).toBeLessThan(1e-9);
    });
    const down = tips.filter(t => t.y < .06);
    expect(down.length, 'on the turf').toBeGreaterThan(20);
    // Behind his back foot.
    for (const t of down) expect(t.z, `@${t.time}`).toBeLessThan(backFoot - .03);
    // Two taps: the toe up off the turf and back down twice while it is there.
    const resting = tips.filter(t => t.y < .03), from = resting[0].time, to = resting[resting.length - 1].time;
    let rises = 0, up = false;
    for (const t of tips.filter(t => t.time >= from && t.time <= to)) {
      if (!up && t.y > .045) { up = true; rises++; }
      if (up && t.y < .03) up = false;
    }
    expect(rises).toBe(2);
    // And back up into his guard.
    expect(tips[tips.length - 1].y).toBeGreaterThan(1.2);
  });
  it('is still by the delivery stride, in the guard every stroke starts from', () => {
    for (const tap of [true, false]) {
      // The bowler sets off as the bat goes down, and as it waggles.
      const batter = waiting(tap);
      const still = new Batter(); still.reset(); still.update(0);
      let worst = 0;
      run(batter, 1900, time => {
        // From two-thirds of the way in, the last third of a second.
        if (time >= 600 + 840 * .68) worst = Math.max(worst, bat(batter).angleTo(bat(still)));
      }, 600);
      expect(worst, `tap=${tap}`).toBeLessThan(.01);
    }
  });
  it('does not begin a tap once the bowler has set off', () => {
    const batter = waiting(true);
    const tips: number[] = [];
    // The bowler sets off just before the tap falls due.
    run(batter, 1800, () => tips.push(tip(batter).y), 432);
    expect(Math.min(...tips)).toBeGreaterThan(1);
  });
  it('waits afresh after each stroke, and a new ball does not interrupt it', () => {
    const batter = waiting(false);
    run(batter, 1200);
    const before = bat(batter);
    // A new ball's run-up begins: he goes on waiting where he was.
    batter.reset(true); batter.update(1216);
    expect(bat(batter).angleTo(before)).toBeLessThan(.05);
  });
});
