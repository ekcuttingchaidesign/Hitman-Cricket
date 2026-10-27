import { describe, expect, it } from 'vitest';
import { BAT, DUEL, FILMS, filmLength, introBars, introCamera, introSweep, nextFilm } from '../src/game/IntroReel';
import type { CameraPose } from '../src/game/ShotReel';

const HOME: CameraPose = { eye: [0, 2.9, -5.15], at: [0, 1.05, 9], fov: 50 };
/** The quick bowler at the top of his mark, over the wicket. */
const MARK = [.34, 0, 23.96] as const;
const at = (film: 'bat' | 'duel', t: number) => introCamera(film, t, HOME, MARK);

describe('the walk-on: the bat', () => {
  it('lands exactly on the game\'s own view, and stays there', () => {
    for (const t of [BAT.total, BAT.total + 500]) expect(at('bat', t)).toEqual(HOME);
  });

  it('opens low by the bat, cuts to low behind him, and cranes up over his shoulders', () => {
    expect(at('bat', 0).eye[1]).toBeLessThan(.5);
    expect(at('bat', BAT.cut).eye[1]).toBeLessThan(1);
    expect(at('bat', BAT.scuffs[1]).eye[1]).toBeGreaterThan(1.8);
  });

  it('runs the light up the bat once, and not otherwise', () => {
    const [from, to] = BAT.sweep;
    expect(introSweep('bat', from - 1)).toBeNull();
    expect(introSweep('bat', to + 1)).toBeNull();
    // Up the blade from its toe, as the camera climbs it.
    let last = Infinity;
    for (let t = from; t <= to; t += 10) { const along = introSweep('bat', t)!; expect(along).toBeLessThanOrEqual(last); last = along; }
  });

  it('crosses the bat before the cut, and has him in his guard before the camera lands', () => {
    expect(BAT.sweep[1] < BAT.cut && BAT.cut < BAT.scuffs[0] && BAT.scuffs[1] < BAT.look - 500
      && BAT.look < BAT.lift && BAT.lift < BAT.guard && BAT.guard < BAT.total).toBe(true);
  });
});

describe('the walk-on: the duel', () => {
  it('has no light across the bat', () => {
    for (let t = 0; t <= DUEL.total; t += 100) expect(introSweep('duel', t)).toBeNull();
  });

  it('opens high above the pitch looking down on both of them, then cuts to the bowler\'s eyes on the batter', () => {
    const above = at('duel', 500), eyes = at('duel', (DUEL.cut + DUEL.total) / 2);
    expect(above.eye[1]).toBeGreaterThan(35);
    // Below the haze, which starts at 48 metres.
    expect(above.eye[1]).toBeLessThan(48);
    // Looking down between them: the batter's mark and the bowler's.
    expect(above.at[2]).toBeCloseTo((1 + MARK[2]) / 2, 5);
    // The bowler's eyes: where he stands, a man's height, looking down the pitch at the batter.
    expect(Math.abs(eyes.eye[2] - MARK[2])).toBeLessThan(.5);
    expect(eyes.eye[1]).toBeGreaterThan(1.5);
    expect(eyes.eye[1]).toBeLessThan(2);
    expect(eyes.at[2]).toBeLessThan(2);
  });

  it('never brings the camera near the batter: the figures do not hold up close to', () => {
    for (let t = 0; t < DUEL.total; t += 100) {
      const { eye } = at('duel', t);
      expect(Math.hypot(eye[0] + .36, eye[1] - 1, eye[2] - 1)).toBeGreaterThan(15);
    }
  });

  it('sees him through the bowler\'s eyes as big as he is from there: no zoom, a slow pan left to right', () => {
    for (const side of [1, -1]) {
      const look = (t: number) => introCamera('duel', t, HOME, MARK, side);
      expect(look(DUEL.cut + 50).fov).toBe(look(DUEL.total - 50).fov);
      expect(look(DUEL.cut + 50).fov).toBeGreaterThan(30);
      // Left to right on the screen, whichever way the stage is mirrored: the screen's x is the stage's times `side`.
      let last = -Infinity;
      for (let t = DUEL.cut + 50; t < DUEL.total; t += 100) {
        const x = look(t).at[0] * side;
        expect(x).toBeGreaterThan(last);
        last = x;
      }
    }
  });

  it('has the batter scuff, look up, and settle into his guard before the cut to the game', () => {
    expect(DUEL.cut < DUEL.scuffs[0] && DUEL.scuffs[1] < DUEL.look - 500 && DUEL.look < DUEL.lift
      && DUEL.lift < DUEL.guard && DUEL.guard < DUEL.total).toBe(true);
  });

  it('follows the bowler to wherever his mark is', () => {
    const round = [-.36, 0, 22] as const;
    expect(introCamera('duel', DUEL.total - 50, HOME, round).eye[0]).toBeCloseTo(round[0], 1);
    expect(introCamera('duel', DUEL.total - 50, HOME, round).eye[2]).toBeCloseTo(round[2] - .35, 5);
  });
});

describe('the walk-on: both films', () => {
  it('move slowly: never faster than a crane, three and a half metres a second, but at a cut', () => {
    const cuts = { bat: [BAT.cut], duel: [DUEL.cut] };
    for (const film of FILMS) {
      let last = at(film, 0);
      for (let t = 16; t <= filmLength(film); t += 16) {
        const now = at(film, t);
        if (!cuts[film].some(cut => t - 16 < cut && t >= cut)) expect(Math.hypot(...now.eye.map((v, i) => v - last.eye[i])) / .016).toBeLessThan(3.5);
        last = now;
      }
    }
  });

  it('draw the bars in, and take them away as they end', () => {
    for (const film of FILMS) {
      expect(introBars(film, 1500)).toBe(1);
      expect(introBars(film, filmLength(film))).toBe(0);
    }
  });

  it('take turns: never the same film twice running, and the first one either', () => {
    expect(nextFilm('bat', .1)).toBe('duel');
    expect(nextFilm('duel', .9)).toBe('bat');
    expect(nextFilm(null, .1)).toBe('bat');
    expect(nextFilm(null, .9)).toBe('duel');
  });
});
