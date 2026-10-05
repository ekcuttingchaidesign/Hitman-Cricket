import * as THREE from 'three';

/** A cricket shell: close at the nape, broad above the ears, rounded crown.
 * The face stays open beneath the peak; ear guards are separate rigid pieces.
 */
export function helmetGeometry() {
  const profile = new THREE.SplineCurve([
    new THREE.Vector2(.157, -.085),
    new THREE.Vector2(.181, -.055),
    new THREE.Vector2(.19, .005),
    new THREE.Vector2(.178, .085),
    new THREE.Vector2(.135, .155),
    new THREE.Vector2(.071, .193),
    new THREE.Vector2(0, .205),
  ]);
  return new THREE.LatheGeometry(profile.getPoints(24), 28).scale(1, 1, 1.04).translate(0, 0, -.018);
}
