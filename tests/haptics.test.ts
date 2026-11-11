import { afterEach, describe, expect, it, vi } from 'vitest';

describe('the Vibration switch', () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); });

  it('buzzes while it is on, and nothing buzzes once it is off, kept for next time', async () => {
    const store = new Map<string, string>();
    const vibrate = vi.fn((_pattern: number | number[]) => true);
    vi.stubGlobal('localStorage', { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v) });
    vi.stubGlobal('navigator', { vibrate, userAgent: 'Android' });
    const { buzz, setHaptics, hapticsWanted, HAPTICS_KEY } = await import('../src/game/haptics');
    expect(hapticsWanted()).toBe(true);
    expect(buzz([12, 30, 12])).toBe(true);
    expect(vibrate).toHaveBeenCalledTimes(1);
    setHaptics(false);
    expect(store.get(HAPTICS_KEY)).toBe('off');
    expect(buzz(20)).toBe(false);
    // Turned off, the one call is the stop: nothing new is played.
    expect(vibrate.mock.calls.filter(([p]) => p !== 0)).toHaveLength(1);
    // A fresh load reads it back.
    vi.resetModules();
    const again = await import('../src/game/haptics');
    expect(again.hapticsWanted()).toBe(false);
    again.setHaptics(true);
    expect(again.buzz(20)).toBe(true);
  });
});
