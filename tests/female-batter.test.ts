import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { Batter, CELEBRATION_LENGTHS, HOOK_MEETS_AT, PULL_MEETS_AT, STROKE_DURATION_MS } from '../src/entities/Batter';
import type { ConnectedJersey } from '../src/entities/ConnectedJersey';
import { GAME, LINE_X } from '../src/config/gameplay';
import { jerseyGeometry } from '../src/entities/garment';
import { SHAPES, physiqueOf } from '../src/entities/physique';
import { Ponytail, radiusAt } from '../src/entities/Ponytail';

type Rig = { connectedJersey: ConnectedJersey; head: THREE.Group; torso: THREE.Group; hair: THREE.Group };
const rigOf = (batter: Batter) => batter as unknown as Rig;

/** Every open edge of the shirt: the waist, the collar and the wrists, and nothing at the shoulders. */
function openEdges(geometry: THREE.BufferGeometry) {
  const index = geometry.index!, edges = new Map<string, number>();
  for (let i = 0; i < index.count; i += 3) for (let j = 0; j < 3; j++) {
    const a = index.getX(i + j), b = index.getX(i + (j + 1) % 3), key = a < b ? `${a}:${b}` : `${b}:${a}`;
    edges.set(key, (edges.get(key) ?? 0) + 1);
  }
  return [...edges.values()].filter(n => n === 1).length;
}

/** Bat a stroke and read the rig at every step of it. */
function stroke(batter: Batter, sample: (t: number) => void) {
  batter.reset(); batter.prepare(1); batter.update(0);
  batter.swing('COVER_LONG_OFF', 0, .2, .54, GAME.contactZ);
  for (let t = 0; t <= STROKE_DURATION_MS; t += 16) { batter.update(t); batter.drape(); sample(t); }
}

describe('the female build', () => {
  it('is read from a word, the male build for anything else', () => {
    expect(physiqueOf('female')).toBe('female');
    for (const word of ['male', '', null, undefined, 'woman']) expect(physiqueOf(word)).toBe('male');
  });

  it('leaves the male shirt exactly as it was', () => {
    const before = jerseyGeometry(16, 24), after = jerseyGeometry(16, 24, SHAPES.male);
    expect(Array.from(after.getAttribute('position').array)).toEqual(Array.from(before.getAttribute('position').array));
  });

  it('is cut in at the waist and out over the hips and the bust, narrower at the shoulders', () => {
    const widest = (shape: typeof SHAPES.male, low: number, high: number, axis: 0 | 2, front = false) => {
      const p = jerseyGeometry(16, 24, shape).getAttribute('position');
      let most = 0;
      for (let i = 0; i < p.count; i++) {
        const y = p.getY(i);
        if (y < low || y > high || (front && p.getZ(i) < 0)) continue;
        most = Math.max(most, Math.abs(axis === 0 ? p.getX(i) : p.getZ(i)));
      }
      return most;
    };
    const { male, female } = SHAPES;
    expect(widest(female, -.03, .08, 0)).toBeLessThan(widest(male, -.03, .08, 0) - .01);
    expect(widest(female, -.26, -.2, 0)).toBeLessThan(widest(male, -.26, -.2, 0));
    expect(widest(female, -.34, -.3, 0)).toBeGreaterThan(widest(male, -.34, -.3, 0));
    expect(widest(female, -.08, 0, 2, true)).toBeGreaterThan(widest(female, -.2, -.14, 2, true) + .02);
  });

  it('bats on the same rig: every hand, foot and the bat where the male build has them', () => {
    const him = new Batter(), her = new Batter(); her.shapeAs('female');
    expect(her.build).toBe('female');
    const poses: unknown[] = [];
    stroke(him, () => poses.push(him.inspect()));
    let n = 0;
    stroke(her, () => expect(her.inspect()).toEqual(poses[n++]));
  });

  it('keeps the shirt joined at the shoulders and every vertex sound through a stroke and a celebration', () => {
    const her = new Batter(); her.shapeAs('female');
    const geometry = rigOf(her).connectedJersey.mesh.geometry;
    expect(openEdges(geometry)).toBe(96);
    const check = () => {
      for (const value of geometry.getAttribute('position').array) expect(Number.isFinite(value)).toBe(true);
    };
    stroke(her, check);
    her.reset(); her.celebrate(0, 'hundred');
    for (let t = 0; t <= CELEBRATION_LENGTHS.hundred; t += 80) { her.update(t); her.drape(); check(); }
  });

  it('wears the hair only as the female build, and changes back', () => {
    const batter = new Batter();
    expect(rigOf(batter).hair.visible).toBe(false);
    expect(batter.ponytailChain).toEqual([]);
    batter.shapeAs('female'); batter.update(0); batter.drape();
    expect(rigOf(batter).hair.visible).toBe(true);
    expect(batter.ponytailChain.length).toBeGreaterThan(4);
    batter.shapeAs('male');
    expect(rigOf(batter).hair.visible).toBe(false);
    expect(batter.ponytailChain).toEqual([]);
  });
});

