import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { homeViewFor } from '../src/scene/homeView';
import { BLAST_FIELD, TEST_FIELD } from '../src/scene/field';

/** Where a point lands across the picture, -1 to 1 edge to edge. */
function across(aspect: number, x: number, z: number) {
  const view = homeViewFor(aspect), camera = new THREE.PerspectiveCamera(view.fov, aspect, .1, 500);
  camera.position.set(...view.eye); camera.lookAt(...view.at); camera.updateMatrixWorld();
  return new THREE.Vector3(x, 1, z).project(camera).x;
}

describe("the game's view from behind the bat", () => {
  it('keeps the batter the size he was: no wider than 67 degrees up and down on any phone', () => {
    expect(homeViewFor(16 / 9).fov).toBeCloseTo(50, 6);
    expect(homeViewFor(2).fov).toBeCloseTo(50, 6);
    for (const aspect of [0.56, 9 / 16, 0.5, 402 / 874, 0.45]) expect(homeViewFor(aspect).fov).toBeCloseTo(67, 6);
  });

  it('has mid-on, mid-off, long-on and long-off well inside the picture, in Safari and saved to the home screen', () => {
    // Safari's page under its bars, the desktop column, and the iPhone's whole screen (402 by 874).
    for (const aspect of [0.56, 9 / 16, 0.5, 402 / 874, 0.45]) for (const man of [...BLAST_FIELD, ...TEST_FIELD]) {
      if (!/^(Mid|Long)-o/.test(man.name)) continue;
      expect(Math.abs(across(aspect, man.spot.x, man.spot.z)), `${man.name} at ${aspect}`).toBeLessThan(.88);
    }
  });
});
