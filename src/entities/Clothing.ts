import * as THREE from 'three';

const X = new THREE.Vector3(1, 0, 0);
const Z = new THREE.Vector3(0, 0, 1);
const SIDES = [-1, 1] as const;
const SEGMENTS = 32;
const smooth = THREE.MathUtils.smoothstep;
const v = (x: number, y: number, z = 0) => new THREE.Vector3(x, y, z);

/** Explicit garment panels: every join shares vertices and every cuff has a regular loop. */
class Panels {
  positions: number[] = [];
  weights: number[] = [];
  bones: number[] = [];
  triangles: number[] = [];
  vertex(p: THREE.Vector3, weights: [number, number][]) {
    const id = this.positions.length / 3;
    this.positions.push(p.x, p.y, p.z);
    for (let i = 0; i < 4; i++) {
      this.bones.push(weights[i]?.[0] ?? 0);
      this.weights.push(weights[i]?.[1] ?? 0);
    }
    return id;
  }
  point(id: number) { return v(this.positions[id * 3], this.positions[id * 3 + 1], this.positions[id * 3 + 2]); }
  /** Loops run clockwise when viewed from above: their front begins at +Z. */
  stitch(lower: number[], upper: number[]) {
    for (let j = 0; j < lower.length; j++) {
      const next = (j + 1) % lower.length;
      this.quad(lower[j], lower[next], upper[next], upper[j]);
    }
  }
  quad(a: number, b: number, c: number, d: number) { this.triangles.push(a, b, c, a, c, d); }
  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.positions, 3));
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(this.bones, 4));
    g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(this.weights, 4));
    g.setIndex(this.triangles);
    g.computeVertexNormals();
    return g;
  }
}

/** Torso with two actual armholes, sewn to tube sleeves. No intersecting volumes. */
function jersey(figure: boolean) {
  const mesh = new Panels(), chestY = figure ? 1.4 : 1.28, shoulderY = chestY + (figure ? .085 : .075);
  const shoulderX = figure ? .175 : .163;
  const ys = [1.018, 1.065, 1.13, 1.23, 1.29, 1.35, 1.405, 1.43, 1.445];
  const widths = [.174, .181, .188, .195, .200, .196, .166, .112, .073];
  const depths = [.128, .134, .138, .141, .140, .133, .115, .085, .071];
  const rings = ys.map((y, row) => {
    // The taller bowler has the same hem and longer trunk, not a scaled limb rig.
    const height = y + (figure ? .12 * smooth(y, 1.018, 1.23) : 0);
    const chestWeight = row === 0 ? 0 : smooth(height, 1.025, chestY - .11);
    return Array.from({ length: SEGMENTS }, (_, i) => {
      const angle = i / SEGMENTS * Math.PI * 2;
      return mesh.vertex(v(Math.sin(angle) * widths[row], height, Math.cos(angle) * depths[row]), [[0, chestWeight], [3, 1 - chestWeight]]);
    });
  });
  const low = 3, high = 6, halfHole = 3;
  for (let row = 0; row < rings.length - 1; row++) for (let i = 0; i < SEGMENTS; i++) {
    const inHole = row >= low && row < high && [8, 24].some(center => i >= center - halfHole && i < center + halfHole);
    if (!inHole) mesh.quad(rings[row][i], rings[row][(i + 1) % SEGMENTS], rings[row + 1][(i + 1) % SEGMENTS], rings[row + 1][i]);
  }
  for (let sideIndex = 0; sideIndex < 2; sideIndex++) {
    const side = SIDES[sideIndex], center = side === 1 ? 8 : 24, from = center - halfHole, to = center + halfHole;
    // Traverse the cutout boundary, reusing the torso's exact vertex indices.
    const boundary: number[] = [];
    for (let i = from; i <= to; i++) boundary.push(rings[low][i]);
    for (let row = low + 1; row <= high; row++) boundary.push(rings[row][to]);
    for (let i = to - 1; i >= from; i--) boundary.push(rings[high][i]);
    for (let row = high - 1; row > low; row--) boundary.push(rings[row][from]);
    // Each sleeve starts in the chest's frame, then bends into the upper arm.
    // Concentrating the blend close to the armhole avoids dragging the back panel.
    const angles = boundary.map(id => {
      const p = mesh.point(id);
      return Math.atan2(p.z / .082, (p.y - (shoulderY - .038)) / .09);
    });
    let previous = boundary;
    for (const [distance, radius, weight] of [[.030, .080, .4], [.060, .077, .85], [.085, .073, 1], [.110, .069, 1]] as const) {
      const ring = angles.map((angle, j) => {
        const p = v(side * (shoulderX + distance), shoulderY + Math.cos(angle) * radius, Math.sin(angle) * radius);
        if (distance === .030) p.lerp(mesh.point(boundary[j]), .25);
        return mesh.vertex(p, [[0, 1 - weight], [sideIndex + 1, weight]]);
      });
      // The hole boundary has the opposite winding from the body faces.
      for (let j = 0; j < ring.length; j++) {
        const next = (j + 1) % ring.length;
        mesh.quad(previous[j], previous[next], ring[next], ring[j]);
      }
      previous = ring;
    }
    // A turned-in cuff gives fabric thickness instead of a sawtoothed skin intersection.
    const inner = angles.map(angle => mesh.vertex(v(side * (shoulderX + .108), shoulderY + Math.cos(angle) * .064, Math.sin(angle) * .064), [[sideIndex + 1, 1]]));
    for (let j = 0; j < inner.length; j++) {
      const next = (j + 1) % inner.length;
      mesh.quad(previous[j], previous[next], inner[next], inner[j]);
    }
  }
  return mesh.geometry();
}