describe('the ponytail', () => {
  /** How far each link sits outside the helmet, the neck and the back, and how long each link is. */
  function measure(batter: Batter) {
    const { head, torso } = rigOf(batter);
    const chain = batter.ponytailChain;
    const spine = new THREE.Vector3(0, 1, 0).applyQuaternion(torso.quaternion);
    const shell = new THREE.Vector3(0, .024, -.02).applyQuaternion(head.quaternion).add(head.position);
    const back = [torso.position.clone().addScaledVector(spine, -.32), torso.position.clone().addScaledVector(spine, .06)];
    let inside = Infinity, stretch = 0;
    chain.forEach((p, i) => {
      if (i > 0) stretch = Math.max(stretch, Math.abs(p.distanceTo(chain[i - 1]) - Ponytail.LINK));
      if (i < 3) return;
      // Measured from the hair's own surface, not its middle: it is thick.
      const thick = radiusAt(i / (chain.length - 1)) * .85;
      inside = Math.min(inside, p.distanceTo(shell) - .195 - thick);
      const line = back[1].clone().sub(back[0]);
      const along = THREE.MathUtils.clamp(p.clone().sub(back[0]).dot(line) / line.lengthSq(), 0, 1);
      inside = Math.min(inside, p.distanceTo(back[0].clone().addScaledVector(line, along)) - .145 - thick);
    });
    return { chain, inside, stretch };
  }

  it('hangs from the back of the head, below the tie, at rest', () => {
    const her = new Batter(); her.shapeAs('female'); her.update(0); her.drape();
    const { chain, inside, stretch } = measure(her);
    const head = rigOf(her).head.position;
    expect(chain[0].z).toBeLessThan(head.z - .1);
    // Long enough to be seen: the tip well down the back, below the shoulders.
    expect(chain[chain.length - 1].y).toBeLessThan(chain[0].y - .22);
    expect(inside).toBeGreaterThan(-.005);
    expect(stretch).toBeLessThan(.002);
  });

  it('swings with a stroke, stays off the helmet and the back, and keeps its length', () => {
    const her = new Batter(); her.shapeAs('female');
    let lowest = Infinity, stretched = 0, moved = 0;
    let before: THREE.Vector3 | null = null;
    stroke(her, () => {
      const { chain, inside, stretch } = measure(her);
      lowest = Math.min(lowest, inside); stretched = Math.max(stretched, stretch);
      const tip = chain[chain.length - 1].clone().sub(rigOf(her).head.position);
      if (before) moved = Math.max(moved, tip.distanceTo(before));
      before = tip;
      for (const p of chain) expect(p.toArray().every(Number.isFinite)).toBe(true);
    });
    expect(lowest).toBeGreaterThan(-.01);
    expect(stretched).toBeLessThan(.003);
    // It moves against the head: it is hair, not part of the helmet.
    expect(moved).toBeGreaterThan(.002);
  });

  it('comes to rest when the head does', () => {
    const her = new Batter(); her.shapeAs('female');
    stroke(her, () => undefined);
    for (let t = STROKE_DURATION_MS; t < STROKE_DURATION_MS + 6000; t += 16) { her.update(t); her.drape(); }
    const settled = her.ponytailChain;
    her.update(STROKE_DURATION_MS + 6016); her.drape();
    const after = her.ponytailChain;
    expect(Math.max(...after.map((p, i) => p.distanceTo(settled[i])))).toBeLessThan(.003);
  });
});

