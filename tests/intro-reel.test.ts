import { describe, expect, it } from 'vitest';
import { INTRO, introBars, introCamera, introSweep } from '../src/game/IntroReel';
import type { CameraPose } from '../src/game/ShotReel';

const HOME: CameraPose = { eye: [0, 2.9, -5.15], at: [0, 1.05, 9], fov: 50 };

describe('the walk-on', () => {
  it('lands exactly on the game\'s own view, and stays there', () => {
    for (const t of [INTRO.total, INTRO.total + 500]) expect(introCamera(t, HOME)).toEqual(HOME);
  });

  it('moves without a jump: no frame carries the camera further than a stride', () => {
    let last = introCamera(0, HOME);
    for (let t = 16; t <= INTRO.total; t += 16) {
      const now = introCamera(t, HOME);
      expect(Math.hypot(...now.eye.map((v, i) => v - last.eye[i]))).toBeLessThan(.12);
      last = now;
    }
  });

  it('starts at his boots, low, and climbs', () => {
    expect(introCamera(0, HOME).eye[1]).toBeLessThan(.3);
    expect(introCamera(2050, HOME).eye[1]).toBeGreaterThan(1.4);
  });

  it('crosses the bat with the light once, and not otherwise', () => {
    const [from, to] = INTRO.sweep;
    expect(introSweep(from - 1)).toBeNull();
    expect(introSweep(to + 1)).toBeNull();
    let last = -Infinity;
    for (let t = from; t <= to; t += 10) { const at = introSweep(t)!; expect(at).toBeGreaterThanOrEqual(last); last = at; }
  });

  it('draws the bars in and takes them away as it lands', () => {
    expect(introBars(1500)).toBe(1);
    expect(introBars(INTRO.total)).toBe(0);
  });

  it('has him in his guard before the camera lands', () => {
    expect(INTRO.hold < INTRO.look && INTRO.look < INTRO.stand && INTRO.stand < INTRO.guard && INTRO.guard < INTRO.total).toBe(true);
  });
});
