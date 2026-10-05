import * as THREE from 'three';

/** +Z faces the bat. The rear rim dips centrally and rises toward the sides. */
function shellPoint(angle: number, t: number) {
  const front = Math.max(0, Math.cos(angle)), back = Math.max(0, -Math.cos(angle));
  // A shallow smile from behind: low at the centre, high at either corner.
  // Keep the whole rear edge clear of the neck rather than cutting an arch into it.
  const rimY = .035 * front ** 2 - .015 * (1 - front ** 2) - .035 * back ** 2;
  const phi = t * Math.acos((rimY - .024) / .184);
  return new THREE.Vector3(.183 * Math.sin(phi) * Math.sin(angle),
    .024 + .184 * Math.cos(phi), -.012 + .19 * Math.sin(phi) * Math.cos(angle));
}

/** Oval crown with a smile-shaped rear edge, instead of a central nape cutout. */
export function helmetGeometry() {
  const rows = 20, sides = 40, positions: number[] = [], indices: number[] = [];
  for (let j = 0; j <= rows; j++) for (let i = 0; i <= sides; i++) {
    const p = shellPoint(i / sides * Math.PI * 2, j / rows); positions.push(p.x, p.y, p.z);
    if (j < rows && i < sides) {
      const a = j * (sides + 1) + i, b = a + sides + 1;
      indices.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(positions.length / 3 * 2), 2));
  geometry.setIndex(indices); geometry.computeVertexNormals();
  const normals = geometry.getAttribute('normal');
  for (let j = 0; j <= rows; j++) {
    const a = j * (sides + 1), b = a + sides;
    const n = new THREE.Vector3().fromBufferAttribute(normals, a).add(new THREE.Vector3().fromBufferAttribute(normals, b)).normalize();
    normals.setXYZ(a, n.x, n.y, n.z); normals.setXYZ(b, n.x, n.y, n.z);
  }
  return geometry;
}

export function helmetRimGeometry() {
  const points = Array.from({ length: 48 }, (_, i) => shellPoint(i / 48 * Math.PI * 2, 1));
  return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points, true), 48, .0035, 5, true);
}
