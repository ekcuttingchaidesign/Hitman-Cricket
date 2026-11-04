import { describe, expect, it } from 'vitest';
import {
  AFTER_MS, ARRIVED_MS, CUT_AFTER, LEAD_IN, REPLAY_GAP, REPLAY_SLOW, REPLAYS_PER_INNINGS, SKIPS_TO_QUIET,
  endedLog, fieldCamera, freshLog, pickAngle, qualifies, replayCamera, replayDue, REPLAY_ANGLES, REPLAY_STROKES, replayPace, replayTimes, shownLog, type ReplayBall, type ReplayLog,
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
  it('the pull, the cuts and the scoops too, the scoops only for six', () => {
    for (const stroke of ['pull', 'cut', 'latecut'] as const) expect(qualifies(four(0, { stroke }))).toBe(true);
    for (const stroke of ['scoop', 'reverse'] as const) {
      expect(qualifies(four(0, { stroke }))).toBe(false);
      expect(qualifies(four(0, { stroke, runs: 6 }))).toBe(true);
    }
  });
  it('the first of each stroke, each its own', () => {
    const log = shownLog(freshLog(), four(0));
    expect(due(four(10, { stroke: 'pull' }), log, .99)).toBe(true);
    expect(due(four(10), log, .99)).toBe(false);
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
  it('opens on the stroke, a moment before he swings, and goes out on his finish', () => {
    const times = replayTimes({ swingAfter: 900, resolveAfter: 1150, contactAfter: 1180 });
    expect(times.swing).toBe(LEAD_IN);
    expect(times.release).toBe(LEAD_IN - 900);
    expect(times.resolve).toBe(LEAD_IN + 250);
    expect(times.contact).toBe(LEAD_IN + 280);
    expect(times.end).toBe(times.contact + AFTER_MS);
    expect(LEAD_IN).toBeLessThan(250);
  });
  it('holds on where the ball went, however long it takes to get there', () => {
    const quick = replayTimes({ swingAfter: 900, resolveAfter: 1150, contactAfter: 1180, arrives: 100 });
    expect(quick.end).toBe(quick.contact + AFTER_MS);
    const long = replayTimes({ swingAfter: 900, resolveAfter: 1150, contactAfter: 1180, arrives: 1250 });
    expect(long.end).toBe(long.contact + 1250 + ARRIVED_MS);
    expect(CUT_AFTER).toBeLessThan(AFTER_MS);
  });
  it("cuts to a camera up high off the ball's line that follows it, never past the rope", () => {
    for (const to of [[30, .1, 22], [-25, .1, -24], [3, .1, 44], [-34, .1, 2], [28, .1, -30]] as const) {
      const pose = fieldCamera(to, null);
      expect(pose.eye[1]).toBeGreaterThan(8);
      expect(Math.hypot(pose.eye[0], pose.eye[2])).toBeLessThan(20);
      // Off the ball's line, not on it: the ball comes across the picture.
      const len = Math.hypot(to[0], to[2]), along = (pose.eye[0] * to[0] + pose.eye[2] * to[2]) / len;
      const across = Math.hypot(pose.eye[0] - to[0] / len * along, pose.eye[2] - to[2] / len * along);
      expect(across).toBeGreaterThan(5);
      // A four held on where it crossed the rope, never on the boards beyond.
      expect(Math.hypot(pose.at[0], pose.at[2])).toBeLessThanOrEqual(40);
      // Following the ball while it is inside the rope.
      expect(fieldCamera(to, [5, 1, 4]).at).toEqual([5, 1, 4]);
      expect(fieldCamera(to, [to[0] * 1.4, .1, to[2] * 1.4]).at).toEqual(pose.at);
    }
    // Zoomed so the patch of ground in the picture stays the same size, near or far.
    const near = fieldCamera([30, .1, 22], [3, .5, 3]), far = fieldCamera([30, .1, 22], [24, .5, 18]);
    expect(far.fov).toBeLessThan(near.fov);
  });
  it('slows through contact and is back to full speed either side', () => {
    expect(replayPace(-2000)).toBe(1);
    expect(replayPace(0)).toBeCloseTo(REPLAY_SLOW.pace);
    expect(replayPace(1500)).toBe(1);
    for (let t = -2000; t < 2000; t += 10) expect(Math.abs(replayPace(t + 10) - replayPace(t))).toBeLessThan(.06);
  });
  it('every camera keeps him small in the picture, the way the model reads well', () => {
    for (const angle of REPLAY_STROKES.flatMap(stroke => REPLAY_ANGLES[stroke])) {
      // His height over the height of the picture between the bars, where he stands.
      const away = Math.hypot(angle.eye[0] - angle.at[0], angle.eye[1] - angle.at[1], angle.eye[2] - angle.at[2]);
      const share = 1.78 / (2 * away * Math.tan(angle.fov * Math.PI / 360)) / .78;
      expect(share, angle.id).toBeLessThan(.35);
      expect(replayCamera(angle)).toEqual({ eye: angle.eye, at: angle.at, fov: angle.fov });
    }
  });
  it('every stroke has two cameras at least, each a real one', () => {
    for (const stroke of REPLAY_STROKES) {
      expect(REPLAY_ANGLES[stroke].length, stroke).toBeGreaterThanOrEqual(2);
      expect(REPLAY_ANGLES[stroke].every(Boolean), stroke).toBe(true);
    }
    // The cuts go to the off side: never the camera on the leg side, which sees his back.
    expect(REPLAY_ANGLES.cut.map(angle => angle.id)).not.toContain('leg-side');
    expect(REPLAY_ANGLES.pull.map(angle => angle.id)).not.toContain('off-side');
  });
  it('never shows the same camera twice running, and takes one asked for by name', () => {
    const ids = REPLAY_ANGLES.cover.map(angle => angle.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const last of ids) for (let roll = 0; roll < 1; roll += .05) expect(pickAngle('cover', last, roll).id).not.toBe(last);
    const seen = new Set<string>();
    for (let roll = 0; roll < 1; roll += .01) seen.add(pickAngle('cover', null, roll).id);
    expect(seen.size).toBe(ids.length);
    expect(pickAngle('cover', 'midoff', .5, 'midoff').id).toBe('midoff');
    expect(pickAngle('cover', null, .5, 'nowhere').id).toBe(pickAngle('cover', null, .5).id);
  });
});
