import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
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
  const navy = material(0x203d55), cream = material(0xd8cbb0), concrete = material(0x91a29e), orange = material(0xe86e31), white = material(0xf4efdc), dark = material(0x47616a), glass = material(0x285779, .28);
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
  box(pavilion, 13, 7, 5, cream, 0, 3.5, 53, true);
  box(pavilion, 15, .43, 6.5, navy, 0, 7.1, 53, true);
  box(pavilion, 14.5, .16, 6.2, white, 0, 6.84, 52.8);
  box(pavilion, 10, 2.25, .09, glass, 0, 4.55, 50.44);
  for(let i = -5; i <= 5; i++)
    box(pavilion, .065, 2.3, .13, navy, i * .96, 4.55, 50.37);
  box(pavilion, 10, .06, .14, navy, 0, 4.55, 50.35);
  box(pavilion, 10.6, .23, .8, white, 0, 3.35, 50.15);
  for(const x of [-5.7, 5.7])
    box(pavilion, .5, 5.4, .7, white, x, 3.1, 50.16, true);
  for(let i = -2; i <= 2; i++)
    box(pavilion, 1.3, 1.6, .1, glass, i * 2.4, 1.8, 50.4);
  for(let i = -1; i <= 1; i++) {
    box(pavilion, .065, 3, .065, white, i * 4, 8.7, 53);
    // Cloth curves gently across the flag; still geometry, no per-frame simulation.
    const geo = new THREE.PlaneGeometry(1.15, .65, 10, 2), p = geo.attributes.position;
    for(let j = 0; j < p.count; j++)
      p.setZ(j, Math.sin((p.getX(j) + .575) * 5) * .12);
    geo.computeVertexNormals();
    const flag = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: i === 0 ? 0xef792e : 0x254963, roughness: .95, side: THREE.DoubleSide }));
    flag.position.set(i * 4 + .57, 9.5, 53);
    pavilion.add(flag);
  }
  // Flags have a different vertex layout; leave those three separate from the architecture.
  const flags = pavilion.children.filter(m => (m as THREE.Mesh).geometry?.type === 'PlaneGeometry');
  flags.forEach(m => pavilion.remove(m));
  batch(pavilion);
  pavilion.add(...flags);
  const lamps = new THREE.InstancedMesh(new THREE.SphereGeometry(.28, 12, 8), new THREE.MeshStandardMaterial({ color: 0xfff6d8, emissive: 0xffd18a, emissiveIntensity: 1.6, roughness: .3 }), 40);
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
  const leaves = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 2), material(0xffffff), 210);
  for(let i = 0; i < 210; i++) {
    const a = i / 210 * Math.PI * 2, seed = Math.sin(i * 127.1) * 43758.5, f = seed - Math.floor(seed);
    dummy.position.set(Math.sin(a) * (54 + f * 5), 4 + (i % 5) * .8, 10 + Math.cos(a) * (54 + f * 5));
    dummy.scale.set(2 + f * 1.5, 2.8 + f * 2.1, 2.4 + f);
    dummy.rotation.set(f, .3 * i, 0);
    dummy.updateMatrix();
    leaves.setMatrixAt(i, dummy.matrix);
    leaves.setColorAt(i, col.setHSL(.22 + f * .04, .39, .22 + f * .12));
  }
  root.add(leaves);
  return root;
}
