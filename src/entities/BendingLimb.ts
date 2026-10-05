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
  private readonly radial = new THREE.Vector3();
  private readonly across = new THREE.Vector3();
  private readonly point = new THREE.Vector3();
  private readonly angles: [number, number][];

  constructor(material: THREE.Material | THREE.Material[], private radii: [number, number, number], private readonly sides = 16) {
    const geometry = new THREE.BufferGeometry(), count = (this.rows + 1) * (this.sides + 1);
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3).setUsage(THREE.DynamicDrawUsage));
    geometry.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(count * 3), 3).setUsage(THREE.DynamicDrawUsage));
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
      const radius = t < .5 ? THREE.MathUtils.lerp(this.radii[0], this.radii[1], t * 2)
        : THREE.MathUtils.lerp(this.radii[1], this.radii[2], (t - .5) * 2);
      const slope = 2 * (t < .5 ? this.radii[1] - this.radii[0] : this.radii[2] - this.radii[1]) / Math.max(length, .00001);
      for (let i = 0; i <= this.sides; i++) {
        const [c, s] = this.angles[i], index = row * (this.sides + 1) + i;
        this.radial.copy(this.across).multiplyScalar(c).addScaledVector(this.binormal, s);
        positions.setXYZ(index, this.point.x + this.radial.x * radius, this.point.y + this.radial.y * radius, this.point.z + this.radial.z * radius);
        this.radial.addScaledVector(this.tangent, -slope).normalize();
        normals.setXYZ(index, this.radial.x, this.radial.y, this.radial.z);
      }
    }
    positions.needsUpdate = normals.needsUpdate = true;
  }
}
