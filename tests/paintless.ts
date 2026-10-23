import { vi } from 'vitest';

/**
 * A document whose canvases paint nothing, for what paints a texture (the
 * canopy's screen and roof, the brand's boards): the tests have no browser.
 * `vi.unstubAllGlobals()` in an `afterEach` takes it down.
 */
export function paintless() {
  const context = new Proxy({ canvas: { width: 1024, height: 384 } }, {
    get: (target, key) => key in target ? target[key as keyof typeof target]
      : key === 'createLinearGradient' || key === 'createRadialGradient' ? () => ({ addColorStop() {} })
      : key === 'measureText' ? () => ({ width: 0 }) : () => {},
    set: () => true,
  });
  vi.stubGlobal('document', { createElement: () => ({ width: 0, height: 0, getContext: () => context }) });
}