describe('the ponytail against her body', () => {
  type Arms = { arms: { shoulder: THREE.Vector3; elbow: THREE.Mesh; wrist: THREE.Vector3 }[] };
  /** The shirt's half-width and half-depth at a height in the torso's frame, off her profile. */
  function shirtAt(y: number) {
    const rows = SHAPES.female.jersey;
    for (let i = 1; i < rows.length; i++) {
      const [x0, y0, z0] = rows[i - 1], [x1, y1, z1] = rows[i];
      if (y >= y0 && y <= y1) { const k = (y - y0) / (y1 - y0); return [x0 + (x1 - x0) * k, z0 + (z1 - z0) * k]; }
    }
    return null;
  }
  const segment = (p: THREE.Vector3, a: THREE.Vector3, b: THREE.Vector3) => {
    const line = b.clone().sub(a), k = THREE.MathUtils.clamp(p.clone().sub(a).dot(line) / line.lengthSq(), 0, 1);
    return p.distanceTo(a.clone().addScaledVector(line, k));
  };
  /**
   * How deep any part of the hair goes into the shirt, an arm or the helmet,
   * measured from most of the way out to its surface (the clumps between
   * the lobes give a little); 0 when it stays clear.
   */
  function deepest(batter: Batter) {
    const { torso, head } = rigOf(batter), { arms } = batter as unknown as Arms;
    const chain = batter.ponytailChain, inverse = torso.quaternion.clone().invert();
    const shell = new THREE.Vector3(0, .024, -.02).applyQuaternion(head.quaternion).add(head.position);
    let worst = 0;
    for (let i = 2; i < chain.length; i++) for (const k of [0, .5]) {
      if (i === chain.length - 1 && k) continue;
      const p = chain[i].clone().lerp(chain[Math.min(i + 1, chain.length - 1)], k);
      const thick = radiusAt((i + k) / (chain.length - 1)) * .7;
      const local = p.clone().sub(torso.position).applyQuaternion(inverse);
      const shirt = shirtAt(local.y);
      if (shirt) {
        const a = shirt[0] + thick, b = shirt[1] + thick, reach = Math.hypot(local.x / a, local.z / b);
        if (reach < 1) worst = Math.max(worst, (1 - reach) * Math.min(a, b));
      }
      for (const arm of arms) {
        worst = Math.max(worst, .05 + thick - segment(p, arm.shoulder, arm.elbow.position));
        worst = Math.max(worst, .04 + thick - segment(p, arm.elbow.position, arm.wrist));
      }
      worst = Math.max(worst, .183 + thick - p.distanceTo(shell));
    }
    return worst;
  }
  const plays: [string, (b: Batter) => void][] = [
    ['the pull', b => b.swing('LEG', 0, LINE_X.MIDDLE, 1.12, GAME.contactZ + PULL_MEETS_AT)],
    ['the pull, version one', b => b.swing('LEG', 0, LINE_X.MIDDLE, 1.12, GAME.contactZ, false, false, false, false, 1)],
    ['the hook', b => b.swing('HOOK', 0, LINE_X.OUTSIDE_OFF, 1.134, GAME.contactZ + HOOK_MEETS_AT)],
    ['the cut', b => b.swing('SQUARE_CUT', 0, LINE_X.OUTSIDE_OFF, .9, GAME.contactZ)],
    ['the cover drive', b => b.swing('COVER_LONG_OFF', 0, LINE_X.OFF, .54, GAME.contactZ)],
    ['the straight six', b => b.swing('STRAIGHT', 0, LINE_X.MIDDLE, .54, GAME.contactZ, false, true)],
    ['the slog sweep', b => b.swing('LEG', 0, LINE_X.MIDDLE, .48, GAME.contactZ, false, false, true)],
  ];
  it.each(plays)('stays out of her through %s', (_, play) => {
    const her = new Batter(); her.shapeAs('female');
    her.reset(); her.prepare(1);
    for (let t = -600; t < 0; t += 8) { her.update(t); her.drape(); }
    play(her);
    let worst = 0, when = 0;
    for (let t = 0; t <= STROKE_DURATION_MS + 1200; t += 8) {
      her.update(t); her.drape();
      const deep = deepest(her);
      if (deep > worst) { worst = deep; when = t; }
    }
    expect(worst, `${worst.toFixed(3)} m deep at ${when} ms`).toBeLessThan(.01);
  });
  it.each(Object.keys(CELEBRATION_LENGTHS))('stays out of her through the %s celebration', kind => {
    const her = new Batter(); her.shapeAs('female'); her.update(0); her.drape();
    her.celebrate(0, kind as keyof typeof CELEBRATION_LENGTHS);
    let worst = 0;
    for (let t = 0; t <= CELEBRATION_LENGTHS[kind as keyof typeof CELEBRATION_LENGTHS]; t += 8) { her.update(t); her.drape(); worst = Math.max(worst, deepest(her)); }
    expect(worst).toBeLessThan(.01);
  });
});

