import * as THREE from 'three';
import type { BendingLimb } from './BendingLimb';
import { updateGarmentNormals } from './ConnectedJersey';
import { setPrint } from './kitPrint';

/**
 * How many rows down each leg the trousers take to become the leg: the hip
 * and the seat live here, so they are blended on a curve rather than in a
 * straight line, which left a slab behind him and a corner at each hip.
 */
const SEAT_ROWS = 4;
/** How far the seat stands out behind the line from hip to thigh, at its fullest. */
const SEAT = .034;
/** And the hips past the thigh at the sides, so the leg grows out of them. */
const HIP = .018;
/** How far the seat's curve hangs from the opening before it turns, as a share of the way to the thigh. */
const FALL = .7;
/**
 * How far forward of straight down the thigh points, in degrees: the seat's
 * swell is whole up to the first and gone by the second, eased between. He
 * stands at 13 in his guard, and the cover drive's finish holds the front
 * thigh at 27 to 29 (the straight drive's at 33), where any swell left turns
 * forward under him as a point at the bottom of the seat. As wide as that gap
 * allows, so the seat settles over the frames a stride takes rather than in
 * one.
 */
const SEAT_TUCK: readonly [number, number] = [15, 27];
/**
 * The columns of the seat that run down its middle, the same seam on each
 * leg: leg one's 12 and 13 are leg two's 0 and 15, from the back of the
 * waist and the back of the crotch. The second hangs below the first, and
 * the strip between them, on the middle on both legs, hung under the seat as
 * a fin seen edge on from behind as a line down it; so down the seat the
 * second is laid on the first.
 */
const SEAM_PAIRS: readonly (readonly [number, number])[] = [[12, 0], [13, 15]];
/** The two rings down the leg the thigh's direction is read between. */
const THIGH_RINGS: readonly [number, number] = [SEAT_ROWS + 1, 10];

