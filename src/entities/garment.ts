import * as THREE from 'three';

/** A tailored jersey: elliptical sections through waist, chest, shoulders and neck.
 * Authored in the existing rig's coordinates so no stroke or contact point moves.
 * The profile is continuous; there is no second chest shell intersecting it.
 */
export function jerseyGeometry(rows = 32, sides = 24) {
  const profile = new THREE.CatmullRomCurve3([
    new THREE.Vector3(.164, -.337, .124),
    new THREE.Vector3(.166, -.315, .129),
    new THREE.Vector3(.156, -.23, .128),
    new THREE.Vector3(.181, -.12, .141),
    new THREE.Vector3(.216, -.025, .148),
    new THREE.Vector3(.220, .045, .144),
    new THREE.Vector3(.184, .105, .121),
    new THREE.Vector3(.108, .143, .087),
    new THREE.Vector3(.062, .165, .064),
  ]);
  const vertices: number[] = [], uv: number[] = [], indices: number[] = [];
  for (let j = 0; j <= rows; j++) {
    const p = profile.getPoint(j / rows);
    for (let i = 0; i <= sides; i++) {
      const angle = i / sides * Math.PI * 2;
      vertices.push(Math.sin(angle) * p.x, p.y, Math.cos(angle) * p.z);
      uv.push(i / sides, j / rows);
      if (j < rows && i < sides) {
        const a = j * (sides + 1) + i, b = a + sides + 1;
        indices.push(a, a + 1, b, a + 1, b + 1, b);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geometry.setIndex(indices); geometry.computeVertexNormals();
  // Average the duplicated seam normals: no bright zipper down the jersey.
  const normals = geometry.getAttribute('normal');
  for (let j = 0; j <= rows; j++) {
    const a = j * (sides + 1), b = a + sides;
    const n = new THREE.Vector3().fromBufferAttribute(normals, a)
      .add(new THREE.Vector3().fromBufferAttribute(normals, b)).normalize();
    normals.setXYZ(a, n.x, n.y, n.z); normals.setXYZ(b, n.x, n.y, n.z);
  }
  return geometry;
}
