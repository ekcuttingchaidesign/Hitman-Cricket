import { describe, expect, it } from 'vitest';
import { INTRO, introBars, introCamera, introSweep } from '../src/game/IntroReel';
import type { CameraPose } from '../src/game/ShotReel';

const HOME: CameraPose = { eye: [0, 2.9, -5.15], at: [0, 1.05, 9], fov: 50 };

describe('the walk-on', () => {
  it('lands exactly on the game\'s own view, and stays there', () => {
    for (const t of [INTRO.total, INTRO.total + 500]) expect(introCamera(t, HOME)).toEqual(HOME);
  });

  it('moves slowly: never faster than a crane, three and a half metres a second, but at the cut', () => {
    let last = introCamera(0, HOME);
    for (let t = 16; t <= INTRO.total; t += 16) {
      const now = introCamera(t, HOME);
      // The one cut, to behind him, is the only jump.
      if (t - 16 < INTRO.cut && t >= INTRO.cut) { last = now; continue; }
      expect(Math.hypot(...now.eye.map((v, i) => v - last.eye[i])) / .016).toBeLessThan(3.5);
      last = now;
    }
  });

  it('opens low by the bat, cuts to low behind him, and cranes up over his shoulders', () => {
    expect(introCamera(0, HOME).eye[1]).toBeLessThan(.5);
    expect(introCamera(INTRO.cut, HOME).eye[1]).toBeLessThan(1);
    expect(introCamera(INTRO.scuffs[1], HOME).eye[1]).toBeGreaterThan(1.8);
  });

  it('runs the light up the bat once, and not otherwise', () => {
    const [from, to] = INTRO.sweep;
    expect(introSweep(from - 1)).toBeNull();
    expect(introSweep(to + 1)).toBeNull();
    // Up the blade from its toe, as the camera climbs it.
    let last = Infinity;
    for (let t = from; t <= to; t += 10) { const at = introSweep(t)!; expect(at).toBeLessThanOrEqual(last); last = at; }
  });

  it('draws the bars in and takes them away as it lands', () => {
    expect(introBars(1500)).toBe(1);
    expect(introBars(INTRO.total)).toBe(0);
  });

  it('crosses the bat before the cut, and has him in his guard before the camera lands', () => {
    expect(INTRO.sweep[1] < INTRO.cut && INTRO.cut < INTRO.scuffs[0] && INTRO.scuffs[1] < INTRO.look - 500
      && INTRO.look < INTRO.lift && INTRO.lift < INTRO.guard && INTRO.guard < INTRO.total).toBe(true);
  });
});
