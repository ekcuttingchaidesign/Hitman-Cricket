import { describe, expect, it } from 'vitest';
import {
  AFTER_MS, REPLAY_GAP, REPLAY_SLOW, REPLAYS_PER_INNINGS, RUNUP_FROM, SKIPS_TO_QUIET,
  endedLog, freshLog, qualifies, replayCamera, replayDue, replayPace, replayTimes, shownLog, type ReplayBall, type ReplayLog,
} from '../src/game/replay';

const four = (index: number, over: Partial<ReplayBall> = {}): ReplayBall => ({ stroke: 'cover', grade: 'PERFECT', runs: 4, wicket: false, index, ...over });
const due = (ball: ReplayBall, log: ReplayLog, roll = .99, extra: { cap?: number; blocked?: boolean; every?: boolean } = {}) =>
  replayDue(ball, log, { cap: extra.cap ?? REPLAYS_PER_INNINGS.super10, blocked: extra.blocked ?? false, roll, every: extra.every });

describe('which balls are replayed', () => {
  it('a cover drive timed good or perfect that went for four or six', () => {
    expect(qualifies(four(0))).toBe(true);
    expect(qualifies(four(0, { grade: 'GOOD', runs: 6 }))).toBe(true);
    expect(qualifies(four(0, { grade: 'OK' }))).toBe(false);
    expect(qualifies(four(0, { runs: 3 }))).toBe(false);
    expect(qualifies(four(0, { wicket: true }))).toBe(false);
    expect(qualifies(four(0, { stroke: null }))).toBe(false);
  });
  it('the first of a stroke in an innings always, whatever the dice', () => {
    expect(due(four(0), freshLog(), .99)).toBe(true);
  });
  it('after that one in three', () => {
    const log = shownLog(freshLog(), four(0));
    expect(due(four(10), log, .2)).toBe(true);
    expect(due(four(10), log, .5)).toBe(false);
  });
  it('never within an over of the last', () => {
    const log = shownLog(freshLog(), four(3));
    expect(due(four(3 + REPLAY_GAP - 1), log, 0)).toBe(false);
    expect(due(four(3 + REPLAY_GAP), log, 0)).toBe(true);
  });
  it('no more than an innings allows', () => {
    let log = freshLog();
    for (let i = 0; i < REPLAYS_PER_INNINGS.blast; i++) log = endedLog(shownLog(log, four(i * 10)), false);
    expect(due(four(100), log, 0, { cap: REPLAYS_PER_INNINGS.blast })).toBe(false);
    expect(due(four(100), log, 0, { cap: REPLAYS_PER_INNINGS.super10 })).toBe(true);
  });
  it('a player who skips two running sees only a stroke not yet replayed', () => {
    let log = freshLog();
    for (let i = 0; i < SKIPS_TO_QUIET; i++) log = endedLog(shownLog(log, four(i * 10)), true);
    expect(due(four(50), log, 0)).toBe(false);
    // One watched through puts it back.
    expect(due(four(50), endedLog(log, false), 0)).toBe(true);
  });
  it('never over anything else the ball brings', () => {
    expect(due(four(0), freshLog(), 0, { blocked: true })).toBe(false);
    expect(due(four(0), freshLog(), 0, { blocked: true, every: true })).toBe(false);
  });
  it('every ball that qualifies when asked, gap and cap or not', () => {
    const log = shownLog(freshLog(), four(0));
    expect(due(four(1), log, .99, { every: true, cap: 0 })).toBe(true);
    expect(due(four(1, { grade: 'POOR' }), log, 0, { every: true })).toBe(false);
  });
});

describe('the replay', () => {
  it('picks the run-up up a stride or two out and runs on past the bat meeting the ball', () => {
    const times = replayTimes({ swingAfter: 500, contactAfter: 900 }, 840);
    expect(times.release).toBeCloseTo((1 - RUNUP_FROM) * 840);
    expect(times.swing).toBeCloseTo(times.release + 500);
    expect(times.contact).toBeCloseTo(times.release + 900);
    expect(times.end).toBeCloseTo(times.contact + AFTER_MS);
  });
  it('slows through contact and is back to full speed either side', () => {
    expect(replayPace(-2000)).toBe(1);
    expect(replayPace(0)).toBeCloseTo(REPLAY_SLOW.pace);
    expect(replayPace(1500)).toBe(1);
    for (let t = -2000; t < 2000; t += 10) expect(Math.abs(replayPace(t + 10) - replayPace(t))).toBeLessThan(.06);
  });
  it('the camera stands in front of him on the off side, looks at him at the end, and never jumps', () => {
    const times = replayTimes({ swingAfter: 500, contactAfter: 900 }, 840);
    const ball = [3, 1.5, 12] as const;
    let last = replayCamera('cover', 0, times, null);
    expect(last.eye[0]).toBeGreaterThan(1);
    expect(last.eye[2]).toBeGreaterThan(3);
    for (let t = 0; t <= times.end; t += 16) {
      const now = replayCamera('cover', t, times, t > times.contact ? ball : null);
      const moved = Math.hypot(now.eye[0] - last.eye[0], now.eye[1] - last.eye[1], now.eye[2] - last.eye[2]);
      const turned = Math.hypot(now.at[0] - last.at[0], now.at[1] - last.at[1], now.at[2] - last.at[2]);
      expect(moved).toBeLessThan(.05);
      expect(turned).toBeLessThan(.25);
      last = now;
    }
    const end = replayCamera('cover', times.end, times, ball), start = replayCamera('cover', 0, times, null);
    expect(end.at).toEqual(start.at);
  });
});
