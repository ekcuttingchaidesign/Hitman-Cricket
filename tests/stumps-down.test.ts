import { describe, expect, it } from 'vitest';
import { GAME } from '../src/config/gameplay';
import { STUMP_XS } from '../src/scene/wicket';
import { STUMP, bailPose, fallOf, landing, stumpPose, type Fall } from '../src/scene/stumpsDown';

/** The lower end of a stump, off its foot pose: the foot itself, or the top where it has turned over. */
const lowest = (p: ReturnType<typeof stumpPose>) => Math.min(p.y, p.y + STUMP.height * Math.cos(p.rx));

describe('the wicket going down', () => {
  it('uproots the stump a yorker hits, on whatever line it comes', () => {
    STUMP_XS.forEach((x, i) => {
      for (const kph of [120, 140, 152.4, 165]) {
        const hit = fallOf(x + .01, .08, kph, true);
        expect(hit.fall).toBe('uproot'); expect(hit.struck).toBe(i); expect(hit.yorker).toBe(true);
        // Out of the ground, back towards the keeper, and down on the turf a little later.
        const flying = stumpPose(hit, i, 200), down = stumpPose(hit, i, 1600);
        expect(flying.y).toBeGreaterThan(.1); expect(down.z).toBeLessThan(-.8);
        expect(Math.abs(Math.cos(down.rx))).toBeLessThan(.05);
        expect(down.y).toBeLessThan(.06);
        // The other two only shiver, and are still again soon.
        STUMP_XS.forEach((_, j) => { if (j !== i) expect(Math.abs(stumpPose(hit, j, 1600).rx)).toBeLessThan(.002); });
      }
    });
  });

  it('kicks a yorker’s stump foot first, the top towards the bowler; a ball higher up knocks the top back', () => {
    const yorker = fallOf(0, .1, 145, true), higher = { ...fallOf(0, .4, 145, false), fall: 'uproot' as const, yorker: false };
    expect(stumpPose(yorker, 1, 60).rx).toBeGreaterThan(0);
    expect(stumpPose(higher, 1, 60).rx).toBeLessThan(0);
  });

  it('never puts an uprooted stump through the turf, and lands it once', () => {
    for (let kph = 70; kph <= 170; kph += 7.3) for (const yorker of [true, false]) {
      const hit = { ...fallOf(.145, yorker ? .1 : .4, kph, yorker), fall: 'uproot' as const };
      expect(landing(hit)).toBeGreaterThan(.12); expect(landing(hit)).toBeLessThan(2);
      for (let ms = 0; ms <= 2000; ms += 10) expect(lowest(stumpPose(hit, hit.struck, ms)), `${kph} ${yorker} at ${ms}`).toBeGreaterThan(-.03);
    }
  });

  it('clips the bails off a ball at the top of the stumps, and leaves the stumps standing', () => {
    const hit = fallOf(.02, GAME.stumpHeight - .02, 140, false);
    expect(hit.fall).toBe('clip');
    for (let i = 0; i < 3; i++) expect(Math.abs(stumpPose(hit, i, 1200).rx)).toBeLessThan(.002);
  });

  it('varies how any other bowled ball takes the wicket, and the same ball always the same way', () => {
    const seen = new Set<Fall>();
    for (let kph = 80; kph <= 160; kph += .37) {
      const hit = fallOf(-.13, .35, kph, false);
      seen.add(hit.fall);
      expect(fallOf(-.13, .35, kph, false)).toEqual(hit);
    }
    for (const fall of ['clip', 'lean', 'uproot'] as const) expect(seen).toContain(fall);
    // Between two stumps, mostly both go.
    const splays = Array.from({ length: 200 }, (_, i) => fallOf(.075, .35, 100 + i * .3, false)).filter(h => h.fall === 'splay');
    expect(splays.length).toBeGreaterThan(100);
    expect(splays.every(h => h.second !== null && Math.abs(h.second - h.struck) === 1)).toBe(true);
  });

  it('sends a quick ball’s stump cartwheeling more often than a slow one’s', () => {
    const share = (lo: number) => Array.from({ length: 400 }, (_, i) => fallOf(0, .35, lo + i * .05, false)).filter(h => h.fall === 'uproot').length / 400;
    expect(share(145)).toBeGreaterThan(share(80) + .15);
  });

  it('leaves a knocked stump leaning back in its hole, and splayed ones leaning apart', () => {
    const lean = { ...fallOf(0, .35, 120, false), fall: 'lean' as const };
    const at = stumpPose(lean, 1, 1500);
    expect(at.rx).toBeLessThan(-.3); expect(at.rx).toBeGreaterThan(-.7); expect(at.y).toBe(0);
    const splay = fallOf(.075, .35, 130, false);
    if (splay.fall === 'splay') {
      const a = stumpPose(splay, splay.struck, 1500), b = stumpPose(splay, splay.second!, 1500);
      expect(Math.sign(a.rz)).not.toBe(Math.sign(b.rz));
    }
  });

  it('flings both bails back off the wicket and down onto the turf', () => {
    for (const fall of ['clip', 'lean', 'uproot', 'splay'] as const) for (let i = 0; i < 2; i++) {
      const hit = { ...fallOf(0, .35, 130, false), fall, second: 0 };
      const rest = { x: i ? .073 : -.073, y: GAME.stumpHeight + .02 };
      const start = bailPose(hit, i, 0, rest), end = bailPose(hit, i, 620, rest);
      expect(start.x).toBeCloseTo(rest.x, 9); expect(start.y).toBeCloseTo(rest.y, 9); expect(start.z).toBe(-0);
      expect(end.z).toBeLessThan(-.9); expect(end.y).toBeLessThanOrEqual(.1);
    }
  });
});

describe('played on', () => {
  it('only dislodges the bails off an inside edge, whatever the line, length or pace', () => {
    for (const x of [-.15, -.07, 0, .07, .15]) for (const y of [.08, .3, .5]) for (const kph of [80, 140, 165]) for (const yorker of [false, true]) {
      const hit = fallOf(x, y, kph, yorker, true);
      expect(hit.fall).toBe('clip'); expect(hit.yorker).toBe(false);
      for (let i = 0; i < 3; i++) {
        const p = stumpPose(hit, i, 1500);
        expect(Math.abs(p.rx)).toBeLessThan(.002); expect(p.y).toBe(0); expect(p.z).toBe(0);
      }
    }
  });
});

describe("the spinner's ball", () => {
  it('never uproots a stump, however low or on whatever line, but still knocks one back or takes the bails', () => {
    const falls = new Set<string>();
    for (const x of [-.15, -.07, 0, .07, .15]) for (const y of [.06, .15, .3, .5]) for (let kph = 70; kph <= 100; kph += .7) {
      const hit = fallOf(x, y, kph, false, false, true);
      expect(hit.fall).not.toBe('uproot'); expect(hit.yorker).toBe(false);
      falls.add(hit.fall);
    }
    expect(falls).toContain('lean'); expect(falls).toContain('clip');
  });
});
