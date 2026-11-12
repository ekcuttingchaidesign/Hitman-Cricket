import { describe, expect, it } from 'vitest';
import { BALL_LOOK, followed, lookPhase, lookToward, readBallLook } from '../src/scene/ballLook';
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

  it('is on, Close lifting, unless the link says otherwise', () => {
    expect(readBallLook('')).toEqual({ on: true, close: 'lift' });
    expect(readBallLook('?camturn=0')).toEqual({ on: false, close: 'lift' });
    expect(readBallLook('?closecam=pan')).toEqual({ on: true, close: 'pan' });
  });
});
