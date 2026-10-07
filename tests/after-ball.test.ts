import { describe, expect, it } from 'vitest';
import { afterBall, BEATEN_CHANCE, DOTS_BROKEN, HABITS, outNearMilestone, PACES, type Habit } from '../src/game/afterBall';
import type { AfterBall, PlayedStroke } from '../src/entities/Batter';
import type { ShotOutcome, ShotType } from '../src/game/types';

const stroke = (shot: ShotType, more: Partial<PlayedStroke> = {}): PlayedStroke =>
  ({ shot, charging: false, lofted: false, swept: false, pulled: false, ...more });
const ball = (runs: number, isWicket = false) => ({ runs, isWicket } as ShotOutcome);
const scored = { scored: true, beaten: false, wicket: false, milestone: false };
const beaten = { ...scored, scored: false, beaten: true };
const four = { ...scored, four: true };
/** A Blast innings a few balls old, with a four already in it, and this ball a two. */
const habit = (more: Partial<Habit> = {}): Habit =>
  ({ last: null, since: 9, sweeps: 0, history: [ball(4), ball(1), ball(2)], pace: PACES.CLASSIC, ...more });
const lucky = 0;

describe('what the batter does once the ball is done with', () => {
  it('suits the stroke', () => {
    for (const shot of ['STRAIGHT', 'COVER_LONG_OFF', 'LONG_ON'] as ShotType[]) {
      expect(afterBall(stroke(shot), scored, habit(), lucky)).toBe('admire');
      // The same drives lofted, and only those, are watched.
      expect(afterBall(stroke(shot, { lofted: true }), scored, habit(), lucky)).toBe('watch');
    }
    expect(afterBall(stroke('LEG', { pulled: true }), scored, habit(), lucky)).toBe('twirl');
    expect(afterBall(stroke('LEG', { swept: true }), scored, habit(), lucky)).toBe('brush');
    expect(afterBall(stroke('SCOOP'), scored, habit(), lucky)).toBe('brush');
    expect(afterBall(stroke('REVERSE_SCOOP'), scored, habit(), lucky)).toBe('brush');
  });

  it('the pull, which is hard to play, twirled every time, even twice running', () => {
    for (const roll of [0, .5, .99]) for (const last of [null, 'twirl'] as (AfterBall | null)[])
      expect(afterBall(stroke('LEG', { pulled: true }), scored, habit({ last, since: 0, pace: PACES.MARATHON }), roll)).toBe('twirl');
  });

  it('every other sweep or scoop brushed, from the first, whatever the roll', () => {
    const swept = [stroke('LEG', { swept: true }), stroke('SCOOP'), stroke('REVERSE_SCOOP')];
    for (const s of swept) for (const roll of [0, .99]) {
      expect(afterBall(s, scored, habit({ sweeps: 0 }), roll)).toBe('brush');
      expect(afterBall(s, scored, habit({ sweeps: 1, last: null }), roll)).toBeNull();
      expect(afterBall(s, scored, habit({ sweeps: 2, last: 'brush', since: 0, pace: PACES.SURVIVE }), roll)).toBe('brush');
    }
  });

  it('beaten driving or blocking: most of the time, the stroke rehearsed or the pitch scrubbed', () => {
    for (const shot of ['STRAIGHT', 'COVER_LONG_OFF', 'LONG_ON', 'DEFEND'] as ShotType[]) {
      expect(afterBall(stroke(shot), beaten, habit(), 0)).toBe('shadow');
      expect(afterBall(stroke(shot), beaten, habit(), BEATEN_CHANCE * .75)).toBe('scrub');
      expect(afterBall(stroke(shot), beaten, habit(), BEATEN_CHANCE)).toBeNull();
      // Never the one he did last: the other instead.
      expect(afterBall(stroke(shot), beaten, habit({ last: 'shadow' }), 0)).toBe('scrub');
      expect(afterBall(stroke(shot), beaten, habit({ last: 'scrub' }), BEATEN_CHANCE * .75)).toBe('shadow');
      // Not held to a Test's quarter, nor its wait.
      expect(afterBall(stroke(shot), beaten, habit({ since: 0, pace: PACES.MARATHON }), BEATEN_CHANCE * .9)).toBe('scrub');
    }
    expect(BEATEN_CHANCE).toBe(.8);
    // Not after the cross-batted strokes.
    for (const shot of ['SQUARE_CUT', 'LEG', 'SCOOP'] as ShotType[]) expect(afterBall(stroke(shot), beaten, habit(), 0)).toBeNull();
  });

  it('does nothing for the rest', () => {
    // The cut, the flick, a dot off a drive, a block that scored, a lofted flick.
    expect(afterBall(stroke('SQUARE_CUT'), scored, habit(), lucky)).toBeNull();
    expect(afterBall(stroke('LEG'), scored, habit(), lucky)).toBeNull();
    expect(afterBall(stroke('STRAIGHT'), { ...scored, scored: false }, habit(), lucky)).toBeNull();
    expect(afterBall(stroke('DEFEND'), scored, habit(), lucky)).toBeNull();
    expect(afterBall(stroke('LEG', { lofted: true }), scored, habit(), lucky)).toBeNull();
  });

  it('never after a charge, a wicket, before a milestone, or on the last ball', () => {
    for (const s of [stroke('STRAIGHT'), stroke('LEG', { pulled: true }), stroke('SCOOP')]) {
      expect(afterBall({ ...s, charging: true }, scored, habit(), lucky)).toBeNull();
      expect(afterBall(s, { ...scored, wicket: true }, habit(), lucky)).toBeNull();
      expect(afterBall(s, { ...scored, milestone: true }, habit(), lucky)).toBeNull();
      expect(afterBall(s, { ...scored, last: true }, habit(), lucky)).toBeNull();
    }
    expect(afterBall(null, scored, habit(), lucky)).toBeNull();
  });

  it('a drive: half the time in the Blast, never the same twice running', () => {
    expect(PACES.CLASSIC).toEqual({ chance: .5, gap: 0 });
    expect(afterBall(stroke('STRAIGHT'), scored, habit(), .49)).toBe('admire');
    expect(afterBall(stroke('STRAIGHT'), scored, habit(), .5)).toBeNull();
    expect(afterBall(stroke('STRAIGHT'), scored, habit({ since: 0 }), lucky)).toBe('admire');
    expect(afterBall(stroke('STRAIGHT'), scored, habit({ last: 'admire' }), lucky)).toBeNull();
    expect(afterBall(stroke('STRAIGHT'), scored, habit({ last: 'watch' }), lucky)).toBe('admire');
  });

  it('a drive in a Test: a quarter of the time, and not within four balls of the last', () => {
    for (const mode of ['SURVIVE', 'MARATHON'] as const) {
      const pace = PACES[mode];
      expect(pace).toEqual({ chance: .25, gap: 4 });
      expect(afterBall(stroke('STRAIGHT'), scored, habit({ pace, since: 4 }), .24)).toBe('admire');
      expect(afterBall(stroke('STRAIGHT'), scored, habit({ pace, since: 4 }), .25)).toBeNull();
      expect(afterBall(stroke('STRAIGHT'), scored, habit({ pace, since: 3 }), lucky)).toBeNull();
    }
  });

  it('a drive for four: the bat looked at, or leant on with the legs crossed', () => {
    expect(afterBall(stroke('STRAIGHT'), four, habit(), 0)).toBe('admire');
    expect(afterBall(stroke('STRAIGHT'), four, habit(), .4)).toBe('lean');
    expect(afterBall(stroke('COVER_LONG_OFF'), four, habit({ last: 'lean' }), .4)).toBe('admire');
    // A two off the same drive is never leant on.
    expect(afterBall(stroke('STRAIGHT'), scored, habit(), .4)).toBe('admire');
  });

  it('always for his first four, and for a boundary that ends a run of dots', () => {
    const pace = PACES.MARATHON;
    // The first four, past the roll and the wait alike.
    expect(afterBall(stroke('STRAIGHT'), four, habit({ pace, since: 0, history: [ball(1), ball(0), ball(4)] }), .99)).not.toBeNull();
    // Not the second.
    expect(afterBall(stroke('STRAIGHT'), four, habit({ pace, since: 9, history: [ball(4), ball(1), ball(4)] }), .99)).toBeNull();
    const dots = Array(DOTS_BROKEN).fill(0).map(() => ball(0));
    expect(afterBall(stroke('STRAIGHT'), four, habit({ pace, since: 0, history: [ball(4), ...dots, ball(4)] }), .99)).not.toBeNull();
    expect(afterBall(stroke('STRAIGHT'), four, habit({ pace, since: 0, history: [ball(4), ...dots.slice(1), ball(4)] }), .99)).toBeNull();
  });

  it('twice as often on a roll of boundaries', () => {
    const pace = PACES.MARATHON;
    expect(afterBall(stroke('STRAIGHT'), four, habit({ pace, history: [ball(4), ball(6), ball(4)] }), .45)).not.toBeNull();
    expect(afterBall(stroke('STRAIGHT'), four, habit({ pace, history: [ball(4), ball(1), ball(4)] }), .45)).toBeNull();
  });

  it('each Marathon batter his own favourites, twice as likely and picked first', () => {
    const pace = PACES.MARATHON, [opener, second, third] = HABITS;
    // The No. 2 watches a lofted drive twice as often; the opener does not.
    expect(afterBall(stroke('STRAIGHT', { lofted: true }), scored, habit({ pace, favourites: second }), .4)).toBe('watch');
    expect(afterBall(stroke('STRAIGHT', { lofted: true }), scored, habit({ pace, favourites: opener }), .4)).toBeNull();
    // Beaten, the No. 2 mostly scrubs and the others mostly play it again.
    const picks = (favourites: readonly AfterBall[]) => Array.from({ length: 30 }, (_, i) => afterBall(stroke('STRAIGHT'), beaten, habit({ favourites }), i / 30 * BEATEN_CHANCE));
    expect(picks(second).filter(k => k === 'scrub').length).toBe(20);
    expect(picks(third).filter(k => k === 'shadow').length).toBe(20);
    // A four leant on two times in three by the No. 3.
    const fours = Array.from({ length: 30 }, (_, i) => afterBall(stroke('STRAIGHT'), four, habit({ pace, favourites: third }), i / 30 * .5));
    expect(fours.filter(k => k === 'lean').length).toBe(20);
  });

  it('out close to a milestone: always the look to the sky', () => {
    const out = { scored: false, beaten: false, wicket: true, milestone: false, heartbreak: true };
    // Whatever the roll, whatever he did last, and on the innings' last ball too.
    for (const roll of [0, .5, .99]) expect(afterBall(stroke('STRAIGHT'), { ...out, last: true }, habit({ last: 'sky', since: 0, pace: PACES.MARATHON }), roll)).toBe('sky');
    expect(afterBall(stroke('STRAIGHT'), { ...out, heartbreak: false }, habit(), 0)).toBeNull();
  });
});

describe('out close to a milestone', () => {
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
