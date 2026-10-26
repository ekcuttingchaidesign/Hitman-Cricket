import * as THREE from 'three';
import { updateGarmentNormals } from './ConnectedJersey';

/** Something the hair may not pass into: a ball, or a capsule from `from` to `to`. */
export interface HairCollider { from: THREE.Vector3; to: THREE.Vector3; radius: number }

/** How long the ponytail is from the tie to the tip, and in how many links: to between the shoulder blades. */
const LENGTH = .40, LINKS = 10, LINK = LENGTH / LINKS;
/** The links the tie holds rigid, pointing the way it sends the hair out. */
const HELD = 1;
/** Rings drawn between each pair of links, and round each ring. */
const SPAN = 4, SIDES = 28;
/** One step of the simulation, and the most taken in a frame. */
const STEP = 1 / 120, MOST_STEPS = 8;
/** A frame longer than this is a cut, not motion: the hair is hung afresh. */
const CUT = .25;
const GRAVITY = 9.8;
/** The share of a link's speed kept each second: what makes hair settle rather than swing for ever. */
const DRAG = .12;
/**
 * The most each link may turn off the line of the one above it, in radians:
 * stiffest by the tie, freest at the tip. A limit rather than a spring, so
 * gravity hangs it in a curve and the limit only stops it folding.
 */
const BEND = [.34, .7] as const;
/**
 * The ends' own spring, as an acceleration out away from the head, on the
 * last links: what flicks the tip out at the bottom of the S a ponytail
 * hangs in, rather than letting it lie flat down the back.
 */
const CURL = 3;
/** How many clumps of hair round the ponytail, and how far they turn about it from the tie to the tip. */
const CLUMPS = 7, CLUMP_TWIST = 2.4;

/**
 * Its thickness from the tie to the tip: gathered at the tie, swelling full
 * a little below it, and drawn to a point.
 */
export function radiusAt(t: number) {
  const tie = .026, full = .055, tip = .0015;
  if (t < .18) return THREE.MathUtils.lerp(tie, full, Math.sin(t / .18 * Math.PI / 2));
  return tip + (full - tip) * Math.max(0, Math.cos(Math.min(1, (t - .18) / .82) * Math.PI / 2)) ** .95;
}

/** A number from 0 to 1 for a strand, the same every time. */
function strand(n: number) {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}
const DARK = new THREE.Color('#1f120b'), LIGHT = new THREE.Color('#7a5236');
/**
 * Hair's colour at a point: dark brown, each strand its own shade, lighter
 * along the crest of a clump than in the groove between two, and caught by
 * the light where `lit` says. Shared with the hair at the nape.
 */
export function hairColour(strandAt: number, crest: number, lit: number, into = new THREE.Color()) {
  const k = THREE.MathUtils.clamp(.16 + .3 * strand(Math.floor(strandAt)) + .28 * crest + .26 * lit, 0, 1);
  return into.copy(DARK).lerp(LIGHT, k);
}

/**
 * A ponytail: a chain of links hung from the tie at the back of the head,
 * swung by the head's movement and gravity (Verlet, at a fixed step on the
 * game's clock, so it slows with the slow motion and stops with the pause),
 * kept off the helmet, the neck and the back, and drawn as one tube through
 * the chain: full and clumped into strands, a little wider than it is deep,
 * coloured strand by strand.
 */
