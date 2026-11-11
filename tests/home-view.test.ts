import { describe, expect, it } from 'vitest';
import { VIEW, acrossOf, homeViewFor } from '../src/scene/homeView';

describe("the game's view from behind the bat", () => {
  it('keeps the view it had in Safari and wider screens', () => {
    expect(homeViewFor(16 / 9).fov).toBeCloseTo(50, 6);
    expect(homeViewFor(2).fov).toBeCloseTo(50, 6);
    // Safari on a phone: the page under the address bar and over the toolbar.
    expect(homeViewFor(0.56).fov).toBeCloseTo(VIEW.tallest, 6);
    expect(homeViewFor(9 / 16).fov).toBeCloseTo(VIEW.tallest, 6);
  });

  it('never gets narrower than Safari’s picture on a taller screen, the iPhone saved to its home screen', () => {
    for (const aspect of [0.55, 0.5, 0.46, 0.45]) {
      const { fov } = homeViewFor(aspect);
      expect(acrossOf(fov, aspect), `at ${aspect}`).toBeGreaterThanOrEqual(VIEW.across - 1e-6);
      expect(fov).toBeLessThanOrEqual(VIEW.widest);
    }
    // The 17 Pro's whole screen, 402 by 874: about 77 degrees up and down, not 67.
    expect(homeViewFor(402 / 874).fov).toBeGreaterThan(75);
  });

  it('only ever widens as the screen gets taller', () => {
    let last = 0;
    for (let aspect = 2; aspect >= 0.4; aspect -= 0.01) {
      const { fov } = homeViewFor(aspect);
      expect(fov).toBeGreaterThanOrEqual(last - 1e-9);
      last = fov;
    }
  });
});
