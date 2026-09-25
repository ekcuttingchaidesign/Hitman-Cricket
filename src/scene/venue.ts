import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * Everything round the field that never moves: the bowl of stands and the
 * people in them, the pavilion, the floodlights, the flags, the trees behind
 * and the boundary cushions. It is built from the same simple shapes as
 * before, but merged by material so the whole venue is a dozen draw calls
 * rather than a few hundred, and nothing here casts a shadow — it all sits
 * outside the sun's shadow box, where a shadow map would never see it.
 */

export interface VenueColors { navy: number; orange: number; white: number }

function random(seed: number) {
  return () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
}

/** Collects boxes and cylinders per material and merges each pile into one mesh. */
class Batch {
  private piles = new Map<THREE.Material, THREE.BufferGeometry[]>();
  private materials = new Map<number, THREE.MeshStandardMaterial>();
  material(color: number, roughness = 0.85) {
    const key = color * 4 + Math.round(roughness * 3);
    if (!this.materials.has(key)) this.materials.set(key, new THREE.MeshStandardMaterial({ color, roughness }));
    return this.materials.get(key)!;
  }
  add(geometry: THREE.BufferGeometry, material: THREE.Material, matrix?: THREE.Matrix4) {
    if (matrix) geometry.applyMatrix4(matrix);
    const pile = this.piles.get(material) ?? [];
    pile.push(geometry); this.piles.set(material, pile);
  }
  box(w: number, h: number, d: number, color: number, x: number, y: number, z: number, frame?: THREE.Matrix4, rx = 0) {
    const m = new THREE.Matrix4().makeTranslation(x, y, z);
    if (rx) m.multiply(new THREE.Matrix4().makeRotationX(rx));
    if (frame) m.premultiply(frame);
    this.add(new THREE.BoxGeometry(w, h, d), this.material(color), m);
  }
  cylinder(r: number, h: number, color: number, x: number, y: number, z: number, frame?: THREE.Matrix4, sides = 10) {
    const m = new THREE.Matrix4().makeTranslation(x, y, z);
    if (frame) m.premultiply(frame);
    this.add(new THREE.CylinderGeometry(r, r, h, sides), this.material(color), m);
  }
  build(into: THREE.Group) {
    for (const [material, pile] of this.piles) {
      const mesh = new THREE.Mesh(mergeGeometries(pile), material);
      mesh.receiveShadow = true; into.add(mesh);
      pile.forEach(g => g.dispose());
    }
  }
}

