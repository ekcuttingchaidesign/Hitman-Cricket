import * as THREE from 'three';
import { seeded } from './turf';

/** Static near-camera cut grass. One draw, sharing the production turf map.
 * Far grass stays flat; no wind animation, alpha sorting or shadow-map draw.
 */
export function grassBlades(map: THREE.Texture) {
  const positions: number[] = [], normals: number[] = [], uv: number[] = [], colours: number[] = [], indices: number[] = [];
  const random = seeded(4911);
  const vertex = (x: number, y: number, z: number, shade: number) => {
    positions.push(x, y, z); normals.push(0, 1, 0);
    uv.push((x + 70) / 140, (80 - z) / 140);
    colours.push(shade, shade, shade);
  };
  for (let i = 0; i < 2600; i++) {
    const side = random() < .5 ? -1 : 1;
    const x = side * (1.52 + random() ** 1.7 * 7.5), z = -5.5 + random() * 20;
    const fade = 1 - THREE.MathUtils.smoothstep(z, 8, 14.5);
    const height = (.042 + random() * .036) * fade;
    if (height < .015) continue;
    const angle = random() * Math.PI * 2;
    for (let blade = 0; blade < 3; blade++) {
      const a = angle + blade * 2.1, w = .004 + random() * .004;
      const dx = Math.cos(a) * w, dz = Math.sin(a) * w;
      const n = positions.length / 3;
      vertex(x - dx, -.033, z - dz, .79);
      vertex(x + dx, -.033, z + dz, .79);
      vertex(x + Math.sin(a) * .025, -.033 + height * (.65 + random() * .35), z + Math.cos(a) * .025, 1.06);
      // Both windings, with upward turf normals, keep the base light response
      // consistent with the field instead of making black back-facing blades.
      indices.push(n, n + 1, n + 2, n + 2, n + 1, n);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colours, 3));
  geometry.setIndex(indices); geometry.computeBoundingSphere();
  const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ map, vertexColors: true, roughness: .95 }));
  mesh.name = 'Near-pitch grass blades'; mesh.receiveShadow = true;
  return mesh;
}