/** A single waist splits at a shared crotch seam into two regular leg loops. */
function trousers() {
  const mesh = new Panels();
  const ring = (width: number, depth: number, y: number) => Array.from({ length: SEGMENTS }, (_, i) => {
    const a = i / SEGMENTS * Math.PI * 2;
    return mesh.vertex(v(Math.sin(a) * width, y, Math.cos(a) * depth), [[0, 1]]);
  });
  const waist = ring(.17, .124, 1.025), hips = ring(.183, .132, .942);
  // The front/back crotch sits lower than the outer hip; no pinched central sphere.
  const fork = Array.from({ length: SEGMENTS }, (_, i) => {
    const a = i / SEGMENTS * Math.PI * 2, x = Math.sin(a), right = smooth(x, -.3, .3);
    return mesh.vertex(v(x * .215, .79 + Math.abs(x) * .06, Math.cos(a) * .112), [[0, .4], [1, .6 * (1-right)], [3, .6 * right]]);
  });
  const seat = fork.map((id,i) => {
    const p = mesh.point(id).lerp(mesh.point(hips[i]), .5), right = smooth(Math.sin(i/SEGMENTS*Math.PI*2),-.3,.3);
    return mesh.vertex(p, [[0,.7],[1,.3*(1-right)],[3,.3*right]]);
  });
  mesh.stitch(hips, waist); mesh.stitch(seat, hips); mesh.stitch(fork, seat);
  const bridge = [fork[16]];
  for (let i = 1; i < 6; i++) bridge.push(mesh.vertex(v(0, .79, -.112 + i / 6 * .224), [[0, .4], [1, .3], [3, .3]]));
  bridge.push(fork[0]);
  const right = [...fork.slice(0, 17), ...bridge.slice(1, -1)];
  const left = [...fork.slice(16), fork[0], ...bridge.slice(1, -1).reverse()];
  for (let i = 0; i < 2; i++) {
    const side = SIDES[i], loop = side === 1 ? right : left;
    const angles = loop.map(id => { const p = mesh.point(id); return Math.atan2(p.x - side * .11, p.z); });
    let previous = loop;
    for (const [y, rx, rz] of [[.76,.090,.104], [.66,.092,.101], [.56,.087,.094], [.48,.083,.09], [.40,.078,.084], [.28,.074,.079], [.17,.071,.075], [.075,.069,.073]]) {
      const knee = smooth(y, .39, .56);
      const hip = smooth(y, .64, .86) * .4;
      const current = angles.map(a => mesh.vertex(v(side * (.135 + (.895 - y) * .018) + Math.sin(a) * rx, y, Math.cos(a) * rz), [[0, hip], [i * 2 + 1, (1 - hip) * knee], [i * 2 + 2, (1 - hip) * (1 - knee)]]));
      mesh.stitch(current, previous); previous = current;
    }
  }
  return mesh.geometry();
}

