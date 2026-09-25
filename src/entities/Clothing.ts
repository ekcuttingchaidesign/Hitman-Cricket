import * as THREE from 'three';
const UP = new THREE.Vector3(0, 1, 0);
type Field = (p: THREE.Vector3) => number;
interface Part {
  field: Field;
  position: THREE.Vector3;
  rotation: THREE.Quaternion;
}
const v = (x: number, y: number, z = 0) => new THREE.Vector3(x, y, z);
function ellipsoid(center: THREE.Vector3, radii: THREE.Vector3): Field {
  return p => {
    const x = (p.x - center.x) / radii.x, y = (p.y - center.y) / radii.y, z = (p.z - center.z) / radii.z;
    const k = Math.hypot(x, y, z), q = Math.hypot(x / radii.x, y / radii.y, z / radii.z);
    return q > 1e-8 ? k * (k - 1) / q : -Math.min(radii.x, radii.y, radii.z);
  };
}
function limb(start: THREE.Vector3, end: THREE.Vector3, radius: number, taper: number, sleeve = false): Part {
  const axis = end.clone().sub(start), length = axis.length();
  axis.normalize();
  return {
    position: start, rotation: new THREE.Quaternion().setFromUnitVectors(UP, axis), field: p => {
      const d = p.clone().sub(start), t = THREE.MathUtils.clamp(d.dot(axis) / length, 0, 1);
      const along = d.dot(axis);
      const distance = d.addScaledVector(axis, -t * length).length() - THREE.MathUtils.lerp(radius, radius * taper, t);
      return sleeve ? Math.max(distance, along - length) : distance;
    }
  };
}
function smooth(a: number, b: number, k: number) {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * .25;
}
/** A welded implicit garment, with weights authored from the same volumes as its surface. */
function garment(parts: Part[], min: THREE.Vector3, max: THREE.Vector3, step: number) {
  const field = (p: THREE.Vector3) => parts.reduce((d, part) => smooth(d, part.field(p), .045), 10);
  const positions: number[] = [], normals: number[] = [], indices: number[] = [], weights: number[] = [], colors: number[] = [];
  const topology: number[] = [], vertexMap = new Map<string, number>();
  const corners = [[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0], [0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]];
  const tetra = [[0, 5, 1, 6], [0, 1, 2, 6], [0, 2, 3, 6], [0, 3, 7, 6], [0, 7, 4, 6], [0, 4, 5, 6]];
  const normal = (p: THREE.Vector3) => {
    const e = .001;
    return v(field(p.clone().add(v(e, 0))) - field(p.clone().add(v(-e, 0))), field(p.clone().add(v(0, e))) - field(p.clone().add(v(0, -e))), field(p.clone().add(v(0, 0, e))) - field(p.clone().add(v(0, 0, -e)))).normalize();
  };
  function vertex(p: THREE.Vector3) {
    const key = `${Math.round(p.x * 1e6)},${Math.round(p.y * 1e6)},${Math.round(p.z * 1e6)}`;
    const existing = vertexMap.get(key);
    if (existing !== undefined) { topology.push(existing); return; }
    const index = positions.length / 3;
    vertexMap.set(key, index); topology.push(index);
    const n = normal(p);
    positions.push(p.x, p.y, p.z);
    normals.push(n.x, n.y, n.z);
    const raw = parts.map((part, i) => ({ i, w: Math.exp(-part.field(p) / .022) }));
    if(parts.length === 4) {
      const chestWeight = THREE.MathUtils.smoothstep(p.y, parts[3].position.y + .055, parts[0].position.y - .10);
      raw[3].w = raw[0].w * (1 - chestWeight);
      raw[0].w *= chestWeight;
    }
    const influence = raw.sort((a, b) => b.w - a.w).slice(0, 4);
    const sum = influence.reduce((s, b) => s + b.w, 0);
    for(let i = 0; i < 4; i++) {
      indices.push(influence[i]?.i ?? 0);
      weights.push((influence[i]?.w ?? 0) / sum);
    }
    // Subtle cloth folds and darkening beneath the sleeve/waist; never painted skin.
    const fold = Math.sin(p.y * 115 + p.x * 22) * Math.sin(p.x * 39 + p.z * 36);
    const shade = .96 + fold * .022;
    colors.push(shade, shade, shade);
  }
  for(let y = min.y; y < max.y; y += step)
    for(let z = min.z; z < max.z; z += step)
      for(let x = min.x; x < max.x; x += step) {
        const ps = corners.map(c => v(x + c[0] * step, y + c[1] * step, z + c[2] * step)), ds = ps.map(field);
        if(ds.every(d => d >= 0) || ds.every(d => d < 0))
          continue;
        for(const tet of tetra) {
          const inside = tet.filter(i => ds[i] < 0), outside = tet.filter(i => ds[i] >= 0);
          if(!inside.length || !outside.length)
            continue;
          const cross = (a: number, b: number) => ps[a].clone().lerp(ps[b], ds[a] / (ds[a] - ds[b]));
          const tris: THREE.Vector3[][] = [];
          if(inside.length === 1)
            tris.push(outside.map(i => cross(inside[0], i)));
          else if(outside.length === 1)
            tris.push(inside.map(i => cross(outside[0], i)));
          else {
            const [a, b] = inside, [c, d] = outside;
            const ac = cross(a, c), ad = cross(a, d), bc = cross(b, c), bd = cross(b, d);
            tris.push([ac, ad, bc], [ad, bd, bc]);
          }
          for(const tri of tris) {
            const n = tri[1].clone().sub(tri[0]).cross(tri[2].clone().sub(tri[0]));
            if(n.dot(normal(tri[0])) < 0)
              [tri[1], tri[2]] = [tri[2], tri[1]];
            tri.forEach(vertex);
          }
        }
      }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(indices, 4));
  g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(weights, 4));
  g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  g.setIndex(topology);
  return g;
}
const geometryCache = new Map<string, THREE.BufferGeometry>();
function cached(key: string, create: () => THREE.BufferGeometry) {
  if(!geometryCache.has(key))
    geometryCache.set(key, create());
  return geometryCache.get(key)!.clone();
}
export class Clothing {
  readonly shirt: THREE.SkinnedMesh;
  readonly trousers: THREE.SkinnedMesh;
  private shirtBones: THREE.Bone[];
  private trouserBones: THREE.Bone[];
  constructor(root: THREE.Group, shirt: THREE.MeshStandardMaterial, trousers: THREE.MeshStandardMaterial, figure = false) {
    const chest = v(0, figure ? 1.40 : 1.28), hip = v(0, .94);
    const shoulderY = chest.y + (figure ? .085 : .075);
    const sleeves = [-1, 1].map(s => limb(v(s * (figure ? .175 : .163), shoulderY), v(s * .29, shoulderY - .195), figure ? .072 : .077, .86, true));
    const hemY = hip.y + .025, topY = chest.y + .15;
    const torso: Part = {
      position: chest, rotation: new THREE.Quaternion(), field: p => {
        const t = THREE.MathUtils.smoothstep(p.y, hemY, chest.y);
        const neck = THREE.MathUtils.smoothstep(p.y, chest.y + .065, topY);
        const width = THREE.MathUtils.lerp(.171 + t * .026, .075, neck), depth = THREE.MathUtils.lerp(.122 + t * .018, .071, neck);
        const fold = .0025 * Math.sin(p.y * 55 + Math.atan2(p.z, p.x) * 5) * (1 - THREE.MathUtils.smoothstep(p.y, hemY + .05, chest.y));
        return Math.max((Math.hypot(p.x / width, p.z / depth) - 1) * depth + fold, hemY - p.y, p.y - topY);
      }
    };
    const hem: Part = { position: hip, rotation: new THREE.Quaternion(), field: () => 10 };
    const pelvis: Part = { position: hip, rotation: new THREE.Quaternion(), field: ellipsoid(v(0, .92), v(.173, .132, .126)) };
    const legs = [-1, 1].flatMap(s => [limb(v(s * .135, .895), v(s * .145, .48), .099, .79), limb(v(s * .145, .48), v(s * .15, .08), .077, .84)]);
    const build = (parts: Part[], g: THREE.BufferGeometry, material: THREE.MeshStandardMaterial) => {
      // The garment owns its clone; equipment can keep its uncoloured material.
      const mat = material.clone();
      mat.vertexColors = true;
      const mesh = new THREE.SkinnedMesh(g, mat), bones = parts.map(p => { const b = new THREE.Bone(); b.position.copy(p.position); b.quaternion.copy(p.rotation); mesh.add(b); return b; });
      root.add(mesh);
      mesh.updateMatrixWorld(true);
      mesh.bind(new THREE.Skeleton(bones));
      mesh.castShadow = mesh.receiveShadow = true;
      mesh.frustumCulled = false;
      return { mesh, bones };
    };
    const top = build([torso, ...sleeves, hem], cached(figure ? 'figure-shirt' : 'hero-shirt', () => garment([torso, ...sleeves, hem], v(-.41, .9, -.19), v(.41, chest.y + .22, .19), figure ? .038 : .025)), shirt);
    const bottom = build([pelvis, ...legs], cached(figure ? 'figure-trousers' : 'hero-trousers', () => garment([pelvis, ...legs], v(-.28, -.01, -.18), v(.28, 1.08, .18), figure ? .042 : .030)), trousers);
    this.shirt = top.mesh;
    this.shirtBones = top.bones;
    this.trousers = bottom.mesh;
    this.trouserBones = bottom.bones;
    this.shirt.name = 'Continuous skinned jersey';
    this.trousers.name = 'Continuous skinned trousers';
  }
  dress(shirt: THREE.Color, trousers: THREE.Color) { (this.shirt.material as THREE.MeshStandardMaterial).color.copy(shirt); (this.trousers.material as THREE.MeshStandardMaterial).color.copy(trousers); }
  body(torso: THREE.Object3D, hips: THREE.Object3D) { this.shirtBones[0].position.copy(torso.position); this.shirtBones[0].quaternion.copy(torso.quaternion); this.shirtBones[3].position.copy(hips.position); this.shirtBones[3].quaternion.copy(hips.quaternion); this.trouserBones[0].position.copy(hips.position); this.trouserBones[0].quaternion.copy(hips.quaternion); }
  limb(i: number, shoulder: THREE.Vector3, elbow: THREE.Vector3, hip: THREE.Vector3, knee: THREE.Vector3, foot: THREE.Vector3) {
    const place = (bone: THREE.Bone, a: THREE.Vector3, b: THREE.Vector3) => { bone.position.copy(a); bone.quaternion.setFromUnitVectors(UP, b.clone().sub(a).normalize()); };
    place(this.shirtBones[i + 1], shoulder, elbow);
    place(this.trouserBones[i * 2 + 1], hip, knee);
    place(this.trouserBones[i * 2 + 2], knee, foot);
  }
}
