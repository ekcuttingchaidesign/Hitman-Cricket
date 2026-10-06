import * as THREE from 'three';

/** One continuous surface over an existing two-segment IK chain.
 * Reuses buffers and vectors; bends the surface without visible joint balls.
 */
export class BendingLimb {
  readonly mesh: THREE.Mesh;
  private readonly rows = 20;
  private readonly first = new THREE.Vector3();
  private readonly second = new THREE.Vector3();
  private readonly binormal = new THREE.Vector3();
  private readonly tangent = new THREE.Vector3();
  private readonly across = new THREE.Vector3();
  private readonly point = new THREE.Vector3();
  private readonly angles: [number, number][];
  /** Where it was last aimed, kept until it is drawn: see `aim`. */
  private readonly aimed = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  private readonly facing = new THREE.Vector3();
  private faced = false;
  private readonly profile: number[][];

  constructor(material: THREE.Material | THREE.Material[], private radii: [number, number, number], private readonly sides = 16,
    private readonly tailored = false) {
    this.profile = [[0, radii[0]], [.15, radii[0] + .003], [.5, radii[1]], [.70, radii[1] + .003], [1, radii[2]]];
    const geometry = new THREE.BufferGeometry(), count = (this.rows + 1) * (this.sides + 1);
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3).setUsage(THREE.DynamicDrawUsage));
    geometry.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(count * 3), 3).setUsage(THREE.DynamicDrawUsage));
    const uv = new Float32Array(count * 2);
    for (let row = 0; row <= this.rows; row++) for (let i = 0; i <= this.sides; i++) {
      const n = (row * (this.sides + 1) + i) * 2; uv[n] = i / this.sides; uv[n + 1] = row / this.rows;
    }
    geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    const indices: number[] = [];
    for (let j = 0; j < this.rows; j++) for (let i = 0; i < this.sides; i++) {
      const a = j * (this.sides + 1) + i, b = a + this.sides + 1;
      indices.push(a, a + 1, b, a + 1, b + 1, b);
    }
    geometry.setIndex(indices);
    if (Array.isArray(material)) {
      const seam = 11 * this.sides * 6;
      geometry.addGroup(0, seam, 0); geometry.addGroup(seam, indices.length - seam, 1);
    }
    this.angles = Array.from({ length: this.sides + 1 }, (_, i) => [Math.cos(i / this.sides * Math.PI * 2), Math.sin(i / this.sides * Math.PI * 2)]);
    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.name = 'Continuous bending limb';
    this.mesh.castShadow = this.mesh.receiveShadow = true;
    geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 1, 0), 3);
  }

  /**
   * Note where the limb runs without bending the surface yet. The pose can be
   * set many times between frames — the tests set it thousands of times and
   * draw nothing — so the surface is built once, by `draw`, when it is wanted.
   */
  aim(a: THREE.Vector3, joint: THREE.Vector3, b: THREE.Vector3, reference?: THREE.Vector3) {
    this.aimed[0].copy(a); this.aimed[1].copy(joint); this.aimed[2].copy(b);
    this.faced = !!reference; if (reference) this.facing.copy(reference);
  }
  /** The surface, bent to where it was last aimed. */
  draw() { this.update(this.aimed[0], this.aimed[1], this.aimed[2], this.faced ? this.facing : undefined); }

  update(a: THREE.Vector3, joint: THREE.Vector3, b: THREE.Vector3, reference?: THREE.Vector3) {
    const u = this.first.subVectors(joint, a), v = this.second.subVectors(b, joint);
    const l1 = u.length(), l2 = v.length(), length = l1 + l2;
    u.multiplyScalar(1 / Math.max(l1, .00001)); v.multiplyScalar(1 / Math.max(l2, .00001));
    const bend = Math.min(.05, l1 * .2, l2 * .2);
    this.binormal.crossVectors(u, reference ?? v);
    if (this.binormal.lengthSq() < .0001) {
      this.binormal.set(0, 0, 1).cross(u);
      if (this.binormal.lengthSq() < .0001) this.binormal.set(1, 0, 0).cross(u);
    }
    this.binormal.normalize();
    const positions = this.mesh.geometry.getAttribute('position'), normals = this.mesh.geometry.getAttribute('normal');
    // Written straight into the arrays: this runs for every limb of every
    // figure on every frame, and the attribute and vector helpers were most
    // of what it cost.
    const p = positions.array as Float32Array, n = normals.array as Float32Array;
    const bx = this.binormal.x, by = this.binormal.y, bz = this.binormal.z;
    for (let row = 0; row <= this.rows; row++) {
      const t = row / this.rows, d = t * length;
      if (d < l1 - bend) {
        this.point.copy(a).addScaledVector(u, d); this.tangent.copy(u);
      } else if (d > l1 + bend) {
        this.point.copy(joint).addScaledVector(v, d - l1); this.tangent.copy(v);
      } else {
        const f = (d - l1 + bend) / Math.max(2 * bend, .00001);
        this.point.copy(joint).addScaledVector(u, -bend * (1 - f) ** 2).addScaledVector(v, bend * f * f);
        this.tangent.copy(u).multiplyScalar(1 - f).addScaledVector(v, f).normalize();
      }
      this.across.crossVectors(this.binormal, this.tangent).normalize();
      let radius = t < .5 ? THREE.MathUtils.lerp(this.radii[0], this.radii[1], t * 2)
        : THREE.MathUtils.lerp(this.radii[1], this.radii[2], (t - .5) * 2);
      let slope = 2 * (t < .5 ? this.radii[1] - this.radii[0] : this.radii[2] - this.radii[1]);
      if (this.tailored) {
        // Smooth thigh, knee and calf sections keep the knee shaped without
        // a sharp change of slope or a separate spherical joint.
        const k = t < .15 ? 0 : t < .5 ? 1 : t < .7 ? 2 : 3;
        const [from, r0] = this.profile[k], [to, r1] = this.profile[k + 1];
        const u = (t - from) / (to - from), eased = u * u * (3 - 2 * u);
        radius = r0 + (r1 - r0) * eased;
        slope = (r1 - r0) * 6 * u * (1 - u) / (to - from);
      }
      slope /= Math.max(length, .00001);
      const { x: px, y: py, z: pz } = this.point, { x: ax, y: ay, z: az } = this.across;
      const tx = -slope * this.tangent.x, ty = -slope * this.tangent.y, tz = -slope * this.tangent.z;
      for (let i = 0; i <= this.sides; i++) {
        const [c, s] = this.angles[i], at = (row * (this.sides + 1) + i) * 3;
        const rx = ax * c + bx * s, ry = ay * c + by * s, rz = az * c + bz * s;
        p[at] = px + rx * radius; p[at + 1] = py + ry * radius; p[at + 2] = pz + rz * radius;
        const nx = rx + tx, ny = ry + ty, nz = rz + tz, inverse = 1 / (Math.sqrt(nx * nx + ny * ny + nz * nz) || 1);
        n[at] = nx * inverse; n[at + 1] = ny * inverse; n[at + 2] = nz * inverse;
      }
    }
    positions.needsUpdate = normals.needsUpdate = true;
  }
}
