import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/** +Z faces the bat. The rear rim dips centrally and rises toward the sides. */
function shellPoint(angle: number, t: number) {
  const front = Math.max(0, Math.cos(angle)), back = Math.max(0, -Math.cos(angle));
  // A shallow smile from behind: low at the centre, high at either corner.
  // Keep the whole rear edge clear of the neck rather than cutting an arch into it.
  const rimY = .035 * front ** 2 - .04 * (1 - front ** 2) - .035 * back ** 2;
  const phi = t * Math.acos((rimY - .024) / .184);
  return new THREE.Vector3(.183 * Math.sin(phi) * Math.sin(angle),
    .024 + .184 * Math.cos(phi), -.02 + .202 * Math.sin(phi) * Math.cos(angle));
}

/** Oval crown with a smile-shaped rear edge, instead of a central nape cutout. */
export function helmetGeometry() {
  const rows = 20, sides = 40, positions: number[] = [], indices: number[] = [];
  for (let j = 0; j <= rows; j++) for (let i = 0; i <= sides; i++) {
    const p = shellPoint(i / sides * Math.PI * 2, j / rows); positions.push(p.x, p.y, p.z);
    if (j < rows && i < sides) {
      const a = j * (sides + 1) + i, b = a + sides + 1;
      indices.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(positions.length / 3 * 2), 2));
  geometry.setIndex(indices); geometry.computeVertexNormals();
  const normals = geometry.getAttribute('normal');
  for (let j = 0; j <= rows; j++) {
    const a = j * (sides + 1), b = a + sides;
    const n = new THREE.Vector3().fromBufferAttribute(normals, a).add(new THREE.Vector3().fromBufferAttribute(normals, b)).normalize();
    normals.setXYZ(a, n.x, n.y, n.z); normals.setXYZ(b, n.x, n.y, n.z);
  }
  return geometry;
}

export function helmetRimGeometry() {
  const points = Array.from({ length: 48 }, (_, i) => shellPoint(i / 48 * Math.PI * 2, 1));
  return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points, true), 48, .0035, 5, true);
}

/** How far the peak stands out over the eyes, and how far round the front it runs either side. */
const PEAK = { depth: .085, reach: 1.42, thick: .017, droop: .2 } as const;

/**
 * The peak: a short brim that follows the shell round the front, deepest
 * over the eyes and gone by the temples, sloping a little down. A flat slab
 * across the front read as a cap's, not a helmet's.
 */
export function helmetPeakGeometry() {
  // The section of the brim at each step round: in along the top from the
  // shell to a rounded lip, and back along the underside.
  const section: [number, number][] = [[0, 0], [.45, 0], [.85, .02], [1, .5], [.85, .98], [.45, 1], [0, 1]];
  const across = 32, positions: number[] = [], indices: number[] = [];
  for (let i = 0; i <= across; i++) {
    const angle = (i / across * 2 - 1) * PEAK.reach, fade = Math.cos(angle / PEAK.reach * Math.PI / 2);
    const rim = shellPoint(angle, 1), out = new THREE.Vector3(Math.sin(angle), 0, Math.cos(angle));
    const depth = PEAK.depth * fade ** .7, thick = PEAK.thick * (.35 + .65 * fade);
    for (const [v, w] of section) {
      const p = rim.clone().addScaledVector(out, depth * v - .006);
      p.y += .004 - depth * v * PEAK.droop - thick * w;
      positions.push(p.x, p.y, p.z);
    }
  }
  const n = section.length;
  for (let i = 0; i < across; i++) for (let k = 0; k < n - 1; k++) {
    const a = i * n + k, b = a + n;
    indices.push(a, b, a + 1, a + 1, b, b + 1);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(positions.length / 3 * 2), 2));
  geometry.setIndex(indices); geometry.computeVertexNormals();
  return geometry;
}

/** Where the grille is bolted on, either side: on the shell's edge at the temple. */
export const GRILLE_MOUNT = new THREE.Vector3(.172, -.03, .045);
/** Where each of the grille's sides ends, under the jaw, and the bottom bar takes it round the chin. */
const JAW = new THREE.Vector3(.075, -.222, .14);

/**
 * The grille, all its bars in one: hoops round the face from one side to the
 * other, a side bar either side running from the mount down and forward to
 * under the jaw, and two upright bars down the middle. Seen from the side it
 * is the cricket helmet's long wedge to a point under the chin, and from in
 * front a cage narrowing to a rounded bottom; two straight bars across the
 * face were a motorbike's.
 */
export function helmetGrilleGeometry(radius = .0065) {
  const side = (s: number, t: number) => {
    // From the mount down to the jaw: the side bar, bowed a little outwards.
    const p = GRILLE_MOUNT.clone().setX(GRILLE_MOUNT.x * s).lerp(JAW.clone().setX(JAW.x * s), t);
    p.x += s * .03 * Math.sin(t * Math.PI);
    return p;
  };
  /** A hoop round the front from one side bar to the other, `t` down it, standing `out` clear of the face. */
  const hoop = (t: number, y: number, front: number) => {
    const from = side(1, t), points: THREE.Vector3[] = [];
    for (let i = 0; i <= 12; i++) {
      const a = (i / 12 * 2 - 1) * Math.PI / 2;
      points.push(new THREE.Vector3(from.x * Math.sin(a), THREE.MathUtils.lerp(from.y, y, Math.cos(a)), from.z + (front - from.z) * Math.cos(a)));
    }
    return points;
  };
  const curves: THREE.Vector3[][] = [
    hoop(0, -.034, .208), hoop(.33, -.1, .214), hoop(.66, -.164, .2), hoop(1, -.234, .17),
    Array.from({ length: 9 }, (_, i) => side(1, i / 8)),
    Array.from({ length: 9 }, (_, i) => side(-1, i / 8)),
  ];
  // The uprights: from the top hoop down the front to the bottom one.
  for (const x of [-.042, .042]) curves.push([
    new THREE.Vector3(x, -.036, .206), new THREE.Vector3(x, -.102, .212),
    new THREE.Vector3(x * .92, -.166, .198), new THREE.Vector3(x * .8, -.232, .168),
  ]);
  const tubes = curves.map(points => new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), points.length * 4, radius, 6, false));
  const geometry = mergeGeometries(tubes);
  tubes.forEach(t => t.dispose());
  return geometry;
}
