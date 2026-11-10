import { describe, expect, it } from 'vitest';
import { FOLLOW, FollowThrough, type Triple } from '../src/entities/followThrough';
import { Batter, STROKE_CONTACT_MS } from '../src/entities/Batter';
import { GAME } from '../src/config/gameplay';
import type { ShotType } from '../src/game/types';

const dist = (a: readonly number[], b: readonly number[]) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

describe('the follow-through', () => {
  // A trunk that strides forward and stops dead, as a keyed pose does.
  const hip: Triple = [0, .9, 0];
  const chestAt = (t: number): Triple => [0, 1.4, Math.min(1, Math.max(0, t / 120)) * .3];
  const run = (frame = 1000 / 60, until = 1500) => {
    const follow = new FollowThrough(), seen: { t: number; off: number; ahead: number; long: number }[] = [];
    for (let t = -200; t <= until; t += frame) {
      const want = chestAt(t), drawn = follow.step(t, hip, want);
      seen.push({ t, off: dist(drawn.chest, want), ahead: drawn.chest[2] - want[2], long: dist(drawn.chest, drawn.hip) });
    }
    return seen;
  };
  it('lags the trunk into a move, carries it past where it stops, and settles', () => {
    const seen = run();
    expect(Math.min(...seen.filter(s => s.t > 0 && s.t < 120).map(s => s.ahead))).toBeLessThan(-.005);
    expect(Math.max(...seen.filter(s => s.t > 120).map(s => s.ahead))).toBeGreaterThan(.008);
    expect(seen.filter(s => s.t > 1200).every(s => s.off < .001)).toBe(true);
  });
  it('is never more than a few centimetres, and never stretches him', () => {
    const seen = run();
    expect(Math.max(...seen.map(s => s.off))).toBeLessThanOrEqual(FOLLOW.most + .002);
    const long = dist(chestAt(0), hip);
    for (const s of seen) expect(Math.abs(s.long - dist(chestAt(s.t), hip))).toBeLessThan(1e-9), expect(long).toBeGreaterThan(0);
  });
  it('holds at any frame rate, a slow phone\'s included', () => {
    for (const frame of [4, 1000 / 120, 1000 / 30, 50, 100]) {
      const seen = run(frame);
      expect(seen.every(s => Number.isFinite(s.off) && s.off <= FOLLOW.most + .002)).toBe(true);
      expect(seen.filter(s => s.t > 1300).every(s => s.off < .002)).toBe(true);
    }
  });
  it('lets the knees give as the weight comes down, further down than up', () => {
    const follow = new FollowThrough(); let low = 0, high = 0;
    for (let t = -200; t <= 1500; t += 16) {
      const want: Triple = [0, t < 0 ? .9 : .78, 0], drawn = follow.step(t, want, [0, want[1] + .5, 0]);
      low = Math.min(low, drawn.hip[1] - want[1]); high = Math.max(high, drawn.hip[1] - want[1]);
    }
    expect(low).toBeLessThan(-.005);
    expect(low).toBeGreaterThanOrEqual(-FOLLOW.down - 1e-9);
    expect(high).toBeLessThanOrEqual(FOLLOW.up + 1e-9);
  });
  it('starts again at rest after a cut', () => {
    const follow = new FollowThrough();
    for (let t = 0; t < 300; t += 16) follow.step(t, hip, chestAt(t));
    const cut = follow.step(5000, hip, [0, 1.4, -.4]);
    expect(dist(cut.chest, [0, 1.4, -.4])).toBe(0);
    expect(cut.nod).toBe(0);
  });
});

describe('the follow-through on the batter', () => {
  const stroke = (springy: boolean, shot: ShotType) => {
    const batter = new Batter(); batter.springy = springy;
    batter.reset(); batter.update(0);
    for (let t = 16; t < 400; t += 16) batter.update(t);
    batter.swing(shot, 400, 0, .54, GAME.contactZ);
    const frames = [];
    for (let t = 400; t <= 3000; t += 16) { batter.update(t); frames.push(batter.inspect()); }
    return frames;
  };
  for (const shot of ['STRAIGHT', 'COVER_LONG_OFF', 'LEG', 'DEFEND'] as ShotType[]) {
    it(`leaves the ${shot} as drawn to the ball, carries his trunk on after it, and settles`, () => {
      const plain = stroke(false, shot), sprung = stroke(true, shot);
      let most = 0, bat = 0;
      plain.forEach((frame, i) => {
        // The plain batter is drawn where his pose says; the sprung one's pose is still the stroke's own.
        expect(dist(frame.drawnChest, frame.chest)).toBeLessThan(1e-9);
        expect(dist(sprung[i].chest, frame.chest)).toBeLessThan(1e-9);
        // The bat's turn is the stroke's own throughout.
        expect(dist(sprung[i].batFace, frame.batFace)).toBeLessThan(.02);
        const t = i * 16;
        // From a moment into the swing to the ball he is the stroke's, bat and body.
        if (t >= FOLLOW.before && t <= STROKE_CONTACT_MS) {
          expect(dist(sprung[i].drawnChest, frame.drawnChest)).toBeLessThan(1e-9);
          expect(dist(sprung[i].bladeTip, frame.bladeTip)).toBeLessThan(1e-9);
        }
        most = Math.max(most, dist(sprung[i].drawnChest, frame.drawnChest));
        bat = Math.max(bat, dist(sprung[i].bladeContact, frame.bladeContact));
      });
      expect(most).toBeGreaterThan(.008);
      expect(most).toBeLessThanOrEqual(FOLLOW.most + FOLLOW.down + .002);
      // Eased clear of a body that has moved, the bat goes no further than the body did.
      expect(bat).toBeLessThanOrEqual(FOLLOW.most + FOLLOW.down);
      // Back in his guard, he is where the guard has him.
      const last = sprung.length - 1;
      expect(dist(sprung[last].drawnChest, plain[last].drawnChest)).toBeLessThan(.002);
      expect(dist(sprung[last].drawnHip, plain[last].drawnHip)).toBeLessThan(.002);
      expect(dist(sprung[last].bladeTip, plain[last].bladeTip)).toBeLessThan(.002);
    });
  }
});
