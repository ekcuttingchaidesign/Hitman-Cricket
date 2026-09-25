import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
/** Merge static architecture per sector/material, retaining useful culling. */
function batch(group: THREE.Group) {
  group.updateMatrixWorld(true);
  const byMaterial = new Map<THREE.Material, THREE.BufferGeometry[]>();
  for(const child of [...group.children])
    if(child instanceof THREE.Mesh && !(child instanceof THREE.InstancedMesh)) {
      const material = child.material as THREE.Material, geometry = (child.geometry.index ? child.geometry.toNonIndexed() : child.geometry.clone()).applyMatrix4(child.matrix);
      const entries = byMaterial.get(material) ?? [];
      entries.push(geometry);
      byMaterial.set(material, entries);
      child.geometry.dispose();
      group.remove(child);
    }
  for(const [material, geometries] of byMaterial) {
    const mesh = new THREE.Mesh(mergeGeometries(geometries), material);
    mesh.receiveShadow = true;
    group.add(mesh);
    geometries.forEach(g => g.dispose());
  }
}
export function createVenue() {
  const root = new THREE.Group();
  root.name = 'Hitman Oval — pavilion, seated crowd and treeline';
  const material = (color: number, roughness = .85) => new THREE.MeshStandardMaterial({ color, roughness });
  const navy = material(0x203d55), cream = material(0xd8ded9), concrete = material(0x9daeb0), orange = material(0xe86e31), white = material(0xf0f3ef), dark = material(0x47616a), glass = material(0x365c70, .32);
  glass.metalness = .28;
  const box = (g: THREE.Group, w: number, h: number, d: number, m: THREE.Material, x: number, y: number, z: number, bevel = false) => {
    const mesh = new THREE.Mesh(bevel ? new RoundedBoxGeometry(w, h, d, 2, Math.min(w, h, d) * .15) : new THREE.BoxGeometry(w, h, d), m);
    mesh.position.set(x, y, z);
    g.add(mesh);
    return mesh;
  };
  const body = new THREE.InstancedMesh(new THREE.CapsuleGeometry(.16, .26, 2, 6), material(0xffffff), 1344);
  const heads = new THREE.InstancedMesh(new THREE.SphereGeometry(.12, 8, 6), material(0xffffff), 1344);
  const seats = new THREE.InstancedMesh(new THREE.BoxGeometry(.44, .12, .48), navy, 1344);
  const dummy = new THREE.Object3D(), yAxis = new THREE.Vector3(0, 1, 0), col = new THREE.Color();
  let index = 0;
  const shirts = [0xe76e31, 0x294b66, 0xd8d5b7, 0x568590, 0xe9af64, 0xc0ccc3], skins = [0xb87b51, 0xe2ac7d, 0x935e42, 0xcb9267];
  for(let section = 0; section < 28; section++) {
    const a = section / 28 * Math.PI * 2, g = new THREE.Group();
    g.position.set(Math.sin(a) * 39, 0, 10 + Math.cos(a) * 39);
    g.rotation.y = a;
    root.add(g);
    box(g, 8.7, 1.5, 1.2, section % 3 ? navy : orange, 0, .75, -3.3);
    box(g, 8.72, .14, 1.26, cream, 0, 1.53, -3.3);
    box(g, 8.7, .12, .06, white, 0, .19, -3.94);
    for(let row = 0; row < 4; row++) {
      const h = .7 + row * .7, z = -1.7 + row * 1.4;
      box(g, 8.5, h, 1.4, concrete, 0, h / 2, z);
      box(g, 8.5, .08, .18, cream, 0, h + .04, z - .58);
      for(let c = 0; c < 12; c++) {
        const base = new THREE.Vector3(-3.9 + c * .71, 1 + row * .7, z).applyAxisAngle(yAxis, a).add(g.position);
        dummy.rotation.set(0, a, 0);
        dummy.scale.set(1, 1, 1);
        dummy.position.copy(base).add(new THREE.Vector3(0, .28, 0));
        dummy.updateMatrix();
        body.setMatrixAt(index, dummy.matrix);
        body.setColorAt(index, col.setHex(shirts[(section * 13 + row * 7 + c * 3 + c % 2) % shirts.length]));
        dummy.position.copy(base).add(new THREE.Vector3(0, .63, 0));
        dummy.updateMatrix();
        heads.setMatrixAt(index, dummy.matrix);
        heads.setColorAt(index, col.setHex(skins[(section + c) % 4]));
        dummy.position.copy(base);
        dummy.updateMatrix();
        seats.setMatrixAt(index, dummy.matrix);
        index++;
      }
    }
    if(section % 4 !== 0) {
      box(g, 9.1, .22, 7.5, cream, 0, 5.3, .4).rotation.x = -.07;
      box(g, 9.15, .15, .18, navy, 0, 5.47, -3.35);
      box(g, 9, .2, .26, dark, 0, 5.06, .6);
      for(const x of [-3.9, 3.9])
        box(g, .12, 5.2, .12, cream, x, 2.6, 3.3);
    }
    batch(g);
  }
  root.add(body, heads, seats);
  const pavilion = new THREE.Group();
  root.add(pavilion);
  pavilion.name = 'Club pavilion — recessed gallery and balcony';
  const recess = material(0x314a57), soffit = material(0x7e959c), glassLight = material(0x648b9a, .38);
  // Two shallow wings and a taller central gallery make a recognisable club house.
  box(pavilion, 15.6, 6.9, 5.2, cream, 0, 3.45, 53.5, true);
  box(pavilion, 9.8, 1.45, 4.7, cream, 0, 7.5, 53.5, true);
  box(pavilion, 11.5, .24, 6.2, navy, 0, 8.33, 53.0, true);
  box(pavilion, 11.2, .12, 6.0, white, 0, 8.17, 53.0);
  box(pavilion, 17.5, .28, 7.0, navy, 0, 6.98, 53.0, true);
  box(pavilion, 17.25, .14, 6.8, white, 0, 6.79, 53.0);
  box(pavilion, 16.8, .12, 6.5, soffit, 0, 6.66, 53.0);
  // Dark reveal, inset glass, deep sill and pilasters provide depth without a texture facade.
  box(pavilion, 13.8, 2.35, .18, recess, 0, 5.15, 50.78);
  for(let i = -6; i <= 6; i++) {
    box(pavilion, .90, 2.02, .08, i % 3 === 0 ? glassLight : glass, i * 1.01, 5.19, 50.66);
    box(pavilion, .055, 2.15, .14, navy, i * 1.01 - .48, 5.19, 50.53);
  }
  box(pavilion, 13.25, .055, .13, navy, 0, 5.25, 50.51);
  box(pavilion, 14.6, .23, 1.9, white, 0, 3.92, 50.6, true);
  box(pavilion, 14.3, .13, 1.8, soffit, 0, 3.75, 50.6);
  for(const x of [-7.1, -3.65, 3.65, 7.1])
    box(pavilion, .36, 5.9, .68, white, x, 3.32, 50.35, true);
  // Balcony rail has a solid top and evenly spaced thin balusters.
  box(pavilion, 14.25, .095, .095, navy, 0, 4.78, 49.7, true);
  box(pavilion, 14.25, .055, .065, navy, 0, 4.16, 49.7);
  for(let i = -17; i <= 17; i++)
    box(pavilion, .035, .62, .045, dark, i * .405, 4.47, 49.7);
  for(const x of [-5.35, -1.75, 1.75, 5.35]) {
    box(pavilion, 2.7, 2.4, .16, recess, x, 2.22, 50.73);
    box(pavilion, 2.32, 2.1, .09, glass, x, 2.2, 50.62);
    box(pavilion, .065, 2.1, .15, navy, x, 2.2, 50.53);
    box(pavilion, 2.75, .16, .65, white, x, 3.47, 50.35);
  }
  // Upper clerestory and side steps read above the spectators from the batting camera.
  for(let i = -3; i <= 3; i++)
    box(pavilion, 1.02, .64, .08, glass, i * 1.21, 7.48, 51.10);
  for(const side of [-1, 1]) for(let i = 0; i < 9; i++)
    box(pavilion, 1.25, .42 * (i + 1), .56, concrete, side * 8.0, .21 * (i + 1), 48.4 + i * .52);
  for(let i = -1; i <= 1; i++) {
    box(pavilion, .065, 3, .065, white, i * 4, 9.65, 53);
    // Cloth curves gently across the flag; still geometry, no per-frame simulation.
    const geo = new THREE.PlaneGeometry(1.15, .65, 10, 2), p = geo.attributes.position;
    for(let j = 0; j < p.count; j++)
      p.setZ(j, Math.sin((p.getX(j) + .575) * 5) * .12);
    geo.computeVertexNormals();
    const flag = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: i === 0 ? 0xef792e : 0x254963, roughness: .95, side: THREE.DoubleSide }));
    flag.position.set(i * 4 + .57, 10.4, 53);
    pavilion.add(flag);
  }
  // Flags have a different vertex layout; leave those three separate from the architecture.
  const flags = pavilion.children.filter(m => (m as THREE.Mesh).geometry?.type === 'PlaneGeometry');
  flags.forEach(m => pavilion.remove(m));
  batch(pavilion);
  pavilion.add(...flags);
  const lamps = new THREE.InstancedMesh(new THREE.SphereGeometry(.28, 12, 8), new THREE.MeshStandardMaterial({ color: 0xf3f7fa, emissive: 0xe2edfa, emissiveIntensity: .35, roughness: .3 }), 40);
  let lamp = 0;
  for(const [x, z] of [[-29, 35], [29, 35], [-32, -13], [32, -13]]) {
    const tower = new THREE.Group();
    root.add(tower);
    box(tower, .3, 18, .3, cream, x, 9, z);
    box(tower, 4, 2, .35, navy, x, 17.5, z, true);
    for(let r = 0; r < 2; r++)
      for(let c = 0; c < 5; c++) {
        dummy.position.set(x - 1.5 + c * .75, 17.1 + r * .8, z - .28);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.set(1, 1, .6);
        dummy.updateMatrix();
        lamps.setMatrixAt(lamp++, dummy.matrix);
      }
    batch(tower);
  }
  root.add(lamps);
  // Smooth, irregular crowns built from overlapping lobes around a branching trunk.
  // Normals come from the curved surface, not independent icosahedron faces.
  const sphere = new THREE.SphereGeometry(1, 24, 16);
  sphere.deleteAttribute('normal'); sphere.deleteAttribute('uv');
  const crown = mergeVertices(sphere); sphere.dispose();
  const vertices = crown.attributes.position;
  for(let i = 0; i < vertices.count; i++) {
    const x = vertices.getX(i), y = vertices.getY(i), z = vertices.getZ(i);
    const r = 1 + .025 * Math.sin(x * 5 + y * 2) * Math.cos(z * 4 - y * 3);
    vertices.setXYZ(i, x * r, y * r, z * r);
  }
  crown.computeVertexNormals();
  const treeCount = 48, lobes = [[0, 1.4, 0, 1.7], [-1.3, .5, .15, 1.6], [1.25, .65, .1, 1.65],
    [-.55, .65, -1.1, 1.5], [.6, .65, 1.1, 1.55], [0, -.3, 0, 1.6]];
  const leaves = new THREE.InstancedMesh(crown, material(0xffffff), treeCount * lobes.length);
  leaves.name = 'Rounded broadleaf crowns';
  const trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(.14, .24, 1, 10), material(0x716f63), treeCount * 3);
  trunks.name = 'Treeline trunks and branches';
  for(let i = 0; i < treeCount; i++) {
    const a = i / treeCount * Math.PI * 2, seed = Math.sin(i * 127.1) * 43758.5, f = seed - Math.floor(seed);
    const center = new THREE.Vector3(Math.sin(a) * (56 + f * 5), 0, 10 + Math.cos(a) * (56 + f * 5));
    const scale = .95 + f * .50, height = 4.1 + f * 1.4;
    for(let j = 0; j < lobes.length; j++) {
      const [x, y, z, radius] = lobes[j];
      const offset = new THREE.Vector3(x, y, z).multiplyScalar(scale).applyAxisAngle(yAxis, a + f * 3);
      dummy.position.copy(center).add(offset); dummy.position.y += height;
      dummy.rotation.set(.08 * j, a + f * 3, .07 * j);
      dummy.scale.set(radius * scale, radius * scale * (.88 + .08 * (j % 3)), radius * scale);
      dummy.updateMatrix(); leaves.setMatrixAt(i * lobes.length + j, dummy.matrix);
      leaves.setColorAt(i * lobes.length + j, col.setHSL(.27 + .035 * f, .38 + .05 * (j % 2), .225 + .06 * f + .018 * (j % 3)));
    }
    for(let j = 0; j < 3; j++) {
      dummy.position.copy(center); dummy.position.y = j === 0 ? height * .38 : height * .69;
      dummy.position.x += j === 0 ? 0 : (j === 1 ? -.48 : .48) * scale;
      dummy.rotation.set(0, a, j === 0 ? 0 : (j === 1 ? .48 : -.48));
      dummy.scale.set(scale * (j === 0 ? 1 : .62), height * (j === 0 ? .76 : .48), scale * (j === 0 ? 1 : .62));
      dummy.updateMatrix(); trunks.setMatrixAt(i * 3 + j, dummy.matrix);
    }
  }
  root.add(trunks, leaves);
  return root;
}