describe('the hair\'s surfaces', () => {
  /** The share of a mesh's faces that look away from `centreOf` the face: 1 when it is drawn the right way out. */
  function outward(geometry: THREE.BufferGeometry, centreOf: (p: THREE.Vector3) => THREE.Vector3) {
    const p = geometry.getAttribute('position'), index = geometry.index!;
    let out = 0, all = 0;
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
    for (let i = 0; i < index.count; i += 3) {
      a.fromBufferAttribute(p, index.getX(i)); b.fromBufferAttribute(p, index.getX(i + 1)); c.fromBufferAttribute(p, index.getX(i + 2));
      const normal = b.clone().sub(a).cross(c.clone().sub(a));
      if (normal.lengthSq() < 1e-14) continue;
      const middle = a.clone().add(b).add(c).divideScalar(3);
      all++; if (normal.dot(middle.clone().sub(centreOf(middle))) > 0) out++;
    }
    return out / all;
  }
  it('are all drawn the right way out, so none of it reads as hollow', () => {
    const her = new Batter(); her.shapeAs('female'); her.update(0); her.drape();
    const [nape, gather] = rigOf(her).hair.children as THREE.Mesh[];
    expect(outward(nape.geometry, () => new THREE.Vector3(0, -.03, 0))).toBeGreaterThan(.99);
    // A tube's faces look away from its own line: the nearest point on the chain.
    const line = (points: THREE.Vector3[]) => (p: THREE.Vector3) => {
      let best = points[0], least = Infinity;
      for (let i = 1; i < points.length; i++) {
        const a = points[i - 1], d = points[i].clone().sub(a), k = THREE.MathUtils.clamp(p.clone().sub(a).dot(d) / d.lengthSq(), 0, 1);
        const at = a.clone().addScaledVector(d, k), far = p.distanceTo(at);
        if (far < least) { least = far; best = at; }
      }
      return best;
    };
    const ends = [new THREE.Vector3(0, -.048, -.1), new THREE.Vector3(0, -.098, -.17)];
    expect(outward(gather.geometry, line(ends))).toBeGreaterThan(.95);
    const ponytail = (her as unknown as { ponytail: { mesh: THREE.Mesh } }).ponytail.mesh;
    expect(outward(ponytail.geometry, line(her.ponytailChain))).toBeGreaterThan(.95);
  });
});
