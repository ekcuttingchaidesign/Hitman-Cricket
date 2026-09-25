import { describe, expect, it } from 'vitest';
import { Batter, CHARGE_CONTACT_MS, PULL_CONTACT_MS, STROKE_CONTACT_MS } from '../src/entities/Batter';
import { readState, stateQuery, prepareReviewPose } from '../tools/graphics-review-poses';
import type { ReviewAction } from '../tools/graphics-review-poses';

describe('graphics review', () => {
  it('restores a shared frozen moment and contains malformed URL input', () => {
    const state = { action: 'charge', time: 615, kit: 'survive', frame: 'phone', reference: false } as const;
    expect(readState(stateQuery(state))).toEqual(state);
    expect(readState('?action=unknown&time=Infinity&kit=unknown&frame=unknown')).toEqual({
      action: 'guard', time: 0, kit: 'blast', frame: 'reference', reference: true,
    });
    expect(readState('?action=drive&time=-30').time).toBe(0);
    expect(readState('?action=pull&time=999999').time).toBe(940);
  });

  it('uses the actual stroke clocks and variants, including charge contact', () => {
    const batter = new Batter();
    for (const [action, clock] of [['drive', STROKE_CONTACT_MS], ['pull', PULL_CONTACT_MS], ['charge', CHARGE_CONTACT_MS]] as const) {
      prepareReviewPose(batter, action); batter.update(clock);
      expect(batter.strikeAt).toBe(clock);
      expect(batter.inspect().pulling).toBe(action === 'pull');
      expect(batter.inspect().charging).toBe(action === 'charge');
    }
  });

  it('seeking backwards and across actions reproduces a freshly posed actor', () => {
    const used = new Batter();
    const sequence: [ReviewAction, number][] = [['charge', 615], ['charge', 190], ['pull', 230], ['guard', 0], ['drive', 410], ['drive', 110], ['charge', 2240], ['guard', 0]];
    for (const [action, time] of sequence) {
      const fresh = new Batter();
      prepareReviewPose(used, action); used.update(time);
      prepareReviewPose(fresh, action); fresh.update(time);
      const actual = used.inspect(), expected = fresh.inspect();
      // Compare real rendered anchors, not just the requested pose or timestamp.
      for (const key of ['hands', 'elbows', 'knees', 'bladeTip', 'bladeContact', 'batFace', 'downPitch', 'backToe'] as const) {
        expect(actual[key], `${action}@${time}: ${key}`).toEqual(expected[key]);
      }
    }
  });
});
