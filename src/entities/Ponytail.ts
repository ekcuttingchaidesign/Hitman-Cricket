import * as THREE from 'three';
import { updateGarmentNormals } from './ConnectedJersey';

/** Something the hair may not pass into: a ball, or a capsule from `from` to `to`. */
export interface HairCollider { from: THREE.Vector3; to: THREE.Vector3; radius: number }

/** How long the ponytail is from the tie to the tip, and in how many links. */
const LENGTH = .30, LINKS = 8, LINK = LENGTH / LINKS;
/** The links the tie holds rigid, pointing the way it sends the hair out. */
const HELD = 2;
/** Rings drawn between each pair of links, and round each ring. */
const SPAN = 3, SIDES = 10;
/** One step of the simulation, and the most taken in a frame. */
const STEP = 1 / 120, MOST_STEPS = 8;
/** A frame longer than this is a cut, not motion: the hair is hung afresh. */
const CUT = .25;
const GRAVITY = 9.8;
/** The share of a link's speed kept each second: what makes hair settle rather than swing for ever. */
const DRAG = .08;
/**
 * The most each link may turn off the line of the one above it, in radians:
 * stiffest by the tie, freest at the tip. A limit rather than a spring, so
 * gravity hangs it in a curve and the limit only stops it folding.
 */
const BEND = [.30, .62] as const;

/**
 * Its thickness from the tie to the tip: gathered at the tie, full a little
 * below it, and drawn to a point.
 */
function radiusAt(t: number) {
  const full = .034, tie = .022, tip = .005;
  if (t < .2) return THREE.MathUtils.lerp(tie, full, Math.sin(t / .2 * Math.PI / 2));
  return THREE.MathUtils.lerp(tip, full, Math.cos((t - .2) / .8 * Math.PI / 2) ** 1.3);
}

/**
 * A ponytail: a chain of links hung from the tie at the back of the head,
 * swung by the head's movement and gravity (Verlet, at a fixed step on the
 * game's clock, so it slows with the slow motion and stops with the pause),
 * kept off the helmet, the neck and the back, and drawn as one tube through
 * the chain. The first links are held by the tie in the line it sends the
 * hair out on; the rest hang, each keeping a little of the line above it.
 */
export class Ponytail {
  readonly mesh: THREE.Mesh;
  private readonly points = Array.from({ length: LINKS + 1 }, () => new THREE.Vector3());
  private readonly last = Array.from({ length: LINKS + 1 }, () => new THREE.Vector3());
  private readonly curve: THREE.CatmullRomCurve3;
  private readonly rings = LINKS * SPAN + 1;
  private hung = false;
  private carry = 0;
  private readonly at = new THREE.Vector3();
  private readonly along = new THREE.Vector3();
  private readonly normal = new THREE.Vector3();
  private readonly binormal = new THREE.Vector3();
  private readonly v = new THREE.Vector3();
  private readonly w = new THREE.Vector3();

