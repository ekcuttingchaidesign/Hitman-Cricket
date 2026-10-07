import { describe, expect, it } from 'vitest';
import { afterBall, AFTER_BALL_CHANCE, outNearMilestone } from '../src/game/afterBall';
import type { PlayedStroke } from '../src/entities/Batter';
import type { ShotOutcome, ShotType } from '../src/game/types';

const stroke = (shot: ShotType, more: Partial<PlayedStroke> = {}): PlayedStroke =>
  ({ shot, charging: false, lofted: false, swept: false, pulled: false, ...more });
const scored = { scored: true, beaten: false, wicket: false, milestone: false };
const lucky = 0, unlucky = AFTER_BALL_CHANCE;

describe('what the batter does once the ball is done with', () => {
  it('suits the stroke', () => {
    for (const shot of ['STRAIGHT', 'COVER_LONG_OFF', 'LONG_ON'] as ShotType[]) {
      expect(afterBall(stroke(shot), scored, null, lucky)).toBe('admire');
      // The same drives lofted, and only those, are watched.
      expect(afterBall(stroke(shot, { lofted: true }), scored, null, lucky)).toBe('watch');
    }
    expect(afterBall(stroke('LEG', { pulled: true }), scored, null, lucky)).toBe('twirl');
    expect(afterBall(stroke('LEG', { swept: true }), scored, null, lucky)).toBe('brush');
    expect(afterBall(stroke('SCOOP'), scored, null, lucky)).toBe('brush');
    expect(afterBall(stroke('REVERSE_SCOOP'), scored, null, lucky)).toBe('brush');
  });

  it('beaten driving or blocking: the stroke rehearsed, or the pitch scrubbed', () => {
    const beaten = { ...scored, scored: false, beaten: true };
    for (const shot of ['STRAIGHT', 'COVER_LONG_OFF', 'LONG_ON', 'DEFEND'] as ShotType[]) {
      expect(afterBall(stroke(shot), beaten, null, 0)).toBe('shadow');
      expect(afterBall(stroke(shot), beaten, null, AFTER_BALL_CHANCE * .75)).toBe('scrub');
      // Never the one he did last: the other instead.
      expect(afterBall(stroke(shot), beaten, 'shadow', 0)).toBe('scrub');
      expect(afterBall(stroke(shot), beaten, 'scrub', AFTER_BALL_CHANCE * .75)).toBe('shadow');
    }
    // Not after the cross-batted strokes.
    for (const shot of ['SQUARE_CUT', 'LEG', 'SCOOP'] as ShotType[]) expect(afterBall(stroke(shot), beaten, null, 0)).toBeNull();
  });

  it('does nothing for the rest', () => {
    // The cut, the flick, a dot off a drive, a block that scored, a lofted flick.
    expect(afterBall(stroke('SQUARE_CUT'), scored, null, lucky)).toBeNull();
    expect(afterBall(stroke('LEG'), scored, null, lucky)).toBeNull();
    expect(afterBall(stroke('STRAIGHT'), { ...scored, scored: false }, null, lucky)).toBeNull();
    expect(afterBall(stroke('DEFEND'), scored, null, lucky)).toBeNull();
    expect(afterBall(stroke('LEG', { lofted: true }), scored, null, lucky)).toBeNull();
  });

  it('never after a charge, a wicket or before a milestone', () => {
    expect(afterBall(stroke('STRAIGHT', { charging: true }), scored, null, lucky)).toBeNull();
    expect(afterBall(stroke('STRAIGHT'), { ...scored, wicket: true }, null, lucky)).toBeNull();
    expect(afterBall(stroke('STRAIGHT'), { ...scored, milestone: true }, null, lucky)).toBeNull();
    expect(afterBall(null, scored, null, lucky)).toBeNull();
  });

  it('on half the balls that call for one, and never the same twice running', () => {
    expect(afterBall(stroke('STRAIGHT'), scored, null, unlucky)).toBeNull();
    expect(afterBall(stroke('STRAIGHT'), scored, 'admire', lucky)).toBeNull();
    expect(afterBall(stroke('STRAIGHT'), scored, 'watch', lucky)).toBe('admire');
    expect(AFTER_BALL_CHANCE).toBe(.5);
  });

  it('out close to a milestone: always the sky or the haunches, never the same twice', () => {
    const out = { scored: false, beaten: false, wicket: true, milestone: false, heartbreak: true };
    expect(afterBall(stroke('STRAIGHT'), out, null, 0)).toBe('sky');
    expect(afterBall(stroke('STRAIGHT'), out, null, .99)).toBe('crouch');
    // Whatever the roll: it is not one of the half that get one.
    expect(afterBall(stroke('COVER_LONG_OFF'), out, 'sky', .99)).toBe('crouch');
    expect(afterBall(stroke('COVER_LONG_OFF'), out, 'crouch', 0)).toBe('sky');
    expect(afterBall(stroke('STRAIGHT'), { ...out, heartbreak: false }, null, 0)).toBeNull();
  });
});

describe('out close to a milestone', () => {
  const ball = (runs: number, isWicket = false) => ({ runs, isWicket } as ShotOutcome);
  const innings = (...runs: number[]) => runs.map(r => ball(r));
  it('in the nineties of any hundred', () => {
    for (const made of [90, 94, 99, 190, 199, 290, 395]) {
      const history = [...innings(...Array(Math.floor(made / 4)).fill(4)), ...innings(...Array(made % 4).fill(1)), ball(0, true)];
      expect(outNearMilestone(history), String(made)).toBe(true);
    }
  });
  it('not in the forties, nor short of the nineties, nor once past a hundred', () => {
    for (const made of [45, 49, 89, 100, 120, 180]) {
      const history = [...innings(...Array(Math.floor(made / 4)).fill(4)), ...innings(...Array(made % 4).fill(1)), ball(0, true)];
      expect(outNearMilestone(history), String(made)).toBe(false);
    }
  });
  it('on the ball after five sixes, but not four', () => {
    expect(outNearMilestone([...innings(1, 6, 6, 6, 6, 6), ball(0, true)])).toBe(true);
    expect(outNearMilestone([...innings(6, 6, 6, 6, 1, 6), ball(0, true)])).toBe(false);
  });
  it('only on the ball that got him out', () => {
    expect(outNearMilestone(innings(...Array(23).fill(4), 2))).toBe(false);
  });
});
