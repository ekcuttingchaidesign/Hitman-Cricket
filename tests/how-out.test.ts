import { describe, expect, it } from 'vitest';
import { CHOP_ON, RETURN_CATCH } from '../src/config/gameplay';
import { howOut } from '../src/game/ShotResolver';
import { flightOf } from '../src/scene/flight';
import { catchShotOf } from '../src/game/catch-cam';
import type { ShotOutcome } from '../src/game/types';

const out = (more: Partial<ShotOutcome>): ShotOutcome => ({ runs: 0, isWicket: true, wicketType: 'CAUGHT', quality: 0, feedback: 'CAUGHT!',
  timingGrade: 'POOR', timingDeltaMs: 60, compatibility: 1, madeBatContact: true, aerial: false, ...more });
const dice = (...rolls: number[]) => { let i = 0; return { next: () => rolls[i++ % rolls.length], thrown: () => i }; };

describe('the two dismissals laid over a wicket', () => {
  it('chops a share of the cuts edged behind onto the stumps, and leaves the rest caught behind', () => {
    const edged = out({ edged: true });
    const on = howOut(edged, { shotType: 'SQUARE_CUT' }, dice(1 - CHOP_ON.share + .01));
    expect(on).toMatchObject({ isWicket: true, wicketType: 'BOWLED', madeBatContact: true, edged: false, feedback: CHOP_ON.feedback });
    expect(howOut(edged, { shotType: 'SQUARE_CUT' }, dice(1 - CHOP_ON.share - .01))).toBe(edged);
    expect(howOut(edged, { shotType: 'LATE_CUT' }, dice(.99))).toBe(edged);
  });
  it('has the bowler hold a share of the straight drives skied and caught', () => {
    const skied = out({ aerial: true });
    const back = howOut(skied, { shotType: 'STRAIGHT' }, dice(1 - RETURN_CATCH.share + .01));
    expect(back).toMatchObject({ isWicket: true, wicketType: 'CAUGHT', returned: true, feedback: RETURN_CATCH.feedback });
    expect(howOut(skied, { shotType: 'STRAIGHT' }, dice(1 - RETURN_CATCH.share - .01))).toBe(skied);
    expect(howOut(skied, { shotType: 'COVER_LONG_OFF' }, dice(.99))).toBe(skied);
    // Short to him and flat, and left to the game's own camera.
    expect(flightOf(back).distance).toBeLessThan(20);
    expect(flightOf(back).height).toBeLessThan(3);
    expect(catchShotOf(back)).toBeNull();
  });
  it("throws no dice for a ball he was not out to, nor for a man on the rope's catch", () => {
    const rng = dice(.99);
    const safe = out({ isWicket: false, wicketType: undefined, runs: 4 });
    expect(howOut(safe, { shotType: 'SQUARE_CUT' }, rng)).toBe(safe);
    const rope = out({ aerial: true, fielder: { name: 'Long-off', angle: 12, distance: 38, deep: true, how: 'caught' } });
    expect(howOut(rope, { shotType: 'STRAIGHT' }, rng)).toBe(rope);
    expect(rng.thrown()).toBe(0);
  });
});
