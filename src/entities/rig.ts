import * as THREE from 'three';

/**
 * The small amount of skeleton maths every figure in the game shares. The
 * batter had it to himself while he was the only articulated body on the field;
 * the bowler and the fielders need the same joints solved the same way, so it
 * lives here rather than being written twice with two sets of rounding errors.
 */
export const UP = new THREE.Vector3(0, 1, 0);
export type Point = readonly [number, number, number];
export const V = (p: Point) => new THREE.Vector3(...p);
export const ease = (t: number) => { const x = THREE.MathUtils.clamp(t, 0, 1); return x * x * (3 - 2 * x); };
/** Ease that starts fast and settles, for a limb arriving rather than departing. */
export const settle = (t: number) => { const x = THREE.MathUtils.clamp(t, 0, 1); return 1 - (1 - x) * (1 - x); };
/** Progress through `[from, to]`, clamped — the spine of every phased action. */
export const span = (t: number, from: number, to: number) => THREE.MathUtils.clamp((t - from) / (to - from), 0, 1);

/** Two-bone joint with a stable bend plane and fixed segment lengths. */
export function solveJoint(start: THREE.Vector3, end: THREE.Vector3, upper: number, lower: number, pole: THREE.Vector3) {
  const axis = end.clone().sub(start);
  const distance = THREE.MathUtils.clamp(axis.length(), .001, upper + lower - .001);
  axis.normalize();
  const along = (upper * upper - lower * lower + distance * distance) / (2 * distance);
  const height = Math.sqrt(Math.max(0, upper * upper - along * along));
  const bend = pole.clone().sub(start);
  bend.addScaledVector(axis, -bend.dot(axis));
  if (bend.lengthSq() < .0001) bend.set(1, 0, 0).cross(axis);
  bend.normalize();
  return start.clone().addScaledVector(axis, along).addScaledVector(bend, height);
}

/**
 * Stretch a unit-tall mesh between two points. Every limb in the game is one of
 * these: the mesh carries the taper, this carries the placement.
 */
export function segment(mesh: THREE.Mesh, start: THREE.Vector3, end: THREE.Vector3, width: number, depth = width) {
  const axis = end.clone().sub(start);
  mesh.position.copy(start).add(end).multiplyScalar(.5);
  mesh.quaternion.setFromUnitVectors(UP, axis.clone().normalize());
  mesh.scale.set(width, Math.max(axis.length(), .001), depth);
}
