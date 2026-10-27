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

  it('starts behind the bowler looking past him at the batter, reverses on the batter, and ends side on to the bowler', () => {
    const over = at('duel', 500), reverse = at('duel', (DUEL.cut + DUEL.back) / 2), side = at('duel', DUEL.total - 50);
    // Over his shoulder: behind him, close, looking down the pitch.
    expect(over.eye[2]).toBeGreaterThan(MARK[2]);
    expect(over.eye[2] - MARK[2]).toBeLessThan(3);
    expect(over.at[2]).toBeLessThan(2);
    // The batter on a long lens from the bowler's end.
    expect(reverse.eye[2]).toBeGreaterThan(MARK[2]);
    expect(reverse.at[2]).toBeLessThan(2);
    expect(reverse.fov).toBeLessThan(8);
    // Side on to him: level with his mark, out to the side, looking at him.
    expect(Math.abs(side.eye[2] - MARK[2])).toBeLessThan(1);
    expect(Math.abs(side.eye[0] - MARK[0])).toBeGreaterThan(2);
    expect(Math.abs(side.at[2] - MARK[2])).toBeLessThan(1);
  });

  it('never stands in front of the bowler, where his plain face would fill the lens', () => {
    for (let t = 0; t < DUEL.total; t += 100) {
      const { eye } = at('duel', t);
      // Between him and the batter, close to him, is in front of him.
      expect(eye[2] < MARK[2] - 1 && eye[2] > MARK[2] - 8).toBe(false);
    }
  });

  it('has the bowler look up before the first cut, the batter tap in the reverse, and the bowler go in the last shot', () => {
    expect(DUEL.look < DUEL.cut && DUEL.cut < DUEL.tap && DUEL.tap < DUEL.back && DUEL.back < DUEL.set && DUEL.set < DUEL.total).toBe(true);
  });

  it('follows the bowler to wherever his mark is', () => {
    const round = [-.36, 0, 22] as const;
    expect(introCamera('duel', DUEL.total - 50, HOME, round).at[0]).toBeCloseTo(round[0], 5);
    expect(introCamera('duel', 500, HOME, round).eye[2]).toBeGreaterThan(round[2]);
  });
});

describe('the walk-on: both films', () => {
  it('move slowly: never faster than a crane, three and a half metres a second, but at a cut', () => {
    const cuts = { bat: [BAT.cut], duel: [DUEL.cut, DUEL.back] };
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
