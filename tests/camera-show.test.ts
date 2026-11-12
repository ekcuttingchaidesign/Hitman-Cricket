import { describe, expect, it } from 'vitest';
import { CAMERAS } from '../src/game/camera';
import { cameraOf, goesOf, showDelivery, showOutcome, showPace, showSeconds, showTimes, SPEEDS, speedOf, VIEWS } from '../src/game/CameraShow';

describe('the cameras story', () => {
  it('plays the same six through every camera on the row, in its order', () => {
    expect(VIEWS).toEqual(CAMERAS.map(c => c.id));
    expect([0, 1, 2].map(go => cameraOf('views', go))).toEqual(['classic', 'close', 'pro']);
    for (let go = 0; go < goesOf('views'); go++) {
      const ball = showDelivery('views', go, 0), outcome = showOutcome('views', ball);
      expect(outcome.runs, `go ${go}`).toBe(6);
      expect(outcome.madeBatContact).toBe(true);
      expect(outcome.isWicket).toBe(false);
    }
  });

  it('slows through the bat meeting the ball, and is back to full speed after', () => {
    expect(showPace('views', -1000)).toBe(1);
    expect(showPace('views', 0)).toBeCloseTo(.4, 2);
    expect(showPace('views', 1000)).toBe(1);
  });
});

describe('FEEL THE BALL SPEED with Pro Cam', () => {
  it('is watched from his eyes on every ball', () => {
    for (let go = 0; go < 8; go++) expect(cameraOf('speed', go)).toBe('pro');
  });

  it('is the express bowler at the Tests’ own pace, each ball quicker to him than the Blast’s', () => {
    for (let go = 0; go < goesOf('speed'); go++) {
      const fast = showDelivery('speed', go, 0), stock = showDelivery('views', go, 0);
      expect(fast.express).toBe(true);
      expect(fast.speedKph).toBe(speedOf(go));
      expect(fast.speedKph).toBeGreaterThanOrEqual(145);
      expect(fast.durationMs).toBeLessThan(stock.durationMs * .65);
    }
    expect(SPEEDS.every(kph => kph >= 145 && kph <= 158)).toBe(true);
  });

  it('is left alone, the ball past him to the keeper, and never slowed', () => {
    for (let go = 0; go < goesOf('speed'); go++) {
      const outcome = showOutcome('speed', showDelivery('speed', go, 0));
      expect(outcome.madeBatContact, `go ${go}`).toBe(false);
      expect(outcome.isWicket, `go ${go}`).toBe(false);
      expect(outcome.runs).toBe(0);
    }
    for (const since of [-500, 0, 300]) expect(showPace('speed', since)).toBe(1);
  });

  it('comes ball after ball, under two and a half seconds each', () => {
    for (let go = 0; go < goesOf('speed'); go++) {
      const times = showTimes('speed', go);
      expect(times.length).toBeLessThan(2500);
      expect(times.contact - times.release).toBeLessThan(560);
    }
  });
});

describe('how long each card holds', () => {
  it('is one round of its balls', () => {
    const views = showSeconds('views'), speed = showSeconds('speed');
    expect(views).toBeGreaterThan(9000);
    expect(views).toBeLessThan(16000);
    expect(speed).toBeGreaterThan(6000);
    expect(speed).toBeLessThan(10000);
  });
});
