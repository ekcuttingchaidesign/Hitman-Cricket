import { ropeAt as fieldRope } from '../src/game/super10-field';
import { describe, expect, it } from 'vitest';
import {
  ALWAYS, BOWLED_AFTER, BOWLED_LEAD, AFTER_MS, ARRIVED_MS, CUT_AFTER, CUT_AFTERS, LEAD_IN, OVER_MS, overRope, ropeAt, SIX_HOLD, REPLAY_GAP, REPLAY_SLOW, REPLAYS_PER_INNINGS, SKIPS_TO_QUIET,
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
  it('the pull, the cuts, the flick, the sweeps and the scoops for four or six', () => {
    for (const stroke of ['pull', 'cut', 'latecut', 'flick', 'sweep', 'slog', 'scoop', 'reverse'] as const) {
      expect(qualifies(four(0, { stroke })), stroke).toBe(true);
      expect(qualifies(four(0, { stroke, runs: 6 })), stroke).toBe(true);
    }
  });
  it('the sixes down the ground and the charge only for six', () => {
    for (const stroke of ['straight', 'on', 'charge'] as const) {
      expect(qualifies(four(0, { stroke })), stroke).toBe(false);
      expect(qualifies(four(0, { stroke, runs: 6 })), stroke).toBe(true);
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
  it('after that two in three', () => {
    const log = shownLog(freshLog(), four(0));
    expect(due(four(10), log, .5)).toBe(true);
    expect(due(four(10), log, .8)).toBe(false);
  });
  it('the special strokes and a batter bowled every time, whatever the dice, the gap or the cap', () => {
    for (const stroke of ALWAYS) {
      const ball = stroke === 'bowled' ? four(1, { stroke, runs: 0, wicket: true, grade: 'MISS' }) : four(1, { stroke, runs: 6 });
      let log = shownLog(freshLog(), { ...ball, index: 0 });
      log = { ...log, shown: 99, skipped: 5 };
      expect(due(ball, log, .99, { cap: 0 }), stroke).toBe(true);
      expect(due(ball, log, .99, { blocked: true }), stroke).toBe(false);
    }
    for (const stroke of ['scoop', 'reverse', 'slog', 'charge', 'bowled'] as const) expect(ALWAYS).toContain(stroke);
  });
  it('bowled is replayed only when he is out', () => {
    expect(qualifies(four(0, { stroke: 'bowled', runs: 0, wicket: true, grade: 'MISS' }))).toBe(true);
    expect(qualifies(four(0, { stroke: 'bowled', runs: 0, wicket: false, grade: 'MISS' }))).toBe(false);
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
  it('opens a batter bowled on the bowler before he lets it go, and holds on the stumps', () => {
    const times = replayTimes({ swingAfter: Infinity, resolveAfter: 780, contactAfter: 780, bowled: true });
    expect(times.release).toBe(BOWLED_LEAD);
    expect(times.contact).toBe(BOWLED_LEAD + 780);
    expect(times.end).toBe(times.contact + BOWLED_AFTER);
  });
  it('holds on each stroke until his finish is there, and cuts before the replay ends', () => {
    for (const stroke of REPLAY_STROKES.filter(stroke => stroke !== 'bowled')) {
      expect(CUT_AFTERS[stroke], stroke).toBeGreaterThanOrEqual(CUT_AFTER);
      expect(CUT_AFTERS[stroke], stroke).toBeLessThan(AFTER_MS);
    }
    // The square cut wraps over the shoulder three tenths of a second after the ball.
    expect(CUT_AFTERS.cut).toBeGreaterThan(300);
  });
  it('lets a six go once it is over the rope', () => {
    const to = [0, 2, 78] as const, from = [0, 1, 1] as const;
    const over = overRope(from, to, 2200);
    expect(over).toBeCloseTo(2200 * (ropeAt(0, 1) - 1) / 77);
    const times = replayTimes({ swingAfter: 900, resolveAfter: 1150, contactAfter: 1180, arrives: over, held: OVER_MS });
    expect(times.end).toBe(times.contact + Math.max(AFTER_MS, over + OVER_MS));
  });
  it('knows the rope the ground has: forty straight, twenty-eight square, twenty behind', () => {
    for (let angle = -180; angle <= 180; angle += 15) {
      const a = angle * Math.PI / 180;
      expect(ropeAt(Math.sin(a), Math.cos(a))).toBeCloseTo(fieldRope(angle));
    }
    expect(ropeAt(0, 1)).toBeCloseTo(40);
    expect(ropeAt(0, -1)).toBeCloseTo(20);
  });
  it('watches a six from down by the rope, looking up at it, never into the stand', () => {
    // Straight, square on either side, and behind: the reverse scoop and the square drive put it in the stand.
    for (const to of [[0, 2, 78], [-50, 2, 20], [40, 2, 40], [52, 2, 2], [30, 2, -45], [-25, 2, -50]] as const) {
      const length = Math.hypot(to[0], to[2]), dx = to[0] / length, dz = to[2] / length, rope = ropeAt(dx, dz);
      // A ball on its way up, and one high over the rope.
      const rising: [number, number, number] = [dx * 15, 12, dz * 15], over: [number, number, number] = [dx * (rope - 1), 11, dz * (rope - 1)];
      for (const ball of [rising, over]) {
        const pose = fieldCamera(to, ball, true);
        expect(pose.eye[1]).toBeLessThan(2);
        // Inside the rope, and looking back up at the ball, away from the stand.
        expect(Math.hypot(pose.eye[0], pose.eye[2])).toBeLessThan(rope);
        // Inside the boards, thirty-five metres round the middle of the pitch.
        expect(Math.hypot(pose.eye[0], pose.eye[2] - 10)).toBeLessThan(35);
        expect(pose.at[1]).toBeGreaterThan(pose.eye[1]);
        expect(pose.at[0] * dx + pose.at[2] * dz).toBeLessThanOrEqual(rope - SIX_HOLD + 1e-6);
      }
    }
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
    // The sixes down the ground from the bowler's end, over the sightscreen or from the big screen.
    for (const stroke of ['straight', 'on'] as const) expect(REPLAY_ANGLES[stroke].map(angle => angle.id)).toEqual(['sightscreen', 'umpire']);
    expect(REPLAY_ANGLES.bowled.map(angle => angle.id)).toEqual(['umpire', 'sightscreen']);
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