/** One trouser surface: waist, tailored rise, crotch and both bending legs. */
export class ConnectedTrousers {
  readonly mesh: THREE.Mesh;
  private loops: number[][] = [];
  private p = new THREE.Vector3();
  private q = new THREE.Vector3();
  private ref = new THREE.Vector3();
  /** How far each leg's seat is tucked away, 0 to 1, as last drawn. */
  readonly tucked = [0, 0];
  private top = new THREE.Vector3();
  private low = new THREE.Vector3();
  private inverse = new THREE.Quaternion();
  private offset(i: number) { return 51 + i * 320; }
  /** The middle of one ring of a leg, in the hips' own frame. */
  private ring(source: THREE.BufferAttribute | THREE.InterleavedBufferAttribute, row: number, into: THREE.Vector3, hips: THREE.Vector3) {
    into.set(0, 0, 0);
    for (let i = 0; i < 16; i++) into.add(this.q.fromBufferAttribute(source, row * 17 + i));
    return into.divideScalar(16).sub(hips).applyQuaternion(this.inverse);
  }
  constructor(material: THREE.Material) {
    const indices: number[] = [], count = 691;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3).setUsage(THREE.DynamicDrawUsage));
    geometry.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(count * 3), 3).setUsage(THREE.DynamicDrawUsage));
    const uv = new Float32Array(count * 2);
    for (let i = 0; i < 24; i++) {
      const next = (i + 1) % 24;
      indices.push(i, i + 24, next, next, i + 24, next + 24);
      uv[i * 2] = uv[(i + 24) * 2] = i / 24; uv[i * 2 + 1] = .12;
    }
    // Half a waist plus the shared crotch seam makes each closed leg opening.
    this.loops = [
      [...Array.from({ length: 13 }, (_, i) => 24 + (24 - i) % 24), 50, 49, 48],
      [...Array.from({ length: 13 }, (_, i) => 24 + 12 - i), 48, 49, 50],
    ];
    for (let leg = 0; leg < 2; leg++) {
      const at = (row: number, i: number) => row === 0 ? this.loops[leg][i % 16] : this.offset(leg) + (row - 1) * 16 + i % 16;
      for (let row = 0; row < 20; row++) for (let i = 0; i < 16; i++) {
        const a = at(row, i), b = at(row + 1, i), c = at(row, i + 1), d = at(row + 1, i + 1);
        indices.push(a, c, b, c, d, b);
        uv[b * 2] = i / 16; uv[b * 2 + 1] = (row + 1) / 20;
      }
    }
    geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); geometry.setIndex(indices);
    // Where each vertex is round its leg, for a kit's print (`kitPrint.ts`),
    // the hip at the top: the second leg turned round, so the outside of
    // each is the same place on the texture. The waist and the seat have
    // none: the seat's rows are laid from the waist's opening, whose order
    // round is not the leg's, and the top of the leg's bolt came out as a
    // stripe across the back of the seat.
    const print = new THREE.BufferAttribute(new Float32Array(count * 4), 4);
    for (let leg = 0; leg < 2; leg++) for (let row = SEAT_ROWS + 1; row <= 20; row++) for (let i = 0; i < 16; i++) {
      setPrint(print, this.offset(leg) + (row - 1) * 16 + i, (leg ? -1 : 1) * i / 16 * Math.PI * 2, 1 - row / 20, 0);
    }
    geometry.setAttribute('kitPrint', print);
    geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 1, 0), 3);
    this.mesh = new THREE.Mesh(geometry, material); this.mesh.name = 'Continuous tailored trousers';
    this.mesh.castShadow = this.mesh.receiveShadow = true;
  }
  reference(leg: number, hips: THREE.Object3D) {
    return this.ref.set(leg === 0 ? .065 : -.065, 0, leg === 0 ? .122 : -.122).applyQuaternion(hips.quaternion);
  }
  update(hips: THREE.Object3D, legs: BendingLimb[], torso: THREE.Object3D) {
    const positions = this.mesh.geometry.getAttribute('position');
    const set = (id: number, x: number, y: number, z: number) => {
      this.p.set(x, y, z).applyQuaternion(hips.quaternion).add(hips.position);
      positions.setXYZ(id, this.p.x, this.p.y, this.p.z);
    };
    for (let ring = 0; ring < 2; ring++) for (let i = 0; i < 24; i++) {
      const angle = i / 24 * Math.PI * 2;
      if (ring === 0) {
        // Follow the actual jersey hem through twists and bends. A waist tied
        // only to the pelvis lets the shirt poke through the back of the pants.
        this.p.set(Math.sin(angle) * .164, -.337, Math.cos(angle) * .124)
          .applyQuaternion(torso.quaternion).add(torso.position);
        positions.setXYZ(i, this.p.x, this.p.y, this.p.z);
      } else {
        // Below the shirt's hem, so the cloth falls from it rather than folding
        // back up; and deeper behind than in front, the top of the seat.
        const z = Math.cos(angle);
        set(24 + i, Math.sin(angle) * .17, -.02, z * (z < 0 ? .15 : .122));
      }
    }
    this.inverse.copy(hips.quaternion).invert();
    // How far each seat is tucked away, from where the thigh points: once for
    // the whole leg. Read off each column's own pair of points instead, the
    // reading followed the hips turning over the thigh rather than the thigh
    // lifting, so it tucked a thigh hanging behind him and threw the swell
    // off and on in a frame while the leg hardly moved.
    for (let leg = 0; leg < 2; leg++) {
      const source = legs[leg].mesh.geometry.getAttribute('position');
      this.ring(source, THIGH_RINGS[0], this.top, hips.position);
      this.ring(source, THIGH_RINGS[1], this.low, hips.position);
      const forward = THREE.MathUtils.radToDeg(Math.atan2(this.low.z - this.top.z, this.top.y - this.low.y));
      this.tucked[leg] = THREE.MathUtils.smoothstep(forward, SEAT_TUCK[0], SEAT_TUCK[1]);
    }
    // The crotch seam: front, under, and behind, where it is set low and well
    // back so the seat is whole at the top and parts only lower down.
    set(48, 0, -.055, .085); set(49, 0, -.098, 0); set(50, 0, -.085, -.125);
    // Both thighs out in front of him at once: down in a squat.
    const squat = Math.min(this.tucked[0], this.tucked[1]);
    for (let leg = 0; leg < 2; leg++) {
      const source = legs[leg].mesh.geometry.getAttribute('position');
      const outside = leg === 0 ? -1 : 1;
      // A thigh out in front tucks the swell away, but not both at once: down
      // in a squat the seat is fuller, not flatter. Tucked both sides, the two
      // halves folded in on the seam behind and opened a split down the seat.
      const room = 1 - this.tucked[leg] * (1 - squat);
      for (let row = 1; row <= 20; row++) for (let i = 0; i < 16; i++) {
        if (row <= SEAT_ROWS) {
          // From the opening to the leg, worked in the hips' own frame so that
          // behind him is behind him however he turns.
          const t = row / (SEAT_ROWS + 1);
          this.p.fromBufferAttribute(positions, this.loops[leg][i]).sub(hips.position).applyQuaternion(this.inverse);
          this.q.fromBufferAttribute(source, (SEAT_ROWS + 1) * 17 + i).sub(hips.position).applyQuaternion(this.inverse);
          // Behind and at the sides the cloth falls from the hip before it
          // turns into the thigh. Straight from the opening to a thigh raised
          // in front, as in the sweep's front leg, the seat folded forward
          // under the hem and left a gap there to see into from behind. So a
          // curve whose first handle hangs straight down from the opening,
          // furthest behind and not at all in front.
          const fall = FALL * (1 - this.p.z / (Math.hypot(this.p.x, this.p.z) || 1)) / 2 * this.p.distanceTo(this.q);
          this.p.multiplyScalar((1 - t) ** 2 + 2 * t * (1 - t)).addScaledVector(this.q, t * t);
          this.p.y -= 2 * t * (1 - t) * fall;
          // Rounded out behind, fullest halfway down, and a little at the
          // outside of each hip; nothing in front or between the legs.
          const swell = Math.sin(t ** .7 * Math.PI);
          const behind = Math.max(0, -this.p.z) / (Math.hypot(this.p.x, this.p.z) || 1);
          const side = Math.max(0, this.p.x * outside) / (Math.hypot(this.p.x, this.p.z) || 1);
          this.p.z -= SEAT * swell * behind * behind * room;
          this.p.x += outside * HIP * swell * side * side;
          this.p.applyQuaternion(hips.quaternion).add(hips.position);
        } else this.p.fromBufferAttribute(source, row * 17 + i);
        positions.setXYZ(this.offset(leg) + (row - 1) * 16 + i, this.p.x, this.p.y, this.p.z);
      }
    }
    // The seam down the middle of the seat is one seam, but each leg has its
    // own copy of it, led away to its own thigh: a centimetre apart and lit
    // at an angle to each other from just under the waistband, a split up
    // the seat. So the two are one, the same place and the same light, all
    // the way down the seat: the halves part at the thighs, between the legs.
    // Let go any higher, the parting opened a slit at the foot of the seat.
    this.seam(positions);
    positions.needsUpdate = true; updateGarmentNormals(this.mesh.geometry);
    this.seam(this.mesh.geometry.getAttribute('normal'), true);
  }
  /** Make each leg's copy of the seat's middle seam one: the same place, and the same light. */
  private seam(attribute: THREE.BufferAttribute | THREE.InterleavedBufferAttribute, unit = false) {
    for (let row = 1; row <= SEAT_ROWS; row++) {
      const [a, b] = SEAM_PAIRS[0], one = this.offset(0) + (row - 1) * 16 + a, two = this.offset(1) + (row - 1) * 16 + b;
      this.p.fromBufferAttribute(attribute, one).add(this.q.fromBufferAttribute(attribute, two));
      if (unit) this.p.normalize(); else this.p.multiplyScalar(.5);
      for (const [c, d] of SEAM_PAIRS) {
        attribute.setXYZ(this.offset(0) + (row - 1) * 16 + c, this.p.x, this.p.y, this.p.z);
        attribute.setXYZ(this.offset(1) + (row - 1) * 16 + d, this.p.x, this.p.y, this.p.z);
      }
    }
    attribute.needsUpdate = true;
  }
}
