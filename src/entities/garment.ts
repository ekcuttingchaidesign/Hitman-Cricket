import * as THREE from 'three';
import { SHAPES, type BodyShape } from './physique';

/**
 * How far the bust stands the shirt out at a point of it: fullest a little
 * below the chest anchor and either side of the middle, falling away faster
 * above than below, where the shirt hangs from it rather than tucking under.
 */
function bustAt(angle: number, y: number) {
  const front = Math.max(0, Math.cos(angle)), across = Math.sin(angle);
  const band = Math.exp(-(((y + .04) / (y > -.04 ? .045 : .07)) ** 2));
  return front * front * band * (1 - .3 * Math.exp(-((across / .18) ** 2)));
}

/** A tailored jersey: elliptical sections through waist, chest, shoulders and neck.
 * Authored in the existing rig's coordinates so no stroke or contact point moves.
 * The profile is continuous; there is no second chest shell intersecting it.
 */
export function jerseyGeometry(rows = 32, sides = 24, shape: BodyShape = SHAPES.male) {
  const profile = new THREE.CatmullRomCurve3(shape.jersey.map(([x, y, z]) => new THREE.Vector3(x, y, z)));
  const vertices: number[] = [], uv: number[] = [], indices: number[] = [];
  for (let j = 0; j <= rows; j++) {
    const p = profile.getPoint(j / rows);
    for (let i = 0; i <= sides; i++) {
      const angle = i / sides * Math.PI * 2;
      vertices.push(Math.sin(angle) * p.x, p.y, Math.cos(angle) * p.z + (shape.bust && shape.bust * bustAt(angle, p.y)));
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
