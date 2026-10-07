import { describe, expect, it } from 'vitest';
import { afterBall, AFTER_BALL_CHANCE } from '../src/game/afterBall';
import type { PlayedStroke } from '../src/entities/Batter';
import type { ShotType } from '../src/game/types';

const stroke = (shot: ShotType, more: Partial<PlayedStroke> = {}): PlayedStroke =>
  ({ shot, charging: false, lofted: false, swept: false, pulled: false, ...more });
const scored = { scored: true, beaten: false, wicket: false, milestone: false };
const lucky = 0, unlucky = AFTER_BALL_CHANCE;

describe('what the batter does once the ball is done with', () => {
  it('suits the stroke', () => {
    for (const shot of ['STRAIGHT', 'COVER_LONG_OFF', 'LONG_ON'] as ShotType[]) expect(afterBall(stroke(shot), scored, null, lucky)).toBe('admire');
    expect(afterBall(stroke('STRAIGHT', { lofted: true }), scored, null, lucky)).toBe('watch');
    expect(afterBall(stroke('LEG', { pulled: true }), scored, null, lucky)).toBe('twirl');
    expect(afterBall(stroke('LEG', { swept: true }), scored, null, lucky)).toBe('brush');
    expect(afterBall(stroke('SCOOP'), scored, null, lucky)).toBe('brush');
    expect(afterBall(stroke('REVERSE_SCOOP'), scored, null, lucky)).toBe('brush');
    expect(afterBall(stroke('COVER_LONG_OFF'), { ...scored, scored: false, beaten: true }, null, lucky)).toBe('shadow');
  });

  it('does nothing for the rest', () => {
    // The cut, the flick, a dot off a drive, a block.
    expect(afterBall(stroke('SQUARE_CUT'), scored, null, lucky)).toBeNull();
    expect(afterBall(stroke('LEG'), scored, null, lucky)).toBeNull();
    expect(afterBall(stroke('STRAIGHT'), { ...scored, scored: false }, null, lucky)).toBeNull();
    expect(afterBall(stroke('DEFEND'), { ...scored, beaten: true }, null, lucky)).toBeNull();
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
});