export class Ponytail {
  readonly mesh: THREE.Mesh;
  private readonly points = Array.from({ length: LINKS + 1 }, () => new THREE.Vector3());
  private readonly last = Array.from({ length: LINKS + 1 }, () => new THREE.Vector3());
  private readonly curve: THREE.CatmullRomCurve3;
  private readonly rings = LINKS * SPAN + 1;
  private hung = false;
  private carry = 0;
  private readonly flick = new THREE.Vector3();
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
    const uv = new Float32Array(count * 2), colours = new Float32Array(count * 3), c = new THREE.Color();
    const indices: number[] = [];
    for (let r = 0; r < this.rings; r++) for (let i = 0; i <= SIDES; i++) {
      const n = r * (SIDES + 1) + i, t = r / (this.rings - 1), a = i / SIDES * Math.PI * 2;
      uv[n * 2] = i / SIDES; uv[n * 2 + 1] = t;
      // Two strands a column, so the seam's column matches its neighbour round the back.
      hairColour((i % SIDES) * 2 + 7, .5 + .5 * Math.cos(CLUMPS * a + CLUMP_TWIST * t * Math.PI * 2), Math.sin(Math.PI * Math.min(1, t * 1.6)) * (.6 + .4 * Math.cos(a)), c);
      colours.set([c.r, c.g, c.b], n * 3);
      if (r < this.rings - 1 && i < SIDES) {
        const p = n, q = p + SIDES + 1;
        indices.push(p, q, p + 1, p + 1, q, q + 1);
      }
    }
    // The tip closed on a point, so the tube is not an open pipe seen end on.
    const tip = count - 1, last = (this.rings - 1) * (SIDES + 1);
    for (let i = 0; i < SIDES; i++) indices.push(last + i, tip, last + i + 1);
    colours.set(colours.slice(last * 3, last * 3 + 3), tip * 3);
    geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geometry.setAttribute('color', new THREE.BufferAttribute(colours, 3));
    geometry.setIndex(indices);
    geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 1, 0), 3);
    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.name = 'Ponytail';
    this.mesh.castShadow = this.mesh.receiveShadow = true;
  }

  /** The links, from the tie to the tip, for the tests. */
  get chain(): readonly THREE.Vector3[] { return this.points; }
  /** How long a link is, for the tests. */
  static readonly LINK = LINK;

  /** Hang it again from the tie next time, as after a cut. */
  rehang() { this.hung = false; }

  /**
   * Move the hair on by `seconds`, the tie now at `tie` sending it out along
   * `out` (a unit vector), and draw it. Everything is in the space the mesh is
   * drawn in.
   */
  swing(tie: THREE.Vector3, out: THREE.Vector3, seconds: number, colliders: readonly HairCollider[]) {
    // The tip's flick: out from the head and level, whichever way the head is turned.
    this.flick.set(out.x, 0, out.z);
    if (this.flick.lengthSq() > 1e-6) this.flick.normalize().multiplyScalar(CURL);
    if (!this.hung || !(seconds >= 0) || seconds > CUT) this.hang(tie, out, colliders);
    else {
      this.carry = Math.min(this.carry + seconds, STEP * MOST_STEPS);
      while (this.carry >= STEP) { this.carry -= STEP; this.step(tie, out, colliders); }
      // Between steps the tie still goes where the head is: no lag at the root.
      this.hold(tie, out); this.constrain(colliders);
    }
    this.draw();
  }

  /** Straight down from the tie, then let fall and settle where it rests. */
  private hang(tie: THREE.Vector3, out: THREE.Vector3, colliders: readonly HairCollider[]) {
    this.hold(tie, out);
    for (let i = HELD + 1; i <= LINKS; i++) this.points[i].copy(this.points[i - 1]).addScaledVector(out, LINK * .5).addScaledVector(this.v.set(0, -1, 0), LINK * .7);
    this.points.forEach((p, i) => this.last[i].copy(p));
    for (let n = 0; n < 240; n++) this.step(tie, out, colliders, .9);
    this.points.forEach((p, i) => this.last[i].copy(p));
    this.hung = true; this.carry = 0;
  }

  private hold(tie: THREE.Vector3, out: THREE.Vector3) {
    for (let i = 0; i <= HELD; i++) this.points[i].copy(tie).addScaledVector(out, i * LINK);
  }

  private step(tie: THREE.Vector3, out: THREE.Vector3, colliders: readonly HairCollider[], extraDrag = 1) {
    const keep = Math.pow(DRAG, STEP) * extraDrag;
    for (let i = HELD + 1; i <= LINKS; i++) {
      const p = this.points[i], before = this.last[i];
      this.v.subVectors(p, before).multiplyScalar(keep);
      before.copy(p);
      p.add(this.v); p.y -= GRAVITY * STEP * STEP;
      const end = (i - (LINKS - 3)) / 3;
      if (end > 0) p.addScaledVector(this.flick, end * STEP * STEP);
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
      for (let i = HELD + 1; i <= LINKS; i++) for (const c of colliders) this.outOf(this.points[i], c, radiusAt(i / LINKS) * .85);
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

  private outOf(p: THREE.Vector3, { from, to, radius }: HairCollider, thick: number) {
    this.w.subVectors(to, from);
    const span = this.w.lengthSq();
    const t = span > 1e-9 ? THREE.MathUtils.clamp(this.v.subVectors(p, from).dot(this.w) / span, 0, 1) : 0;
    this.at.copy(from).addScaledVector(this.w, t);
    this.v.subVectors(p, this.at);
    const d = this.v.length(), wanted = radius + thick;
    if (d < wanted && d > 1e-6) p.copy(this.at).addScaledVector(this.v, wanted / d);
  }

  /**
   * The tube through the chain, rings carried down it so it never twists.
   * Each ring a little wider than deep, the way a ponytail lies, and lobed
   * into clumps that turn slowly about it and part towards the tip.
   */
  private draw() {
    const positions = this.mesh.geometry.getAttribute('position') as THREE.BufferAttribute;
    this.curve.updateArcLengths();
    for (let r = 0; r < this.rings; r++) {
      const t = r / (this.rings - 1);
      this.curve.getPointAt(t, this.at);
      this.curve.getTangentAt(t, this.along).normalize();
      if (r === 0) {
        // Side to side across the first link; after that, carried along.
        this.normal.set(1, 0, 0).addScaledVector(this.along, -this.along.x);
        if (this.normal.lengthSq() < 1e-4) this.normal.set(0, 0, 1).addScaledVector(this.along, -this.along.z);
      } else this.normal.addScaledVector(this.along, -this.normal.dot(this.along));
      this.normal.normalize();
      this.binormal.crossVectors(this.along, this.normal);
      const radius = radiusAt(t), lobe = .06 + .12 * Math.min(t, .8) ** 2, deep = .8 + .12 * t;
      for (let i = 0; i <= SIDES; i++) {
        const a = i / SIDES * Math.PI * 2;
        const clump = radius * (1 + lobe * Math.cos(CLUMPS * a + CLUMP_TWIST * t * Math.PI * 2));
        this.v.copy(this.at).addScaledVector(this.normal, Math.cos(a) * clump).addScaledVector(this.binormal, Math.sin(a) * clump * deep);
        positions.setXYZ(r * (SIDES + 1) + i, this.v.x, this.v.y, this.v.z);
      }
    }
    this.curve.getPointAt(1, this.v).addScaledVector(this.along, .012);
    positions.setXYZ(positions.count - 1, this.v.x, this.v.y, this.v.z);
    positions.needsUpdate = true;
    updateGarmentNormals(this.mesh.geometry);
    // The first and last columns are one place: one light, or a line runs down the back of it.
    const normals = this.mesh.geometry.getAttribute('normal') as THREE.BufferAttribute;
    for (let r = 0; r < this.rings; r++) {
      const a = r * (SIDES + 1), b = a + SIDES;
      this.v.fromBufferAttribute(normals, a).add(this.w.fromBufferAttribute(normals, b)).normalize();
      normals.setXYZ(a, this.v.x, this.v.y, this.v.z); normals.setXYZ(b, this.v.x, this.v.y, this.v.z);
    }
  }

  dispose() { this.mesh.geometry.dispose(); }
}
