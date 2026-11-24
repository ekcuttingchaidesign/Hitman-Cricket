import { describe, expect, it } from 'vitest';
import { HOW_MAX, type BallHow, packHow, readHow } from '../src/game/ball-how';
import type { ShotOutcome } from '../src/game/types';

/**
 * How a ball was played, as it travels for a friend's story (`ball-how.ts`):
 * the stroke the player played, not one made up to fit what it was worth. The
 * owner played the helicopter at a yorker for one, and the story on the other
 * device showed a cover drive for one.
 */
const outcome = (more: Partial<ShotOutcome>): ShotOutcome =>
  ({ runs: 1, isWicket: false, quality: 0.62, feedback: 'HELD BACK', timingGrade: 'OK', timingDeltaMs: 41.3, compatibility: 0.9, madeBatContact: true, aerial: false, ...more });
const helicopter: BallHow = {
  swing: { shot: 'STRAIGHT', charging: false, lofted: false, sweeping: false, levelled: false, version: 2, meets: 1.08, cutting: false, spinPulling: false, helicopter: true },
  swingAfter: 512.4, resolveAfter: 803.9, outcome: outcome({ helicopter: true }),
};

describe('how a ball was played, for whoever is watching', () => {
  it('comes back as it was told: the stroke with every argument, when it came and what came of it', () => {
    const read = readHow(packHow(helicopter), '1')!;
    expect(read.swing).toEqual(helicopter.swing);
    expect(read.swingAfter).toBe(512);
    expect(read.resolveAfter).toBe(804);
    expect(read.outcome).toMatchObject({ runs: 1, isWicket: false, helicopter: true, feedback: 'HELD BACK', timingGrade: 'OK', madeBatContact: true, aerial: false });
    expect(read.outcome.timingDeltaMs).toBeCloseTo(41.3);
  });
  it('keeps every flag of the swing apart', () => {
    for (const flag of ['charging', 'lofted', 'sweeping', 'levelled', 'cutting', 'spinPulling', 'helicopter'] as const) {
      const swing = { ...helicopter.swing!, helicopter: false, [flag]: true };
      expect(readHow(packHow({ ...helicopter, swing }), '1')!.swing).toEqual(swing);
    }
    for (const version of [1, 2, 3] as const) expect(readHow(packHow({ ...helicopter, swing: { ...helicopter.swing!, version } }), '1')!.swing!.version).toBe(version);
  });
  it('tells a wicket as it fell, and a ball left alone with no stroke', () => {
    const bowled = readHow(packHow({ swing: null, swingAfter: 760, resolveAfter: 760, outcome: outcome({ runs: 0, isWicket: true, wicketType: 'BOWLED', madeBatContact: false, timingGrade: 'MISS', timingDeltaMs: null, feedback: 'BOWLED!' }) }), 'W')!;
    expect(bowled.swing).toBeNull();
    expect(bowled.swingAfter).toBe(760);
    expect(bowled.outcome).toMatchObject({ isWicket: true, wicketType: 'BOWLED', runs: 0, timingDeltaMs: null, feedback: 'BOWLED!' });
    const caught = readHow(packHow({ ...helicopter, outcome: outcome({ runs: 0, isWicket: true, wicketType: 'CAUGHT', aerial: true, edged: true }) }), 'W')!;
    expect(caught.outcome).toMatchObject({ wicketType: 'CAUGHT', aerial: true, edged: true });
  });
  it('is let go when it does not say what the card says: the room counts the card', () => {
    const packed = packHow(helicopter);
    expect(readHow(packed, '1')).not.toBeNull();
    for (const char of ['0', '4', '6', 'W', 'S', undefined]) expect(readHow(packed, char)).toBeNull();
    expect(readHow(packHow({ ...helicopter, outcome: outcome({ runs: 0, isWicket: true }) }), '0')).toBeNull();
  });
  it('holds another player’s words and numbers to what the game’s own are', () => {
    const tell = (o: Record<string, unknown>, more: Record<string, unknown> = {}) => JSON.stringify({ s: 'STRAIGHT', f: 0, v: 2, m: 1, a: 500, r: 800, ...more, o: { runs: 1, isWicket: false, timingGrade: 'GOOD', ...o } });
    // The call over the pitch: capitals and the game's own marks, or nothing.
    expect(readHow(tell({ feedback: 'PERFECT TIMING · FOUR' }), '1')!.outcome.feedback).toBe('PERFECT TIMING · FOUR');
    expect(readHow(tell({ feedback: 'hello <b>there</b>' }), '1')!.outcome.feedback).toBe('');
    expect(readHow(tell({ feedback: 'X'.repeat(60) }), '1')!.outcome.feedback).toBe('');
    // Numbers inside their ranges, and nothing that is not a number, a flag or a known word.
    const odd = readHow(tell({ quality: 9, timingDeltaMs: 1e9, hangMs: -5, angle: 'north', wicketType: 'BOWLED', side: 'SIDEWAYS', fielder: { name: 'x' }, madeUp: 'text', hooked: true }), '1')!.outcome as unknown as Record<string, unknown>;
    expect(odd.quality).toBe(1);
    expect(odd.timingDeltaMs).toBe(2000);
    expect(odd.hangMs).toBe(0);
    expect(odd.angle).toBeUndefined();
    expect(odd.wicketType).toBeUndefined();
    expect(odd.side).toBeUndefined();
    expect(odd.fielder).toBeUndefined();
    expect(odd.madeUp).toBeUndefined();
    expect(odd.hooked).toBe(true);
    // A stroke the game does not have, a grade it does not give, or no time for the ball: not read at all.
    expect(readHow(tell({}, { s: 'MOONSHOT' }), '1')).toBeNull();
    expect(readHow(tell({ timingGrade: 'SUPERB' }), '1')).toBeNull();
    expect(readHow(tell({}, { r: 'soon' }), '1')).toBeNull();
    expect(readHow(tell({}, { v: 7, m: 99, a: -1e9 }), '1')!.swing).toMatchObject({ version: 3, meets: 3 });
    // Not text, not JSON, or longer than a how can be.
    for (const raw of [null, 7, '', 'not json', '[]', 'x'.repeat(HOW_MAX + 1)]) expect(readHow(raw, '1')).toBeNull();
  });
  it('fits the store’s limit for the longest ball the game tells', () => {
    const long = packHow({ ...helicopter, outcome: outcome({ feedback: 'WRONG SHOT FOR THE LINE · CAUGHT BEHIND', advance: true, steppedOut: true, swept: true, scooped: true, hooked: true, squared: true,
      punched: true, sweptFlat: true, spinPulled: true, returned: true, helicopter: true, defended: true, edged: true, padded: true, lateCut: true, side: 'EARLY', hangMs: 1234.5, dropped: true, spilled: true, stretched: true, angle: -41.25,
      wicketType: 'STUMPED', fielder: { name: 'LONG-ON', angle: 12, distance: 38, deep: true, how: 'caught' } }) });
    expect(long.length).toBeLessThanOrEqual(HOW_MAX);
    expect(long).not.toContain('LONG-ON');
  });
});