const templates = new Map<string, THREE.BufferGeometry>();
function cached(name: string, make: () => THREE.BufferGeometry) {
  if (!templates.has(name)) templates.set(name, make());
  return templates.get(name)!.clone();
}
/** Stable roll relative to the torso, including when a limb crosses the vertical. */
function armFrame(direction: THREE.Vector3, torso: THREE.Quaternion, side: number) {
  const restAxis = X.clone().applyQuaternion(torso);
  const axis = direction.clone().normalize().multiplyScalar(side);
  // Swing the torso frame as a whole. Projecting the chest's front onto the
  // arm plane flips the sleeve when a drive points the arm straight forward.
  return new THREE.Quaternion().setFromUnitVectors(restAxis, axis).multiply(torso);
}
function legFrame(direction: THREE.Vector3, right: THREE.Vector3) {
  const y = direction.clone().normalize(), x = right.clone().addScaledVector(y, -right.dot(y));
  if (x.lengthSq() < .00001) x.copy(Z).addScaledVector(y, -Z.dot(y));
  x.normalize();
  const z = new THREE.Vector3().crossVectors(x, y).normalize();
  return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
}
export class Clothing {
  readonly shirt: THREE.SkinnedMesh;
  readonly trousers: THREE.SkinnedMesh;
  private shirtBones: THREE.Bone[];
  private trouserBones: THREE.Bone[];
  private torsoRotation = new THREE.Quaternion();
  private right = new THREE.Vector3(1, 0, 0);
  constructor(root: THREE.Group, shirt: THREE.MeshStandardMaterial, pants: THREE.MeshStandardMaterial, figure = false) {
    const chest = v(0, figure ? 1.4 : 1.28), hip = v(0, .94);
    const shoulderY = chest.y + (figure ? .085 : .075), shoulderX = figure ? .175 : .163;
    const build = (g: THREE.BufferGeometry, mat: THREE.MeshStandardMaterial, positions: THREE.Vector3[], rotations: THREE.Quaternion[]) => {
      const mesh = new THREE.SkinnedMesh(g, mat.clone());
      const bones = positions.map((position, i) => {
        const bone = new THREE.Bone(); bone.position.copy(position); bone.quaternion.copy(rotations[i]); mesh.add(bone); return bone;
      });
      root.add(mesh); mesh.updateMatrixWorld(true); mesh.bind(new THREE.Skeleton(bones));
      mesh.castShadow = mesh.receiveShadow = true; mesh.frustumCulled = false;
      return { mesh, bones };
    };
    const top = build(cached(figure ? 'figure-shirt' : 'hero-shirt', () => jersey(figure)), shirt,
      [chest, v(-shoulderX, shoulderY), v(shoulderX, shoulderY), hip], Array.from({ length: 4 }, () => new THREE.Quaternion()));
    const legPositions = SIDES.flatMap(side => [v(side * .135, .895), v(side * .145, .48)]);
    const legRotations = SIDES.flatMap(side => [legFrame(v(side * .01, -.415), X), legFrame(v(side * .005, -.40), X)]);
    const bottom = build(cached('trousers', trousers), pants, [hip, ...legPositions], [new THREE.Quaternion(), ...legRotations]);
    this.shirt = top.mesh; this.shirtBones = top.bones;
    this.trousers = bottom.mesh; this.trouserBones = bottom.bones;
    this.shirt.name = 'Continuous skinned jersey'; this.trousers.name = 'Continuous skinned trousers';
  }
  dress(shirt: THREE.Color, trousers: THREE.Color) {
    (this.shirt.material as THREE.MeshStandardMaterial).color.copy(shirt);
    (this.trousers.material as THREE.MeshStandardMaterial).color.copy(trousers);
  }
  body(torso: THREE.Object3D, hips: THREE.Object3D) {
    this.shirtBones[0].position.copy(torso.position); this.shirtBones[0].quaternion.copy(torso.quaternion);
    this.shirtBones[3].position.copy(hips.position); this.shirtBones[3].quaternion.copy(hips.quaternion);
    this.trouserBones[0].position.copy(hips.position); this.trouserBones[0].quaternion.copy(hips.quaternion);
    this.torsoRotation.copy(torso.quaternion); this.right.copy(X).applyQuaternion(hips.quaternion);
  }
  limb(i: number, shoulder: THREE.Vector3, elbow: THREE.Vector3, hip: THREE.Vector3, knee: THREE.Vector3, foot: THREE.Vector3) {
    this.shirtBones[i + 1].position.copy(shoulder);
    this.shirtBones[i + 1].quaternion.copy(armFrame(elbow.clone().sub(shoulder), this.torsoRotation, SIDES[i]));
    for (const [bone, a, b] of [[this.trouserBones[i * 2 + 1], hip, knee], [this.trouserBones[i * 2 + 2], knee, foot]] as const) {
      bone.position.copy(a); bone.quaternion.copy(legFrame(b.clone().sub(a), this.right));
    }
  }
}
