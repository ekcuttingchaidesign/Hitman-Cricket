import { afterEach, describe, expect, it, vi } from 'vitest';
import { InputManager, mapSwipe } from '../src/game/InputManager';
import { outcomeSound } from '../src/game/Audio';

describe('swipe directions', () => {
  it.each([
    [-80, 0, 'LEG'], [-60, -60, 'LONG_ON'], [0, -80, 'STRAIGHT'], [60, -60, 'COVER_LONG_OFF'], [80, 0, 'OFF'],
    [0, 80, null], [-60, 60, null], [60, 60, null], [0, 0, null], [12, -12, null], [23, 0, null], [24, 0, 'OFF'],
    [NaN, 0, null], [Infinity, 0, null],
  ])('maps (%s, %s) to %s', (x, y, result) => expect(mapSwipe(Number(x), Number(y))).toBe(result));
  it('keeps a useful tolerance around the cardinal directions', () => {
    expect(mapSwipe(70, 15)).toBe('OFF'); expect(mapSwipe(-70, 15)).toBe('LEG'); expect(mapSwipe(15, -70)).toBe('STRAIGHT');
  });
});

// EventTarget exercises the actual input listeners without a browser or WebGL.
class Surface extends EventTarget {
  captures = new Set<number>();
  blocked = false;
  setPointerCapture(id: number) { this.captures.add(id); }
  hasPointerCapture(id: number) { return this.captures.has(id); }
  releasePointerCapture(id: number) { this.captures.delete(id); }
  closest() { return this.blocked ? this : null; }
}
function setup() {
  const keyboard = new EventTarget(); vi.stubGlobal('window', keyboard); vi.stubGlobal('Element', Surface);
  const surface = new Surface(); let active = true; let now = 100;
  const shoot = vi.fn();
  const input = new InputManager(() => active, () => now, shoot, surface as unknown as HTMLElement);
  const pointer = (type: string, x: number, y: number, options: object = {}) => {
    const event = new Event(type, { cancelable: true });
    Object.assign(event, { pointerId: 1, pointerType: 'touch', isPrimary: true, clientX: x, clientY: y, ...options });
    surface.dispatchEvent(event);
  };
  return { input, shoot, surface, pointer, keyboard, time: (time: number) => now = time, active: (value: boolean) => active = value };
}
afterEach(() => vi.unstubAllGlobals());
describe('touch input integration', () => {
  it('commits at threshold crossing, not when the thumb is placed or lifted', () => {
    const s = setup(); s.pointer('pointerdown', 100, 100); s.time(350); s.pointer('pointermove', 108, 92);
    expect(s.shoot).not.toHaveBeenCalled(); s.time(400); s.pointer('pointermove', 130, 70);
    expect(s.shoot).toHaveBeenCalledExactlyOnceWith('COVER_LONG_OFF', 400);
    s.time(700); s.pointer('pointerup', 200, 0); expect(s.shoot).toHaveBeenCalledTimes(1); s.input.dispose();
  });
  it('permits only one swipe per delivery and resets for the next', () => {
    const s = setup();
    for (let i = 0; i < 3; i++) { s.pointer('pointerdown', 100, 100); s.pointer('pointermove', 60, 100); s.pointer('pointerup', 60, 100); }
    expect(s.shoot).toHaveBeenCalledTimes(1); s.input.reset(); s.pointer('pointerdown', 100, 100); s.pointer('pointerup', 100, 60);
    expect(s.shoot).toHaveBeenLastCalledWith('STRAIGHT', 100); expect(s.shoot).toHaveBeenCalledTimes(2); s.input.dispose();
  });
  it('ignores taps, inactive play, and drags starting on controls', () => {
    const s = setup(); s.pointer('pointerdown', 100, 100); s.pointer('pointerup', 100, 100);
    s.active(false); s.pointer('pointerdown', 100, 100); s.pointer('pointermove', 0, 100);
    s.active(true); s.surface.blocked = true; s.pointer('pointerdown', 100, 100); s.pointer('pointermove', 0, 100);
    expect(s.shoot).not.toHaveBeenCalled(); s.input.dispose();
  });
  it('cancels interrupted, multi-touch, paused, and cross-delivery gestures', () => {
    const s = setup();
    for (const cancel of ['pointercancel', 'second-finger', 'pause', 'reset']) {
      s.pointer('pointerdown', 100, 100);
      if (cancel === 'second-finger') s.pointer('pointerdown', 200, 100, { pointerId: 2, isPrimary: false });
      else if (cancel === 'pause') s.input.cancel();
      else if (cancel === 'reset') s.input.reset();
      else s.pointer(cancel, 100, 100);
      s.pointer('pointermove', 0, 100);
    }
    expect(s.shoot).not.toHaveBeenCalled(); expect(s.surface.captures.size).toBe(0); s.input.dispose();
  });
  it('shares the one-shot gate with keyboard input and removes listeners on disposal', () => {
    const s = setup(); s.pointer('pointerdown', 100, 100); s.pointer('pointermove', 0, 100);
    const key = new Event('keydown', { cancelable: true }); Object.assign(key, { key: 'w', repeat: false }); s.keyboard.dispatchEvent(key); s.input.flush(500);
    expect(s.shoot).toHaveBeenCalledTimes(1); s.input.reset(); s.input.dispose();
    s.pointer('pointerdown', 100, 100); s.pointer('pointermove', 0, 100); expect(s.shoot).toHaveBeenCalledTimes(1);
  });
});

describe('user-supplied hit sounds', () => {
  it.each([0, 1, 2, 3] as const)('uses normal hit for %s runs with bat contact', runs => {
    expect(outcomeSound({ runs, madeBatContact: true, isWicket: false })).toBe('hit');
  });
  it.each([4, 6] as const)('uses the boundary clip for %s', runs => {
    expect(outcomeSound({ runs, madeBatContact: true, isWicket: false })).toBe('boundary');
  });
  it('does not play a hit sound on a miss or dismissal', () => {
    expect(outcomeSound({ runs: 0, madeBatContact: false, isWicket: false })).toBeNull();
    expect(outcomeSound({ runs: 0, madeBatContact: true, isWicket: true })).toBe('wicket');
  });
});
