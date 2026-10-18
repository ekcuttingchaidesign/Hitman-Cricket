import { describe, expect, it } from 'vitest';
import {
  surviveBeaten, surviveChip, surviveGoal, surviveResultOf, surviveSurely, surviveVerdict, type SurviveResult,
} from '../src/game/chase';
import { packSurvive, type SurviveInnings } from '../src/game/survive-board';

const won = (balls: number, runs = 100): SurviveResult => ({ kind: 'won', balls, runs });
const drawn = (runs: number): SurviveResult => ({ kind: 'drawn', balls: 60, runs });
const lost = (balls: number, runs = 30): SurviveResult => ({ kind: 'lost', balls, runs });

/** An innings with this result, for packing the way the board does. */
const innings = (r: SurviveResult): SurviveInnings => ({
  runs: r.runs, balls: r.balls, wickets: r.kind === 'lost' ? 1 : 0, blows: 0, health: 100,
});

describe('a Survival chase is of their result', () => {
  it('reads an innings as a win, a draw or a loss', () => {
    expect(surviveResultOf(innings(won(48)))).toEqual(won(48));
    expect(surviveResultOf(innings(drawn(96)))).toEqual(drawn(96));
    expect(surviveResultOf(innings(lost(40)))).toEqual(lost(40));
  });

  it('asks what beating it takes: win faster, outscore the draw, or outlast', () => {
    expect(surviveGoal('Kabir', won(48))).toMatchObject({ figure: 47, unit: 'BALLS', aim: 'TO WIN IN', key: 'WIN FASTER THAN KABIR' });
    expect(surviveGoal('Kabir', drawn(96))).toMatchObject({ figure: 97, unit: 'RUNS', aim: 'AND SURVIVE', key: 'OUTSCORE KABIR’S DRAW' });
    expect(surviveGoal('Kabir', lost(40))).toMatchObject({ figure: 41, unit: 'BALLS', aim: 'TO OUTLAST', key: 'OUTLAST KABIR' });
  });

  it('judges it the way the board ranks it, every time', () => {
    const results = [won(30), won(48), won(48, 104), drawn(97), drawn(96), lost(59), lost(40, 31), lost(40), lost(12)];
    const at = Date.UTC(2026, 9, 1);
    for (const theirs of results) {
      for (const mine of results) {
        if (theirs === mine) continue;
        // Packed a second later, so an exact tie goes to whoever got there first, as on the board.
        const board = packSurvive(innings(mine), at + 1000) > packSurvive(innings(theirs), at);
        expect(surviveBeaten(theirs, mine), `${JSON.stringify(mine)} over ${JSON.stringify(theirs)}`).toBe(board);
      }
    }
  });

  it('passes a loss between balls, and a win or a draw only on the ball that ends it', () => {
    expect(surviveSurely(lost(40), 40)).toBe(false);
    expect(surviveSurely(lost(40), 41)).toBe(true);
    expect(surviveSurely(drawn(96), 59)).toBe(false);
    expect(surviveSurely(won(48), 47)).toBe(false);
  });

  it('says on the chip what is still wanted', () => {
    expect(surviveChip('Kabir', lost(40), { balls: 28, runs: 20 })).toMatchObject({ need: 'Survive 13 more', done: false });
    expect(surviveChip('Kabir', lost(40), { balls: 41, runs: 20 })).toMatchObject({ done: true });
    expect(surviveChip('Kabir', drawn(96), { balls: 30, runs: 50 }).need).toBe('Need 47');
    expect(surviveChip('Kabir', drawn(96), { balls: 30, runs: 97 }).need).toBe('Now survive');
    expect(surviveChip('Kabir', won(48), { balls: 20, runs: 60 }).need).toBe('40 off 27');
    expect(surviveChip('Kabir', won(48), { balls: 47, runs: 60 }).need).toBe('Too late to win faster');
  });

  it('says how it went on the end card', () => {
    expect(surviveVerdict('Kabir', lost(40), lost(46), { now: 4, was: 9 }).title).toBe('You outlasted Kabir by 6 balls');
    expect(surviveVerdict('Kabir', won(48), won(42), { now: null, was: null }).title).toBe('You won 6 balls faster than Kabir');
    expect(surviveVerdict('Kabir', drawn(96), drawn(99), { now: null, was: null }).title).toBe('You outscored Kabir’s draw by 3');
    expect(surviveVerdict('Kabir', lost(40), drawn(50), { now: null, was: null }).title).toBe('You beat Kabir’s result');
    expect(surviveVerdict('Kabir', lost(40), lost(36), { now: null, was: null })).toMatchObject({ beat: false, title: '4 balls short of Kabir' });
    expect(surviveVerdict('Kabir', won(48), drawn(99), { now: null, was: null })).toMatchObject({ beat: false, title: 'Short of Kabir’s result' });
    expect(surviveVerdict('Kabir', lost(40), lost(46), { now: null, was: null }).line).toBe('You lasted 46 balls · Kabir lasted 40 balls');
  });
});
