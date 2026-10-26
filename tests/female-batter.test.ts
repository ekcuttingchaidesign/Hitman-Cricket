import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { Batter, CELEBRATION_LENGTHS, STROKE_DURATION_MS } from '../src/entities/Batter';
import type { ConnectedJersey } from '../src/entities/ConnectedJersey';
import { GAME } from '../src/config/gameplay';
import { jerseyGeometry } from '../src/entities/garment';
import { SHAPES, physiqueOf } from '../src/entities/physique';

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
      if (i > 0) stretch = Math.max(stretch, Math.abs(p.distanceTo(chain[i - 1]) - .30 / 8));
      if (i < 3) return;
      inside = Math.min(inside, p.distanceTo(shell) - .195);
      const line = back[1].clone().sub(back[0]);
      const along = THREE.MathUtils.clamp(p.clone().sub(back[0]).dot(line) / line.lengthSq(), 0, 1);
      inside = Math.min(inside, p.distanceTo(back[0].clone().addScaledVector(line, along)) - .145);
    });
    return { chain, inside, stretch };
  }

  it('hangs from the back of the head, below the tie, at rest', () => {
    const her = new Batter(); her.shapeAs('female'); her.update(0); her.drape();
    const { chain, inside, stretch } = measure(her);
    const head = rigOf(her).head.position;
    expect(chain[0].z).toBeLessThan(head.z - .1);
    expect(chain[chain.length - 1].y).toBeLessThan(chain[0].y - .15);
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