export function createVenue(colors: VenueColors, boundaryRadius: number) {
  const root = new THREE.Group(); root.name = 'Venue';
  const batch = new Batch();
  const rng = random(4021);
  const dummy = new THREE.Object3D();
  const CENTRE_Z = 10;

  // The bowl: 28 sections in a ring, each a front board, five stepped tiers
  // with a seat bar, a back wall and a roof on two poles. Every section is
  // roofed now, so the ring reads as one stadium rather than a row of sheds.
  const SECTIONS = 28, ROWS = 5, SEATS = 14;
  const body = new THREE.InstancedMesh(new THREE.CapsuleGeometry(0.16, 0.22, 2, 7).translate(0, 0.33, 0), batch.material(0xffffff, 0.9), SECTIONS * ROWS * SEATS);
  const heads = new THREE.InstancedMesh(new THREE.SphereGeometry(0.115, 8, 6).translate(0, 0.7, 0), batch.material(0xffffff, 0.85), SECTIONS * ROWS * SEATS);
  body.name = 'Crowd'; heads.name = 'Crowd heads';
  const shirts = [colors.navy, colors.orange, 0xf3ecd8, 0xdbe5e2, 0x3f7f96, colors.navy, colors.orange, 0xe9c46a];
  const skins = [0xb77950, 0x8f5a3a, 0xd9a577, 0x6d4530, 0xc98d5c];
  const color = new THREE.Color();
  let seat = 0;
  for (let s = 0; s < SECTIONS; s++) {
    // The two sections straight down the pitch are left out: the pavilion
    // stands in that gap, taller than the stands either side of it.
    if (s === 0 || s === SECTIONS - 1) continue;
    const a = s / SECTIONS * Math.PI * 2;
    const frame = new THREE.Matrix4().makeTranslation(Math.sin(a) * 39, 0, CENTRE_Z + Math.cos(a) * 39).multiply(new THREE.Matrix4().makeRotationY(a));
    batch.box(8.7, 1.5, 1.2, s % 3 ? colors.navy : colors.orange, 0, 0.75, -3.3, frame);
    batch.box(8.7, 0.1, 1.3, colors.white, 0, 1.55, -3.3, frame);
    for (let row = 0; row < ROWS; row++) {
      const h = 0.7 + row * 0.7, z = -1.7 + row * 1.4;
      batch.box(8.5, h, 1.4, 0x8b9ea3, 0, h / 2, z, frame);
      batch.box(8.5, 0.32, 0.12, colors.navy, 0, h + 0.16, z + 0.62, frame);
      for (let c = 0; c < SEATS; c++) {
        if (rng() < 0.12) continue; // an empty seat here and there
        dummy.position.set(-3.9 + c * 0.6, h, z + 0.1).applyMatrix4(frame);
        dummy.rotation.set(0, a + (rng() - 0.5) * 0.4, 0);
        dummy.scale.setScalar(0.9 + rng() * 0.2);
        dummy.updateMatrix();
        body.setMatrixAt(seat, dummy.matrix); body.setColorAt(seat, color.setHex(shirts[Math.floor(rng() * shirts.length)]));
        heads.setMatrixAt(seat, dummy.matrix); heads.setColorAt(seat, color.setHex(skins[Math.floor(rng() * skins.length)]));
        seat++;
      }
    }
    batch.box(8.7, 3.2, 0.3, 0xd8dcd3, 0, 4.9, 4.0, frame);
    batch.box(9.1, 0.25, 7.6, 0xcfd6d0, 0, 6.6, 0.5, frame, -0.06);
    batch.box(9.1, 0.18, 0.2, 0xe8ebe4, 0, 6.42, -3.2, frame);
    for (const x of [-4.1, 4.1]) batch.cylinder(0.08, 6.3, 0x9aa8ac, x, 3.2, -3.0, frame);
    if (s % 4 === 2) {
      batch.cylinder(0.04, 2.4, colors.white, 0, 7.9, 3.5, frame);
      batch.box(1.0, 0.6, 0.04, s % 8 === 2 ? colors.orange : colors.navy, 0.52, 8.8, 3.5, frame);
    }
  }
  body.count = heads.count = seat;
  root.add(body, heads);

  // The pavilion at the bowler's end, with a glazed upper storey and balcony.
  // Three storeys in cream with a navy roof, the big screen across the
  // middle of it, a glazed top floor and a balcony with a rail.
  const PZ = 50.5;
  batch.box(15, 9.6, 5.6, 0xe4dcc4, 0, 4.8, PZ + 2.8);
  batch.box(17, 0.55, 6.8, colors.navy, 0, 9.85, PZ + 2.6);
  batch.box(9.5, 3.0, 0.14, colors.navy, 0, 5.3, PZ - 0.02);
  for (let i = -4; i <= 4; i++) batch.box(1.1, 1.5, 0.1, 0x466f86, i * 1.5, 8.2, PZ);
  for (let i = -3; i <= 3; i++) batch.box(1.4, 1.7, 0.1, 0x3e6a80, i * 2.0, 1.9, PZ);
  batch.box(15.5, 0.18, 1.7, colors.white, 0, 3.4, PZ - 0.6);
  for (let i = -8; i <= 8; i++) batch.box(0.05, 0.62, 0.05, colors.navy, i * 0.9, 3.8, PZ - 1.4);
  batch.box(15.5, 0.06, 0.06, colors.navy, 0, 4.12, PZ - 1.4);
  batch.box(15.5, 0.18, 1.7, colors.white, 0, 7.2, PZ - 0.6);
  for (let i = -1; i <= 1; i++) {
    batch.cylinder(0.05, 3, 0xece6cf, i * 4.5, 11.5, PZ + 2.6);
    batch.box(1.15, 0.65, 0.04, i === 0 ? colors.orange : colors.navy, i * 4.5 + 0.56, 12.4, PZ + 2.6);
  }

  // Floodlights: a pole, a dark head, and round lamps that glow.
  const lamps = new THREE.InstancedMesh(new THREE.SphereGeometry(0.26, 10, 8), new THREE.MeshStandardMaterial({ color: 0xfaf7ee, emissive: 0xfff3d6, emissiveIntensity: 0.9, roughness: 0.4 }), 4 * 12);
  lamps.name = 'Floodlight lamps';
  let lamp = 0;
  for (const [x, z] of [[-29, 35], [29, 35], [-32, -13], [32, -13]]) {
    const toward = Math.atan2(-x, CENTRE_Z - z);
    batch.cylinder(0.22, 20, 0x9aa5a8, x, 10, z, undefined, 12);
    const frame = new THREE.Matrix4().makeTranslation(x, 20.2, z).multiply(new THREE.Matrix4().makeRotationY(toward));
    batch.box(3.6, 2.4, 0.3, 0x2b3f4c, 0, 0, 0, frame);
    for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) {
      dummy.position.set(-1.2 + c * 0.8, -0.8 + r * 0.8, 0.22).applyMatrix4(frame);
      dummy.rotation.set(0, 0, 0); dummy.scale.set(1, 1, 0.55); dummy.updateMatrix();
      lamps.setMatrixAt(lamp++, dummy.matrix);
    }
  }
  root.add(lamps);

  // Trees behind the stands: clumps of three soft crowns on a short trunk,
  // tall enough that their tops show over the roofs, which is all the cover
  // shows of them either.
  const TREES = 40;
  const crowns = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 12, 9), batch.material(0xffffff, 0.95), TREES * 3);
  crowns.name = 'Tree crowns';
  const greens = [0x2f7a33, 0x3a8a3c, 0x2a6e2e, 0x468f45];
  for (let i = 0; i < TREES; i++) {
    const a = (i + rng() * 0.6) / TREES * Math.PI * 2, radius = 55 + rng() * 8, height = 7.0 + rng() * 2.2;
    const cx = Math.sin(a) * radius, cz = CENTRE_Z + Math.cos(a) * radius;
    batch.cylinder(0.3, height, 0x6b5a45, cx, height / 2, cz, undefined, 7);
    for (let j = 0; j < 3; j++) {
      const r = 1.5 + rng() * 1.0;
      dummy.position.set(cx + (rng() - 0.5) * 2.0, height + (j === 0 ? 0.4 : -0.5 + rng() * 1.0), cz + (rng() - 0.5) * 2.0);
      dummy.rotation.set(0, 0, 0); dummy.scale.set(r, r * (0.8 + rng() * 0.3), r); dummy.updateMatrix();
      crowns.setMatrixAt(i * 3 + j, dummy.matrix); crowns.setColorAt(i * 3 + j, color.setHex(greens[Math.floor(rng() * greens.length)]));
    }
  }
  root.add(crowns);

  // The boundary: navy and white cushions round the rope's line.
  const CUSHIONS = 104;
  const cushions = new THREE.InstancedMesh(new THREE.BoxGeometry(1.7, 0.18, 0.3), batch.material(0xffffff, 0.8), CUSHIONS);
  cushions.name = 'Boundary cushions';
  for (let i = 0; i < CUSHIONS; i++) {
    const a = i / CUSHIONS * Math.PI * 2;
    dummy.position.set(Math.sin(a) * boundaryRadius, 0.09, CENTRE_Z + Math.cos(a) * boundaryRadius);
    dummy.rotation.set(0, a, 0); dummy.scale.setScalar(1); dummy.updateMatrix();
    cushions.setMatrixAt(i, dummy.matrix); cushions.setColorAt(i, color.setHex(i % 2 ? colors.navy : colors.white));
  }
  cushions.receiveShadow = true;
  root.add(cushions);

  batch.build(root);
  return root;
}
