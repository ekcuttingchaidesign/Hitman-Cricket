import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * The scenery's toolkit: the club colours, one material per colour, and the
 * box and the post everything on the ground is put together from. Shared by
 * the scene and by the grounds it is built on, so a colour is one material
 * however many places ask for it.
 */
export const colors = { navy: 0x19334a, orange: 0xf37943, white: 0xf8f1df, skin: 0xb77950 };
const materials = new Map<number, THREE.MeshStandardMaterial>();
// Scenery keeps its faceted, low-poly look; anything sculpted asks for `soft`.
export function mat(color: number) {
  if (!materials.has(color)) materials.set(color, new THREE.MeshStandardMaterial({ color, roughness: 0.85, flatShading: true }));
  return materials.get(color)!;
}
/** Forgets every material handed out, once a scene has disposed of them. */
export function forgetMaterials() { materials.clear(); }
export function soft(color: number, roughness = 0.72) {
  const key = color + 0x1000000;
  if (!materials.has(key)) materials.set(key, new THREE.MeshStandardMaterial({ color, roughness }));
  return materials.get(key)!;
}
export function box(parent: THREE.Object3D, w: number, h: number, d: number, color: number, x = 0, y = 0, z = 0) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color));
  mesh.position.set(x, y, z); mesh.castShadow = true; mesh.receiveShadow = true; parent.add(mesh); return mesh;
}
export function cylinder(parent: THREE.Object3D, r: number, h: number, color: number, x: number, y: number, z: number, sides = 8) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, sides), sides > 8 ? soft(color, 0.8) : mat(color));
  mesh.position.set(x, y, z); mesh.castShadow = true; parent.add(mesh); return mesh;
}

/**
 * Scenery laid down piece by piece and drawn as one mesh a colour.
 *
 * Every `box` above is a draw call, and two where it is in the sun's shadow
 * frustum. A stand built that way costs a hundred-odd a frame for something
 * that never moves, so a ground built from a `Batch` pays one call for each
 * colour in it instead: the pieces are put where they go, in the ground's own
 * frame, and merged when it is finished.
 */
export class Batch {
  private parts = new Map<number, THREE.BufferGeometry[]>();
  private static here = new THREE.Matrix4();

  /** Any geometry, moved by `frame` (where it stands on the ground) and kept under its colour. */
  add(geometry: THREE.BufferGeometry, color: number, frame: THREE.Matrix4 = Batch.here) {
    geometry.applyMatrix4(frame);
    const list = this.parts.get(color) ?? [];
    list.push(geometry); this.parts.set(color, list);
  }
  box(w: number, h: number, d: number, color: number, x: number, y: number, z: number, frame?: THREE.Matrix4, tilt = 0) {
    const geometry = new THREE.BoxGeometry(w, h, d);
    if (tilt) geometry.rotateX(tilt);
    this.add(geometry.translate(x, y, z), color, frame);
  }
  post(r: number, h: number, color: number, x: number, y: number, z: number, frame?: THREE.Matrix4) {
    this.add(new THREE.CylinderGeometry(r, r, h, 6).translate(x, y, z), color, frame);
  }
  /** A four-sided peak on a `w` by `d` base whose foot is at `y`: a tent, or a slate roof. */
  peak(w: number, h: number, d: number, color: number, x: number, y: number, z: number, frame?: THREE.Matrix4) {
    const geometry = new THREE.ConeGeometry(Math.SQRT1_2, 1, 4).rotateY(Math.PI / 4).scale(w, h, d);
    this.add(geometry.translate(x, y + h / 2, z), color, frame);
  }
  /** One mesh a colour, under `parent`. */
  build(parent: THREE.Object3D) {
    for (const [color, list] of this.parts) {
      const mesh = new THREE.Mesh(mergeGeometries(list), mat(color));
      mesh.castShadow = true; mesh.receiveShadow = true;
      parent.add(mesh);
      list.forEach(geometry => geometry.dispose());
    }
    this.parts.clear();
  }
}
