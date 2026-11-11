import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { VIEW, acrossOf, homeViewFor } from '../src/scene/homeView';
import { BLAST_FIELD, TEST_FIELD } from '../src/scene/field';

/** Where a point lands across the picture, -1 to 1 edge to edge. */
function across(aspect: number, x: number, z: number) {
  const view = homeViewFor(aspect), camera = new THREE.PerspectiveCamera(view.fov, aspect, .1, 500);
  camera.position.set(...view.eye); camera.lookAt(...view.at); camera.updateMatrixWorld();
  return new THREE.Vector3(x, 1, z).project(camera).x;
}

describe("the game's view from behind the bat", () => {
  it('keeps the view it had on wide screens', () => {
    expect(homeViewFor(16 / 9).fov).toBeCloseTo(50, 6);
    expect(homeViewFor(2).fov).toBeCloseTo(50, 6);
  });

  it('has every man in the field in front of the bat well inside the picture, in Safari and saved to the home screen', () => {
    // Safari's page under its bars, the desktop column, and the iPhone's whole screen (402 by 874).
    for (const aspect of [0.56, 9 / 16, 0.5, 402 / 874, 0.45]) for (const man of [...BLAST_FIELD, ...TEST_FIELD]) {
      const x = across(aspect, man.spot.x, man.spot.z);
      // Mid-on and mid-off, long-on and long-off: the ones the picture is for. Deep midwicket, cover and the rest stand square, out of it.
      if (/^(Mid|Long)-o/.test(man.name)) expect(Math.abs(x), `${man.name} at ${aspect}`).toBeLessThan(.9);
    }
  });

  it('never gets narrower than that, and never wider than the widest', () => {
    for (const aspect of [0.56, 0.5, 0.46, 0.45]) {
      const { fov } = homeViewFor(aspect);
      expect(acrossOf(fov, aspect), `at ${aspect}`).toBeGreaterThanOrEqual(VIEW.across - 1e-6);
      expect(fov).toBeLessThanOrEqual(VIEW.widest);
    }
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