  constructor(material: THREE.Material) {
    this.curve = new THREE.CatmullRomCurve3(this.points, false, 'centripetal');
    const count = this.rings * (SIDES + 1) + 1;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3).setUsage(THREE.DynamicDrawUsage));
    geometry.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(count * 3), 3).setUsage(THREE.DynamicDrawUsage));
    const uv = new Float32Array(count * 2);
    const indices: number[] = [];
    for (let r = 0; r < this.rings; r++) for (let i = 0; i <= SIDES; i++) {
      uv[(r * (SIDES + 1) + i) * 2] = i / SIDES; uv[(r * (SIDES + 1) + i) * 2 + 1] = r / (this.rings - 1);
      if (r < this.rings - 1 && i < SIDES) {
        const a = r * (SIDES + 1) + i, b = a + SIDES + 1;
        indices.push(a, b, a + 1, a + 1, b, b + 1);
      }
    }
    // The tip closed on a point, so the tube is not an open pipe seen end on.
    const tip = count - 1, last = (this.rings - 1) * (SIDES + 1);
    for (let i = 0; i < SIDES; i++) indices.push(last + i, tip, last + i + 1);
    geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geometry.setIndex(indices);
    geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 1, 0), 3);
    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.name = 'Ponytail';
    this.mesh.castShadow = this.mesh.receiveShadow = true;
  }

  /** The links, from the tie to the tip, for the tests. */
  get chain(): readonly THREE.Vector3[] { return this.points; }

  /** Hang it again from the tie next time, as after a cut. */
  rehang() { this.hung = false; }

  /**
   * Move the hair on by `seconds`, the tie now at `tie` sending it out along
   * `out` (a unit vector), and draw it. Everything is in the space the mesh is
   * drawn in.
   */
  swing(tie: THREE.Vector3, out: THREE.Vector3, seconds: number, colliders: readonly HairCollider[]) {
    if (!this.hung || !(seconds >= 0) || seconds > CUT) this.hang(tie, out, colliders);
    else {
      this.carry = Math.min(this.carry + seconds, STEP * MOST_STEPS);
      while (this.carry >= STEP) { this.carry -= STEP; this.step(tie, out, colliders); }
      // Between steps the tie still goes where the head is: no lag at the root.
      this.hold(tie, out); this.constrain(colliders);
    }
    this.draw();
  }

  /** Straight out from the tie and then down, the way it falls at rest, settled. */
  private hang(tie: THREE.Vector3, out: THREE.Vector3, colliders: readonly HairCollider[]) {
    this.hold(tie, out);
    for (let i = HELD + 1; i <= LINKS; i++) this.points[i].copy(this.points[i - 1]).addScaledVector(this.v.set(0, -1, 0), LINK);
    for (let n = 0; n < 40; n++) {
      for (let i = HELD + 1; i <= LINKS; i++) this.points[i].y -= .01;
      this.constrain(colliders);
    }
    this.points.forEach((p, i) => this.last[i].copy(p));
    this.hung = true; this.carry = 0;
  }

  private hold(tie: THREE.Vector3, out: THREE.Vector3) {
    for (let i = 0; i <= HELD; i++) this.points[i].copy(tie).addScaledVector(out, i * LINK);
  }

  private step(tie: THREE.Vector3, out: THREE.Vector3, colliders: readonly HairCollider[]) {
    const keep = Math.pow(DRAG, STEP);
    for (let i = HELD + 1; i <= LINKS; i++) {
      const p = this.points[i], before = this.last[i];
      this.v.subVectors(p, before).multiplyScalar(keep);
      before.copy(p);
      p.add(this.v); p.y -= GRAVITY * STEP * STEP;
    }
    for (let i = 0; i <= HELD; i++) this.last[i].copy(this.points[i]);
    this.hold(tie, out);
    this.constrain(colliders);
  }

  /**
   * Each link its own length, no sharper a turn than the limit, and out of
   * everything it may not enter. Both ends of a link give, half each, unless
   * one is held by the tie: pulling only the lower end up to the upper, link
   * by link, put energy in rather than taking it out, and it never settled.
   */
  private constrain(colliders: readonly HairCollider[]) {
    for (let pass = 0; pass < 6; pass++) {
      for (let i = HELD + 1; i <= LINKS; i++) {
        this.apart(i - 1, i, LINK, LINK);
        // The turn at the link above, as a least distance from the one before it.
        const bend = THREE.MathUtils.lerp(BEND[0], BEND[1], (i - HELD - 1) / (LINKS - HELD - 1));
        this.apart(i - 2, i, 2 * LINK * Math.cos(bend / 2), Infinity);
      }
      for (let i = HELD + 1; i <= LINKS; i++) for (const c of colliders) this.outOf(this.points[i], c);
    }
    // What the colliders left stretched, taken up from the tie down, each
    // point's last place moved with it so that taking it up adds no speed.
    for (let i = HELD + 1; i <= LINKS; i++) {
      const p = this.points[i], above = this.points[i - 1];
      this.w.subVectors(p, above);
      const d = this.w.length();
      if (d < 1e-9) continue;
      this.w.multiplyScalar(LINK / d - 1);
      p.add(this.w); this.last[i].add(this.w);
    }
  }

  /** Two links' points no nearer than `least` and no further than `most`, the held one not moved. */
  private apart(a: number, b: number, least: number, most: number) {
    const p = this.points[a], q = this.points[b];
    this.w.subVectors(q, p);
    const d = this.w.length();
    if (d < 1e-9 || (d >= least && d <= most)) return;
    const want = d < least ? least : most, share = a <= HELD ? 1 : .5;
    this.w.multiplyScalar((d - want) / d);
    q.addScaledVector(this.w, -share);
    if (share < 1) p.addScaledVector(this.w, share);
  }

  private outOf(p: THREE.Vector3, { from, to, radius }: HairCollider) {
    this.w.subVectors(to, from);
    const span = this.w.lengthSq();
    const t = span > 1e-9 ? THREE.MathUtils.clamp(this.v.subVectors(p, from).dot(this.w) / span, 0, 1) : 0;
    this.at.copy(from).addScaledVector(this.w, t);
    this.v.subVectors(p, this.at);
    const d = this.v.length(), wanted = radius + radiusAt(.5) * .6;
    if (d < wanted && d > 1e-6) p.copy(this.at).addScaledVector(this.v, wanted / d);
  }

  /** The tube through the chain, rings carried down it so it never twists. */
  private draw() {
    const positions = this.mesh.geometry.getAttribute('position') as THREE.BufferAttribute;
    this.curve.updateArcLengths();
    for (let r = 0; r < this.rings; r++) {
      const t = r / (this.rings - 1);
      this.curve.getPointAt(t, this.at);
      this.curve.getTangentAt(t, this.along).normalize();
      if (r === 0) {
        // Any side square to the first link; after that, carried along.
        this.normal.set(1, 0, 0).addScaledVector(this.along, -this.along.x);
        if (this.normal.lengthSq() < 1e-4) this.normal.set(0, 0, 1).addScaledVector(this.along, -this.along.z);
      } else this.normal.addScaledVector(this.along, -this.normal.dot(this.along));
      this.normal.normalize();
      this.binormal.crossVectors(this.along, this.normal);
      const radius = radiusAt(t);
      for (let i = 0; i <= SIDES; i++) {
        const a = i / SIDES * Math.PI * 2;
        this.v.copy(this.at).addScaledVector(this.normal, Math.cos(a) * radius).addScaledVector(this.binormal, Math.sin(a) * radius);
        positions.setXYZ(r * (SIDES + 1) + i, this.v.x, this.v.y, this.v.z);
      }
    }
    this.curve.getPointAt(1, this.v).addScaledVector(this.along, .004);
    positions.setXYZ(positions.count - 1, this.v.x, this.v.y, this.v.z);
    positions.needsUpdate = true;
    updateGarmentNormals(this.mesh.geometry);
  }

  dispose() { this.mesh.geometry.dispose(); }
}
