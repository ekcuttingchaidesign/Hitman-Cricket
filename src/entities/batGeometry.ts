import * as THREE from 'three';

/**
 * The blade's outline from the face: [y, half-width]. Measured off photographs
 * of real bats — an SG face, side and back, and an SS face, side and back —
 * as fractions of the blade's width, then fitted to the model's length. From
 * where the shoulders leave the handle to the toe a real blade is five and a
 * half times as long as it is wide (5.41 the SG, 5.59 the SS), so this one is
 * 126 mm wide over its 700.
 *
 * The shoulders stay close to the handle for 20 mm, then sweep out to square
 * corners 37 mm down; the blade then runs at full width to within 12 mm of the
 * bottom. The toe is a shallow smile: level across the middle, rising 3 mm a
 * fifth of the way out and 12 mm at the corners, as photographed.
 */
const OUTLINE = [
  [-.134, .023], [-.144, .0255], [-.152, .030], [-.159, .034], [-.162, .0375],
  [-.164, .042], [-.166, .0465], [-.168, .053], [-.170, .0595], [-.171, .063],
  [-.822, .063], [-.824, .0605], [-.826, .0565], [-.828, .051], [-.830, .043], [-.8315, .034], [-.833, .020], [-.834, .010],
] as const;

/**
 * Side on: [y, front bow, edge thickness, spine thickness], from the same
 * photographs. The swell rises steadily from the shoulder to its peak two
 * thirds of the way down, where a ball is middled, and falls away to a toe a
 * little thinner than the shoulder. The edges follow it at about three fifths
 * of the spine's depth, and the back between them arches to a central ridge.
 */
const PROFILE = [
  [-.134, .019, .036, .042], [-.176, .0195, .028, .042], [-.232, .020, .029, .045],
  [-.281, .021, .031, .049], [-.337, .0215, .033, .053], [-.393, .022, .036, .058],
  [-.442, .0225, .038, .061], [-.498, .023, .040, .066], [-.554, .023, .042, .070],
  [-.596, .023, .043, .073], [-.638, .0225, .042, .070], [-.687, .022, .040, .063],
  [-.743, .021, .036, .052], [-.785, .020, .033, .043], [-.820, .019, .031, .038],
  [-.834, .019, .029, .034],
] as const;

/** Linear between the rows of a table that runs down the blade. */
function along(table: readonly (readonly number[])[], y: number, column: number) {
  if (y >= table[0][0]) return table[0][column];
  for (let i = 1; i < table.length; i++) if (y >= table[i][0]) {
    const [a, b] = [table[i - 1], table[i]], t = (y - a[0]) / (b[0] - a[0]);
    return a[column] + (b[column] - a[column]) * t;
  }
  return table[table.length - 1][column];
}

/**
 * One cross-section: the flat face with rounded corners, the edges, and the
 * back arching from each edge up to the spine. Convex, so a fan closes the ends.
 */
function section(w: number, face: number, edge: number, spine: number): [number, number][] {
  const r = Math.min(.004, w * .15, edge * .15), k = .29;
  const arch = (t: number) => face - edge - (spine - edge) * (1 - t ** 1.5);
  const inner = w - r;
  return [
    [-w, face - r], [-w + r * k, face - r * k], [-w + r, face],
    [w - r, face], [w - r * k, face - r * k], [w, face - r],
    [w, face - edge + r], [w - r * k, face - edge + r * k], [inner, face - edge],
    [inner * .7, arch(.7)], [inner * .45, arch(.45)], [inner * .2, arch(.2)],
    [0, face - spine],
    [-inner * .2, arch(.2)], [-inner * .45, arch(.45)], [-inner * .7, arch(.7)],
    [-inner, face - edge], [-w + r * k, face - edge + r * k], [-w, face - edge + r],
  ];
}

/** Reference-based willow profile. +Z is the striking face; the raised spine
 * lives on -Z. Dimensions and grip origin match the animation/contact rig. */
export function bladeGeometry() {
  const heights = [...new Set([...OUTLINE, ...PROFILE].map(row => row[0]))].sort((a, b) => b - a);
  const rings = heights.map(y => section(along(OUTLINE, y, 1), along(PROFILE, y, 1), along(PROFILE, y, 2), along(PROFILE, y, 3)));
  const count = rings[0].length;
  const positions: number[] = [], uv: number[] = [], indices: number[] = [];
  rings.forEach((ring, row) => {
    for (const [x, z] of ring) {
      positions.push(x, heights[row], z);
      uv.push((x + .063) / .126, (-heights[row] - .134) / .7);
    }
  });
  for (let row = 0; row < rings.length - 1; row++) for (let col = 0; col < count; col++) {
    const a = row * count + col, b = a + count, c = row * count + (col + 1) % count, d = c + count;
    indices.push(a, b, d, a, d, c);
  }
  const end = (rings.length - 1) * count;
  for (let col = 1; col < count - 1; col++) {
    indices.push(0, col, col + 1);
    indices.push(end, end + col + 1, end + col);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geometry.setIndex(indices); geometry.computeVertexNormals(); geometry.computeBoundingBox();
  return geometry;
}

/** Ribbed rubber grip in one draw call, with a flared end cap. */
export function gripGeometry() {
  const profile=[new THREE.Vector2(.019,-.122)];
  for(let n=0;n<28;n++) {
    const y=-.12+n*.012;
    const radius=.0215+.0015*Math.sin(n/27*Math.PI);
    profile.push(new THREE.Vector2(radius,y),new THREE.Vector2(radius+.0015,y+.003),
      new THREE.Vector2(radius+.0015,y+.006),new THREE.Vector2(radius,y+.009));
  }
  profile.push(new THREE.Vector2(.022,.218),new THREE.Vector2(.028,.222),
    new THREE.Vector2(.028,.234),new THREE.Vector2(.022,.238),new THREE.Vector2(0,.238));
  return new THREE.LatheGeometry(profile,20);
}
