import * as THREE from 'three';
import { box, colors, cylinder, mat } from './build';
import { stadium, type StadiumLights } from './stadium';

/**
 * The stands and everything over them: what a ground is, once the turf and
 * the boards along the rope are taken as given.
 *
 * Two are built. **The stadium** (`stadium.ts`) is the one every mode plays
 * in: a two-tier bowl right round the ground under a cantilever roof, with the
 * commentary box over the far end and floodlight towers behind it.
 *
 * **The bowl** is the ground before it: one tier of stands in a full ring, flat
 * roofs, and the low clubhouse with the flags. It is kept whole, line for line,
 * so it can be looked at again with `?ground=bowl` and stood beside the new
 * one.
 *
 * Both are laid out in the stage's own frame, which `GameScene` mirrors so the
 * leg side reads left: the bowler's end is +z, and both are symmetric enough
 * across x that the mirror changes nothing anybody would notice.
 */
export type GroundName = 'stadium' | 'bowl';

export const GROUNDS: readonly GroundName[] = ['stadium', 'bowl'];

/** The ground every innings is played on unless the link asks for another. */
export const DEFAULT_GROUND: GroundName = 'stadium';

/** `?ground=bowl` puts the old ground back; anything else, or nothing, is the default. */
export function groundFrom(search: string): GroundName {
  const asked = new URLSearchParams(search).get('ground')?.toLowerCase();
  return GROUNDS.find(name => name === asked) ?? DEFAULT_GROUND;
}

/** Builds a ground onto `world`; the stadium hands back its lamps, for the night. */
export function buildGround(name: GroundName, world: THREE.Object3D): StadiumLights | null {
  if (name === 'bowl') { bowl(world); return null; }
  return stadium(world);
}

/** Whether a ground brings its own floodlights, in place of the four poles `GameScene` stands up for the bowl. */
export const ownFloodlights = (name: GroundName) => name === 'stadium';

/** The ground as it was, unchanged. */
function bowl(world: THREE.Object3D) {
  const seatGeometry = new THREE.BoxGeometry(0.6, 0.55, 0.55);
  const crowd = new THREE.InstancedMesh(seatGeometry, mat(0xffffff), 1344);
  const dummy = new THREE.Object3D(); let index = 0;
  const seatColors = [0x22465a, 0xf5bf71, 0xc8dbce, 0xf4794c, 0xe9e0c9, 0x467787];
  for (let section = 0; section < 28; section++) {
    const a = section / 28 * Math.PI * 2;
    const group = new THREE.Group(); group.position.set(Math.sin(a) * 39, 0, 10 + Math.cos(a) * 39); group.rotation.y = a; world.add(group);
    for (let row = 0; row < 4; row++) {
      box(group, 8.5, 0.7 + row * 0.7, 1.4, 0x7d9397, 0, (0.7 + row * 0.7) / 2, -1.7 + row * 1.4);
      for (let col = 0; col < 12; col++) {
        dummy.position.set(-3.9 + col * 0.71, 1 + row * 0.7, -1.7 + row * 1.4);
        dummy.position.applyAxisAngle(new THREE.Vector3(0, 1, 0), a).add(group.position);
        dummy.rotation.y = a; dummy.updateMatrix(); crowd.setMatrixAt(index, dummy.matrix);
        crowd.setColorAt(index, new THREE.Color(seatColors[(section * 13 + row * 7 + col * 3 + col % 2) % seatColors.length])); index++;
      }
    }
    if (section % 4 !== 0) {
      box(group, 9.1, 0.25, 7.5, 0xc7d3cd, 0, 5.3, 0.4).rotation.x = -0.07;
      [-3.9, 3.9].forEach(x => cylinder(group, 0.075, 5.2, 0x627d83, x, 2.6, 3.3));
    }
  }
  crowd.instanceMatrix.needsUpdate = true; world.add(crowd);
  // Clubhouse pavilion at the bowler's end.
  box(world, 13, 7, 5, 0xe0d7bc, 0, 3.5, 53);
  box(world, 15, 0.45, 6, colors.navy, 0, 7, 53);
  box(world, 9, 2, 0.08, colors.navy, 0, 4.1, 50.46);
  for (let i = -2; i <= 2; i++) box(world, 1.3, 1.6, 0.1, 0x406876, i * 2.4, 1.8, 50.45);
  for (let i = -1; i <= 1; i++) {
    cylinder(world, 0.05, 3, 0xe9e3cb, i * 4, 8.6, 53);
    box(world, 1.15, 0.65, 0.04, i === 0 ? colors.orange : colors.navy, i * 4 + 0.56, 9.5, 53);
  }
}
