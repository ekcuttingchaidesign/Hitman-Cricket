import { describe, expect, it } from 'vitest';
import { renderPixelRatio } from '../src/scene/visuals/renderResolution';

describe('game drawing-buffer resolution', () => {
  it('uses all native pixels on a typical 3x portrait phone', () => {
    const ratio = renderPixelRatio(390, 844, 3, true, 8192);
    expect(ratio).toBe(3);
    expect(390 * ratio).toBe(1170);
    expect(844 * ratio).toBe(2532);
  });

  it.each([1, 1.25, 1.5, 2])('does not supersample a %sx display', native => {
    expect(renderPixelRatio(390, 844, native, true, 8192)).toBe(native);
  });

  it.each([
    [1024, 1366, true, 3_500_000],
    [1366, 1024, true, 3_500_000],
    [3840, 2160, false, 6_000_000],
  ] as const)('bounds allocation for %s x %s', (width, height, touch, budget) => {
    const ratio = renderPixelRatio(width, height, 3, touch, 8192);
    expect(width * height * ratio ** 2).toBeLessThanOrEqual(budget + 1);
    expect(ratio).toBeGreaterThan(0);
  });

  it('respects the graphics driver dimension limit on long viewports', () => {
    const ratio = renderPixelRatio(390, 1800, 3, true, 2048);
    expect(1800 * ratio).toBeLessThanOrEqual(2048);
    expect(390 * ratio).toBeLessThanOrEqual(2048);
  });
});
