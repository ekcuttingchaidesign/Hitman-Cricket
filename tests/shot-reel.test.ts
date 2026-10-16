import { describe, expect, it } from 'vitest';
import {
  AFTER_MS, CUE, SLOW, reelCamera, reelContactAfterRelease, reelDelivery, reelLength, reelMeets, reelOutcome, reelPace,
  reelSeconds, reelStroke, reelTimes, type ReelShot,
} from '../src/game/ShotReel';
import { flightProgress } from '../src/game/DeliveryTrajectory';
import { hookable, playedAs } from '../src/game/ShotResolver';
import { HOOK_CONTACT_MS, LATE_CUT_CONTACT_MS } from '../src/entities/Batter';
import { GAME, LINE_X } from '../src/config/gameplay';

const SHOTS: readonly ReelShot[] = ['hook', 'latecut'];

describe('the new strokes\' film', () => {
  it('bowls the ball each stroke answers', () => {
    const hook = reelDelivery('hook', 0), cut = reelDelivery('latecut', 0);
    // The bouncer outside off, which a leg-side swipe plays as the hook.
    expect(hook.style).toBe('SHORT');
    expect(hookable(hook)).toBe(true);
    expect(playedAs(hook, { shotType: 'LEG', inputTimeMs: 0 }, false).shotType).toBe('HOOK');
    // Pace, going on past off stump: the late cut's ball, not short.
    expect(cut.style).not.toBe('SHORT');
    expect(cut.finalTargetX).toBe(LINE_X.OUTSIDE_OFF);
    expect(cut.speedKph).toBeGreaterThan(120);
  });

  it('comes to what the game\'s own rules make of the stroke played in time: six over square leg, four to third man', () => {
    const hook = reelOutcome('hook', reelDelivery('hook', 0)), cut = reelOutcome('latecut', reelDelivery('latecut', 0));
    expect(hook).toMatchObject({ runs: 6, isWicket: false, timingGrade: 'PERFECT', madeBatContact: true, hooked: true });
    expect(cut).toMatchObject({ runs: 4, isWicket: false, timingGrade: 'PERFECT', madeBatContact: true });
    expect(reelStroke('hook')).toBe('HOOK');
    expect(reelStroke('latecut')).toBe('LATE_CUT');
  });

  it('starts the stroke so the bat arrives with the ball, where the stroke meets it', () => {
    for (const shot of SHOTS) {
      const times = reelTimes(shot), delivery = reelDelivery(shot, times.release);
      expect(times.runup).toBeGreaterThan(0);
      expect(times.release - times.runup).toBe(GAME.runupMs);
      expect(times.contact - times.swing).toBe(shot === 'hook' ? HOOK_CONTACT_MS : LATE_CUT_CONTACT_MS);
      // At contact the ball is where the stroke meets it: out in front for the hook, beside the back pad for the late cut.
      expect(flightProgress(delivery, times.contact - times.release)).toBeCloseTo(reelMeets(shot), 4);
      expect(reelContactAfterRelease(shot, delivery)).toBeCloseTo(times.contact - times.release, 3);
    }
    expect(reelMeets('hook')).toBeLessThan(1);
    expect(reelMeets('latecut')).toBeGreaterThan(1);
  });

  it('slows through the bat meeting the ball, and only then', () => {
    expect(reelPace(0)).toBeCloseTo(SLOW.pace, 5);
    expect(reelPace(-2000)).toBe(1);
    expect(reelPace(2000)).toBe(1);
    // Never faster than the game, never stopped, and no step in it.
    for (let t = -1500; t <= 1500; t += 5) {
      expect(reelPace(t)).toBeGreaterThanOrEqual(SLOW.pace - 1e-9);
      expect(reelPace(t)).toBeLessThanOrEqual(1);
      expect(Math.abs(reelPace(t + 5) - reelPace(t))).toBeLessThan(.03);
    }
  });

  it('runs a go of a few seconds, held for the swipe, the ball well away before the next', () => {
    for (const shot of SHOTS) {
      expect(reelLength(shot)).toBe(reelTimes(shot).contact + AFTER_MS);
      expect(reelSeconds(shot)).toBeGreaterThan(reelLength(shot) + CUE.ms);
      expect(reelSeconds(shot)).toBeLessThan(11000);
    }
  });

  it('films the run-up from behind him as the game does, then cuts in to the stroke on the off side and follows the ball', () => {
    for (const shot of SHOTS) {
      const { contact } = reelTimes(shot);
      // Behind the stumps, looking down the pitch.
      const before = reelCamera(shot, 200, null);
      expect(before.eye[2]).toBeLessThan(0);
      expect(before.at[2]).toBeGreaterThan(before.eye[2]);
      // Cut in, side on from the off side, before the bat comes down.
      const cut = reelCamera(shot, contact - 300, null);
      expect(cut.eye[0]).toBeGreaterThan(2.5);
      expect(Math.hypot(cut.eye[0] - GAME.stanceX, cut.eye[2] - GAME.stanceZ)).toBeLessThan(7);
      // Once it is struck, turned after the ball.
      const ball = [-30, 12, -18] as const;
      const after = reelCamera(shot, contact + 900, ball), held = reelCamera(shot, contact + 900, null);
      expect(after.at[0]).toBeLessThan(held.at[0] - 5);
      // And back on him before the next go begins.
      const end = reelCamera(shot, contact + AFTER_MS - 10, ball);
      expect(end.at).toEqual(reelCamera(shot, contact + AFTER_MS - 10, null).at);
      // Moving without a jump once it has cut.
      for (let t = contact - 400; t < contact + AFTER_MS; t += 16) {
        const a = reelCamera(shot, t, null), b = reelCamera(shot, t + 16, null);
        expect(Math.hypot(a.eye[0] - b.eye[0], a.eye[1] - b.eye[1], a.eye[2] - b.eye[2])).toBeLessThan(.05);
      }
    }
  });
});
