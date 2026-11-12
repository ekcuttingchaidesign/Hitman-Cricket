import { describe, expect, it } from 'vitest';
import { BEATS, beatAt, cameraAt, RUN_FROM, showDelivery, showOutcome, showPlan, SPEEDS } from '../src/game/CameraShow';

describe('the batting cams story', () => {
  const plan = showPlan();

  it('goes intro, Close, the PRO CAM band, the speed, then the pause menu, in that order', () => {
    const at = (t: number) => beatAt(t, plan);
    expect(at(0)).toBe('intro');
    expect(at(BEATS.close)).toBe('close');
    expect(at(BEATS.band)).toBe('band');
    expect(at(BEATS.speed)).toBe('speed');
    expect(at(plan.where)).toBe('where');
    expect(at(plan.where + 60_000)).toBe('where');
  });

  it('is through the classic view, then Close, and cuts to his eyes under the band', () => {
    expect(cameraAt(0)).toBe('classic');
    expect(cameraAt(BEATS.close)).toBe('close');
    expect(BEATS.cut).toBeGreaterThan(BEATS.band);
    expect(BEATS.cut).toBeLessThan(BEATS.speed);
    expect(cameraAt(BEATS.cut)).toBe('pro');
    expect(cameraAt(plan.where)).toBe('pro');
  });

  it('bowls the sling bowler’s 158, 156 and 154, each left alone and past him, never out', () => {
    expect(SPEEDS).toEqual([158, 156, 154]);
    for (const [go, kph] of SPEEDS.entries()) {
      const ball = showDelivery(go, 0);
      expect(ball.speedKph).toBe(kph);
      expect(ball.express).toBe(true);
      const outcome = showOutcome(ball);
      expect(outcome.madeBatContact, `ball ${go}`).toBe(false);
      expect(outcome.isWicket, `ball ${go}`).toBe(false);
    }
  });

  it('bowls them one after another, the second and third already running, each reaching him in about half a second', () => {
    expect(plan.balls.map(ball => ball.go)).toEqual([0, 1, 2]);
    expect(RUN_FROM[0]).toBe(0);
    for (const [i, ball] of plan.balls.entries()) {
      expect(ball.past - ball.release).toBeLessThan(600);
      expect(ball.past - ball.release).toBeGreaterThan(350);
      if (i) expect(ball.start).toBe(plan.balls[i - 1].end);
    }
    expect(plan.balls[0].start).toBe(BEATS.speed);
  });

  it('reaches the pause menu in about ten seconds, and holds there', () => {
    expect(plan.where).toBeGreaterThan(7000);
    expect(plan.where).toBeLessThan(11_000);
  });
});
