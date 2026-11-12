import { describe, expect, it } from 'vitest';
import { BALL_LOOK, CLASSIC_FOLLOW, followed, lookPhase, lookToward, bearingOf, keepInView, partialLook, readBallLook, widenFor } from '../src/scene/ballLook';
import type { ShotOutcome } from '../src/game/types';

const hit = (more: Partial<ShotOutcome> = {}) => ({ madeBatContact: true, runs: 4, isWicket: false, aerial: false, ...more }) as ShotOutcome;
const deg = (v: [number, number, number]) => ({ yaw: Math.atan2(v[0], v[2]) * 180 / Math.PI, pitch: Math.asin(v[1]) * 180 / Math.PI });

describe('the camera going after the ball off the bat', () => {
  it('follows a ball hit into the field, a four, a single, a skier', () => {
    expect(followed(hit(), 40)).toBe(true);
    expect(followed(hit({ runs: 1 }), 18)).toBe(true);
    expect(followed(hit({ runs: 0, aerial: true, isWicket: true, wicketType: 'CAUGHT' }), 25)).toBe(true);
  });

  it('leaves an edge, a block, the pad, the body and a ball played on alone', () => {
    expect(followed(hit({ edged: true }), 8)).toBe(false);
    expect(followed(hit({ defended: true, runs: 0 }), 8)).toBe(false);
    expect(followed(hit({ padded: true }), 8)).toBe(false);
    expect(followed({ ...hit(), madeBatContact: false, hit: { where: 'RIBS', damage: 1 } } as unknown as ShotOutcome, 8)).toBe(false);
    expect(followed(hit({ isWicket: true, wicketType: 'BOWLED' }), 8)).toBe(false);
    expect(followed(hit({ runs: 0 }), BALL_LOOK.reach - 1)).toBe(false);
  });

  it('follows while it flies, holds on where it got to, then comes back', () => {
    expect(lookPhase(0, 1200)).toBe('follow');
    expect(lookPhase(1199, 1200)).toBe('follow');
    expect(lookPhase(1200, 1200)).toBe('hold');
    expect(lookPhase(1200 + BALL_LOOK.hold, 1200)).toBe('back');
  });

  it('looks straight at a ball in front, and no further round than a head turns', () => {
    const cover = deg(lookToward(-20, 2, 30));
    expect(cover.yaw).toBeCloseTo(Math.atan2(-20, 30) * 180 / Math.PI, 5);
    expect(deg(lookToward(5, 0, -30)).yaw).toBeCloseTo(BALL_LOOK.yaw, 5);
    expect(deg(lookToward(-5, 0, -30)).yaw).toBeCloseTo(-BALL_LOOK.yaw, 5);
    expect(deg(lookToward(0, 50, 1)).pitch).toBeCloseTo(BALL_LOOK.up, 5);
    expect(deg(lookToward(0, -50, 1)).pitch).toBeCloseTo(-BALL_LOOK.down, 5);
    const v = lookToward(3, 4, 12);
    expect(Math.hypot(...v)).toBeCloseTo(1, 9);
  });

  it('is on unless the link turns it off', () => {
    expect(readBallLook('').on).toBe(true);
    expect(readBallLook('?camturn=0').on).toBe(false);
  });

  it("asks for Classic's follow only by name on the link", () => {
    expect(readBallLook('').classic).toBe(null);
    expect(readBallLook('?classicfollow=pan').classic).toBe('pan');
    expect(readBallLook('?classicfollow=zoom').classic).toBe(null);
    expect(readBallLook('?classicfollow=1').classic).toBe(null);
  });

  it('turns Classic only part of the way, and never far round', () => {
    const rest: [number, number, number] = [0, 0, 1];
    const square = deg(partialLook(rest, [1, 0, 0]));
    expect(square.yaw).toBeCloseTo(Math.min(90 * CLASSIC_FOLLOW.share, CLASSIC_FOLLOW.yaw), 5);
    const cover = deg(partialLook(rest, [Math.sin(.4), 0, Math.cos(.4)]));
    expect(cover.yaw).toBeCloseTo(.4 * 180 / Math.PI * CLASSIC_FOLLOW.share, 5);
    expect(deg(partialLook(rest, [-1, 0, 0])).yaw).toBeCloseTo(-CLASSIC_FOLLOW.yaw, 5);
    expect(deg(partialLook(rest, [0, 1, 0.01])).pitch).toBeLessThanOrEqual(CLASSIC_FOLLOW.up + 1e-9);
    expect(deg(partialLook(rest, rest)).yaw).toBeCloseTo(0, 9);
  });

  it('never turns Classic off him', () => {
    const half = 17 * Math.PI / 180, most = Math.atan(Math.tan(half) * CLASSIC_FOLLOW.keep);
    expect(keepInView(0.1, 0, half)).toBeCloseTo(0.1, 9);
    expect(keepInView(0.6, 0, half)).toBeCloseTo(most, 9);
    expect(keepInView(-0.6, 0.05, half)).toBeCloseTo(0.05 - most, 9);
  });

  it('tells a ball behind square from a square one', () => {
    expect(bearingOf(0, 30)).toBeCloseTo(0, 9);
    expect(bearingOf(-30, 0)).toBeCloseTo(90, 9);
    expect(bearingOf(10, -20)).toBeGreaterThan(CLASSIC_FOLLOW.behind);
    expect(bearingOf(-25, 8)).toBeLessThan(CLASSIC_FOLLOW.behind);
  });

  it("opens Classic's lens a little for a ball off the side, and not for one in the picture", () => {
    const half = 17 * Math.PI / 180, vertical = 67 * Math.PI / 180;
    expect(widenFor(0.1, half, vertical)).toBe(1);
    const off = widenFor(0.4, half, vertical);
    expect(off).toBeGreaterThan(1);
    expect(off).toBeLessThanOrEqual(CLASSIC_FOLLOW.widen);
    expect(widenFor(1.2, half, vertical)).toBe(CLASSIC_FOLLOW.widen);
  });
});
