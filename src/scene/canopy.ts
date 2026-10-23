import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Batch } from './build';
import { CENTRE_Z, RING, SECTIONS, STADIUM, span, stadium, type SeatFn, type StadiumLights } from './stadium';
import { seeded } from './turf';

/**
 * The canopy: a modern ground, built from the reference picture the game's
 * designer gave for it. Over the far end a tall block with the big screen on
 * top, HITMAN CRICKET on it, and two glass-fronted hospitality floors under
 * it, lit warm, with two flags over the screen's corners; either side of it a
 * roof canopy sweeping round the ground, its tip lifted beside the screen and
 * its underside a field of downlights; under the canopies two tiers packed
 * with crowd, stair aisles with white nosings and handrails down every
 * section, the upper tier's white fascia over a warm band of concourse light;
 * trees behind, seen through the gap between the upper tier and the roof; and
 * square floodlight heads of round lamps over the far corners.
 *
 * It is the stadium's bowl in everything that is not to be seen (the batch,
 * the crowd that cheers, the sightscreen), with a section of stand of its own
 * (`section`), the far end's block in place of the section straight behind
 * the bowler (`end`), and its own crowd in the home side's greens.
 *
 * At night it is the lighting that carries it: the lamps in the deck soffits,
 * the hospitality ceilings and the canopy's underside are the stadium's lamp
 * material, turned up with the floodlights, and each has a small glow
 * (`spots`); the concourse walls, the hospitality back walls, the soffits and
 * the canopy's panels are lit warm from within (`warm`), dark by day.
 */

export const CANOPY = {
  /** The steps the crowd sits on, a pale concrete. */
  concrete: 0x7f858b,
  /** Fascias, nosings, slabs, frames: painted white. */
  trim: 0xf5f6f3,
  /** Handrails, columns and ties. */
  steel: 0x8f989e,
  /** The undersides of the decks, lit from the lamps in them at night. */
  soffit: 0xc9c2d8,
  /** The concourse and hospitality back walls, warm with their lights at night. */
  wall: 0x6c655d,
  /** The players' level under the hospitality floors, dark glass. */
  dark: 0x1b242b,
  /** Glass balustrades. */
  glass: 0x86a0b0,
  /** The screen's frame and the box behind it. */
  frame: 0x222a31,
  /** The towers: white masts and frames round a dark head. */
  mast: 0xe4e8ec,
  head: 0x262d34,
  /** The trees behind, two greens. */
  leaf: 0x22422a,
  leafLight: 0x2f5634,
  /** The flags over the screen. */
  flag: 0x1f7a3a,
} as const;

/** The home side's crowd: greens and whites, with blues and the odd dark shirt. */
const CROWD = [0x1f7a3a, 0xf2f2ee, 0x2a9d4b, 0x1d3f8a, 0xe6e2d8, 0x14532d, 0x9fb7cc, 0x2c2f36, 0x3fae5f, 0xf7f7f4, 0x245c9c];
/** Whose shirt, drawn for each seat, so no two sections are the same pattern. */
const shirts = seeded(91);
const shirt = () => Math.floor(shirts() * 1e6);

/**
 * A section's levels, in its own frame (the front of the stand at the ring,
 * outwards +z, up +y): the lower tier raking back from the rope; over its
 * last rows the upper deck, its white fascia and a glass balustrade on it,
 * and a warm concourse band under it; the upper tier; the back wall.
 */
const LOW = { rows: 6, rise: .45, step: .9, z: -1.9, y: .6 } as const;
const DECK = { z: 1.4, y: 4.1, fascia: .65, glass: .5 } as const;
const UP = { rows: 8, rise: .55, step: .9, z: 2.0, y: 5.0 } as const;
const BACK = UP.z + UP.rows * UP.step + .1;
const WALL_TOP = UP.y + (UP.rows - 1) * UP.rise + 1.0;
/** Seats this far apart along a row: closer than the stadium's, for a packed house. */
const SEAT = .55;
/** Half the width of the stair aisle down the middle of every section. */
const AISLE = .5;

/**
 * The canopy: from a lifted tip beside the screen (`from`, an angle round the
 * ground off straight) round to behind the batter, its front edge over the
 * upper tier's fascia and its back over the columns behind the stand. It is
 * highest at its front edge and falls back to the columns, as a cantilever
 * does: rising to the back, it rose more steeply than a line from the
 * batter's end, and the camera saw its top rather than its lights.
 */
const ROOF = { from: .14, to: Math.PI - .03, front: RING + 1.2, back: RING + 14, frontY: 12.4, backY: 10.9, tip: .24, lift: 2.2 } as const;

/** The far end's block, straight across behind the sightscreen. */
const BLOCK = { z: CENTRE_Z + RING - 1.7, width: 9.8, floor1: 3.3, floor2: 5.6, roof: 7.9 } as const;
/** The screen on the block's roof: its face, and the frame round it. */
const SCREEN = { width: 9.2, height: 3.5, bottom: 8.35 } as const;

/** The towers: over the far corners, standing above the canopies, and a pair out of shot behind the batter. */
const TOWERS = [[-19, 70], [19, 70], [-25, -46], [25, -46]] as const;
const MAST = 15.5;

export function canopyStands(world: THREE.Object3D): StadiumLights {
  const warm = {
    wall: new THREE.MeshStandardMaterial({ color: CANOPY.wall, roughness: .9, emissive: 0xffd49a, emissiveIntensity: 0 }),
    soffit: new THREE.MeshStandardMaterial({ color: CANOPY.soffit, roughness: .85, emissive: 0x9c8466, emissiveIntensity: 0 }),
  };
  const spots: THREE.Vector3[] = [];
  const lights = stadium(world, {
    commentary: false, towers: false, roofLamps: false, crowd: CROWD,
    section: (b, seat, frame) => tiers(b, seat, frame, span, spots),
    end: {
      skip: section => section === 0,
      build: (b, seat, l) => {
        b.finish(CANOPY.wall, warm.wall); b.finish(CANOPY.soffit, warm.soffit);
        block(b, seat, spots);
        towers(b, l);
        trees(b);
        columns(b);
      },
    },
  });
  const roof = canopies(spots);
  roof.meshes.forEach(mesh => world.add(mesh));
  const screen = bigScreen();
  lights.spots = spots;
  lights.warm = [warm.wall, warm.soffit, roof.under];
  lights.unmirrored = [screen.mesh];
  lights.textures = [...roof.textures, screen.texture];
  return lights;
}

/** One section of stand, `width(z)` wide at `z` behind its front: two tiers, the aisle, the deck between them. */
function tiers(b: Batch, seat: SeatFn, frame: THREE.Matrix4, width: (z: number) => number, spots: THREE.Vector3[]) {
  const { concrete, trim, steel, soffit, wall, glass } = CANOPY;
  const row = (y: number, z: number) => {
    const w = width(z), count = Math.floor((w - .3) / SEAT);
    for (let col = 0; col < count; col++) {
      const x = -(count - 1) * SEAT / 2 + col * SEAT;
      if (Math.abs(x) < AISLE) continue;
      seat(frame, x, y + .3, z, shirt());
    }
  };
  /** The stair aisle down a tier: a white nosing on every step, a handrail either side on posts. */
  const aisle = (rows: number, rise: number, step: number, z0: number, y0: number) => {
    for (let r = 0; r < rows; r++) b.box(AISLE * 2, .05, .08, trim, 0, y0 + r * rise + .03, z0 + r * step - step / 2 + .05, frame);
    const tilt = -Math.atan2(rise, step), length = Math.hypot((rows - 1) * step, (rows - 1) * rise) + .4;
    const midY = y0 + (rows - 1) * rise / 2 + .85, midZ = z0 + (rows - 1) * step / 2;
    for (const x of [-AISLE - .04, AISLE + .04]) {
      b.box(.045, .045, length, steel, x, midY, midZ, frame, tilt);
      for (let r = 0; r < rows; r += 2) b.box(.04, .85, .04, steel, x, y0 + r * rise + .42, z0 + r * step, frame);
    }
  };

  // The lower tier.
  for (let r = 0; r < LOW.rows; r++) {
    const top = LOW.y + r * LOW.rise, z = LOW.z + r * LOW.step;
    b.box(width(z), top, LOW.step, concrete, 0, top / 2, z, frame);
    row(top, z);
  }
  aisle(LOW.rows, LOW.rise, LOW.step, LOW.z, LOW.y);
  // Behind its last row the concourse, a band of warm light under the deck.
  const last = LOW.y + (LOW.rows - 1) * LOW.rise, behind = LOW.z + LOW.rows * LOW.step;
  b.box(width(behind), last, 1.4, concrete, 0, last / 2, behind + .2, frame);
  b.box(width(behind + 1), DECK.y - last + .1, .3, wall, 0, (DECK.y + last) / 2, behind + .9, frame);

  // The deck over it: its lit underside, a lamp in it every couple of metres,
  // the white fascia along its front and the glass on that.
  const deckDepth = behind + 1.1 - DECK.z;
  b.box(width(DECK.z + deckDepth / 2), .22, deckDepth, soffit, 0, DECK.y + .11, DECK.z + deckDepth / 2, frame);
  const w = width(DECK.z);
  for (let x = -w / 2 + .8; x < w / 2 - .4; x += 1.6) {
    if (Math.abs(x) < AISLE) continue;
    for (const z of [DECK.z + .9, DECK.z + 2.2]) {
      b.box(.34, .06, .34, STADIUM.lamp, x, DECK.y - .02, z, frame);
      spots.push(new THREE.Vector3(x, DECK.y - .15, z).applyMatrix4(frame));
    }
  }
  b.box(w, DECK.fascia, .22, trim, 0, DECK.y + DECK.fascia / 2, DECK.z, frame);
  b.box(w, DECK.glass, .05, glass, 0, DECK.y + DECK.fascia + DECK.glass / 2, DECK.z + .08, frame);
  b.box(w, .06, .1, trim, 0, DECK.y + DECK.fascia + DECK.glass, DECK.z + .08, frame);

  // The upper tier, from the deck back to the wall.
  for (let r = 0; r < UP.rows; r++) {
    const y = UP.y + r * UP.rise, z = UP.z + r * UP.step;
    b.box(width(z), y - DECK.y, UP.step, concrete, 0, (y + DECK.y) / 2, z, frame);
    row(y, z);
  }
  aisle(UP.rows, UP.rise, UP.step, UP.z, UP.y);
  b.box(width(BACK), WALL_TOP, .4, concrete, 0, WALL_TOP / 2, BACK + .2, frame);
  b.box(width(BACK), .12, .5, trim, 0, WALL_TOP, BACK + .2, frame);
}

/**
 * The block over the far end: the players' level in dark glass behind the
 * sightscreen; two hospitality floors, each a white slab, a glass front on
 * white mullions, two rows of people, a warm back wall and lamps in the
 * ceiling; the big screen on the roof in a dark frame with a white edge, and
 * a flag over either corner. It stands in the one section of the ring
 * straight behind the bowler, as wide as it is.
 */
function block(b: Batch, seat: SeatFn, spots: THREE.Vector3[]) {
  const { trim, dark, glass, concrete, wall, frame: box, flag } = CANOPY;
  const at = new THREE.Matrix4().makeTranslation(0, 0, BLOCK.z);
  const W = BLOCK.width, deep = 7;
  b.box(W, BLOCK.floor1, deep, dark, 0, BLOCK.floor1 / 2, deep / 2, at);
  for (const [floor, ceiling, back] of [[BLOCK.floor1, BLOCK.floor2, 0], [BLOCK.floor2, BLOCK.roof, .5]] as const) {
    b.box(W + .3, .26, deep, trim, 0, floor, deep / 2, at);
    // Two rows of people, the second raised a step, and the back wall lit warm.
    for (const [r, z] of [[0, back + 1.1], [1, back + 2.1]] as const) {
      if (r) b.box(W - .4, .3, 1, concrete, 0, floor + .28, z, at);
      for (let x = -W / 2 + .6; x <= W / 2 - .6; x += SEAT) seat(at, x, floor + .13 + r * .3 + .3, z, shirt());
    }
    b.box(W - .2, ceiling - floor, .3, wall, 0, (floor + ceiling) / 2, back + 3.2, at);
    b.box(W + .3, .3, deep, trim, 0, ceiling - .02, deep / 2, at);
    // The glass front on white mullions, a rail along it.
    b.box(W - .2, .9, .05, glass, 0, floor + .58, back + .12, at);
    b.box(W - .2, .07, .1, trim, 0, floor + 1.05, back + .12, at);
    for (let x = -W / 2 + .1; x <= W / 2; x += 1.62) b.box(.1, ceiling - floor, .12, trim, x, (floor + ceiling) / 2, back + .08, at);
    for (let x = -W / 2 + .9; x < W / 2; x += 1.62) {
      b.box(.34, .06, .34, STADIUM.lamp, x, ceiling - .19, back + 1.4, at);
      spots.push(new THREE.Vector3(x, ceiling - .3, back + 1.4).applyMatrix4(at));
    }
  }
  // The screen's box on the roof, its white edge, and the flags.
  const middle = SCREEN.bottom + SCREEN.height / 2, z = 1.75;
  b.box(SCREEN.width + .6, SCREEN.height + .6, .7, box, 0, middle, z + .45, at);
  b.box(SCREEN.width + .8, .16, .8, trim, 0, SCREEN.bottom + SCREEN.height + .38, z + .45, at);
  b.box(SCREEN.width + .8, .16, .8, trim, 0, SCREEN.bottom - .38, z + .45, at);
  for (const s of [-1, 1]) {
    b.box(.16, SCREEN.height + .9, .8, trim, s * (SCREEN.width / 2 + .38), middle, z + .45, at);
    b.box(.5, SCREEN.bottom - BLOCK.roof, .5, box, s * (SCREEN.width / 2 - 1), (SCREEN.bottom + BLOCK.roof) / 2, z + .6, at);
    const top = SCREEN.bottom + SCREEN.height + .45;
    b.post(.045, 2.2, trim, s * (SCREEN.width / 2 + .1), top + 1.1, z + .45, at);
    b.box(.95, .6, .04, flag, s * (SCREEN.width / 2 + .1) + .5, top + 1.85, z + .45, at);
  }
}

/** The columns the canopies stand on, behind every section, and a tie from each to the top of the stand. */
function columns(b: Batch) {
  const { steel } = CANOPY;
  for (let section = 1; section < SECTIONS; section++) {
    const a = (section + .5) / SECTIONS * Math.PI * 2;
    const at = (r: number, y: number) => new THREE.Vector3(Math.sin(a) * r, y, CENTRE_Z + Math.cos(a) * r);
    const foot = at(ROOF.back - .4, 0);
    const top = ROOF.backY + .6;
    b.add(new THREE.CylinderGeometry(.22, .32, top, 8).translate(foot.x, top / 2, foot.z), steel);
    const from = at(RING + BACK + .4, WALL_TOP), to = at(ROOF.back - .4, WALL_TOP);
    const mid = from.clone().add(to).multiplyScalar(.5);
    b.add(new THREE.BoxGeometry(.14, .14, from.distanceTo(to)).lookAt(to.clone().sub(from)).translate(mid.x, mid.y, mid.z), steel);
  }
}

/**
 * The two canopies, one geometry each for their white tops, their lit
 * undersides and the white rim along their front edges. Laid out round the
 * ground from the lifted tip to behind the batter; near the tip the front
 * edge draws back towards the columns and rises, so the tip is a narrow wing
 * high beside the screen with the trees showing under it.
 */
function canopies(spots: THREE.Vector3[]) {
  const U = 120, V = 6;
  const tops: THREE.BufferGeometry[] = [], unders: THREE.BufferGeometry[] = [], rims: THREE.BufferGeometry[] = [];
  const edge = (side: number, u: number) => {
    const a = side * THREE.MathUtils.lerp(ROOF.from, ROOF.to, u / U);
    const f = THREE.MathUtils.smoothstep(Math.abs(a) - ROOF.from, 0, ROOF.tip);
    const front = THREE.MathUtils.lerp(ROOF.back - 1.2, ROOF.front, f);
    const low = ROOF.frontY + (1 - f) * ROOF.lift;
    return { a, front, low, f };
  };
  const point = (a: number, r: number, y: number) => new THREE.Vector3(Math.sin(a) * r, y, CENTRE_Z + Math.cos(a) * r);
  for (const side of [-1, 1]) {
    const under: number[] = [], top: number[] = [], uv: number[] = [], rim: number[] = [], rimUv: number[] = [];
    for (let u = 0; u <= U; u++) {
      const { a, front, low } = edge(side, u);
      for (let v = 0; v <= V; v++) {
        const t = v / V, r = THREE.MathUtils.lerp(front, ROOF.back, t);
        // A shell: rising to the back, with a gentle belly between.
        const y = THREE.MathUtils.lerp(low, ROOF.backY, t) + .5 * Math.sin(Math.PI * t);
        under.push(...point(a, r, y).toArray());
        top.push(...point(a, r, y + .5 - .2 * t).toArray());
        uv.push(Math.abs(a) * RING / 4, (r - ROOF.front) / 4);
      }
      for (const [dy, dr] of [[-.6, -.02], [.4, -.08]]) {
        rim.push(...point(a, front + dr, low + dy).toArray());
        rimUv.push(u / U, dy > 0 ? 1 : 0);
      }
      // Downlights under it, two rows across its depth.
      if (u % 2 === 0 && edge(side, u).f > .3) for (const t of [.2, .45, .7]) {
        const r = THREE.MathUtils.lerp(front, ROOF.back, t);
        spots.push(point(a, r, THREE.MathUtils.lerp(low, ROOF.backY, t) + .5 * Math.sin(Math.PI * t) - .12));
      }
    }
    const grid = (positions: number[], uvs: number[], columns: number) => {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
      const index: number[] = [];
      for (let u = 0; u < U; u++) for (let v = 0; v < columns - 1; v++) {
        const i = u * columns + v, j = i + columns;
        index.push(i, j, i + 1, i + 1, j, j + 1);
      }
      geometry.setIndex(index);
      geometry.computeVertexNormals();
      return geometry;
    };
    unders.push(grid(under, uv, V + 1));
    tops.push(grid(top, uv, V + 1));
    rims.push(grid(rim, rimUv, 2));
  }
  const panels = panelTexture(), glow = panelGlow();
  for (const texture of [panels, glow]) { texture.wrapS = texture.wrapT = THREE.RepeatWrapping; }
  const under = new THREE.MeshStandardMaterial({ color: 0xc6c2d4, map: panels, roughness: .8, side: THREE.DoubleSide, emissive: 0xfff0d8, emissiveMap: glow, emissiveIntensity: 0 });
  // The downlights are on by day too, as they are under any covered stand, only less to see.
  under.userData.day = .55;
  const merged = (list: THREE.BufferGeometry[]) => { const geometry = mergeGeometries(list); list.forEach(g => g.dispose()); return geometry; };
  const meshes = [
    new THREE.Mesh(merged(tops), new THREE.MeshStandardMaterial({ color: 0xeef0ec, roughness: .55, side: THREE.DoubleSide })),
    new THREE.Mesh(merged(unders), under),
    new THREE.Mesh(merged(rims), new THREE.MeshStandardMaterial({ color: CANOPY.trim, roughness: .5, side: THREE.DoubleSide })),
  ];
  meshes.forEach((mesh, i) => { mesh.name = ['Canopy', 'Canopy underside', 'Canopy rim'][i]; mesh.receiveShadow = true; });
  return { meshes, under, textures: [panels, glow] };
}

/** The canopy's underside by day: pale panels with their seams and a downlight in each. */
function panelTexture() {
  const S = 128, canvas = document.createElement('canvas'); canvas.width = canvas.height = S;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#f2f1ee'; ctx.fillRect(0, 0, S, S);
  ctx.fillStyle = '#c9c7c2'; ctx.fillRect(0, 0, S, 3); ctx.fillRect(0, 0, 3, S);
  ctx.fillStyle = '#e4e2dc'; ctx.fillRect(0, S / 2 - 1, S, 2);
  for (const [x, y] of [[S / 4, S / 4], [S * 3 / 4, S * 3 / 4]]) {
    ctx.fillStyle = '#b8b5ae'; ctx.beginPath(); ctx.arc(x, y, 7, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fffaf0'; ctx.beginPath(); ctx.arc(x, y, 4.5, 0, Math.PI * 2); ctx.fill();
  }
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
/** And by night: the downlights burning and a soft wash round each on the panels. */
function panelGlow() {
  const S = 128, canvas = document.createElement('canvas'); canvas.width = canvas.height = S;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#3a342c'; ctx.fillRect(0, 0, S, S);
  for (const [x, y] of [[S / 4, S / 4], [S * 3 / 4, S * 3 / 4]]) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, 44);
    g.addColorStop(0, '#ffffff'); g.addColorStop(.12, '#fff6e4'); g.addColorStop(.4, '#a8977c'); g.addColorStop(1, 'rgba(58,52,44,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, 44, 0, Math.PI * 2); ctx.fill();
  }
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/**
 * The big screen's face: the game's mark on a deep blue, a crown over
 * HITMAN and CRICKET, and slashes of teal and green racing in from either
 * side. Hung in the scene rather than the mirrored stage, so it reads the
 * right way round for either hand, and lit by itself, day and night.
 */
function bigScreen() {
  const W = 1024, H = Math.round(W * SCREEN.height / SCREEN.width);
  const canvas = document.createElement('canvas'); canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  const ground = ctx.createLinearGradient(0, 0, 0, H);
  ground.addColorStop(0, '#13305e'); ground.addColorStop(1, '#0a1b3a');
  ctx.fillStyle = ground; ctx.fillRect(0, 0, W, H);
  // The slashes: parallelograms leaning in from the edges, teal to green.
  const random = seeded(17);
  for (const side of [-1, 1]) {
    for (let i = 0; i < 14; i++) {
      const x0 = side < 0 ? random() * W * .26 : W - random() * W * .26;
      const w = 8 + random() * 26, h = H * (.35 + random() * .7), y0 = random() * H - h * .3;
      const g = ctx.createLinearGradient(x0, y0, x0, y0 + h);
      const hue = random() < .5 ? ['rgba(31,209,178,', 'rgba(67,224,122,'] : ['rgba(67,224,122,', 'rgba(26,160,214,'];
      g.addColorStop(0, `${hue[0]}0)`); g.addColorStop(.5, `${hue[0]}${.55 + random() * .4})`); g.addColorStop(1, `${hue[1]}0)`);
      ctx.fillStyle = g;
      const lean = h * .45 * side;
      ctx.beginPath(); ctx.moveTo(x0, y0 + h); ctx.lineTo(x0 + w, y0 + h); ctx.lineTo(x0 + w - lean, y0); ctx.lineTo(x0 - lean, y0); ctx.closePath(); ctx.fill();
    }
  }
  // The crown, outlined, and the name under it.
  ctx.save(); ctx.translate(W / 2, H * .3); ctx.scale(3.3, 3.3);
  ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2.4; ctx.lineJoin = 'round';
  ctx.beginPath(); ctx.moveTo(-14, 7.5); ctx.lineTo(-11, -4.5); ctx.lineTo(-5, 2.5); ctx.lineTo(0, -6.5); ctx.lineTo(5, 2.5); ctx.lineTo(11, -4.5); ctx.lineTo(14, 7.5); ctx.closePath(); ctx.stroke();
  ctx.restore();
  ctx.fillStyle = '#ffffff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = '900 92px "Arial Black", "Helvetica Neue", Arial, sans-serif';
  ctx.fillText('HITMAN', W / 2, H * .58);
  ctx.font = '600 70px "Helvetica Neue", Arial, sans-serif';
  ctx.fillText('CRICKET', W / 2, H * .8);
  // The screen's pixels: a fine dark grid.
  ctx.fillStyle = 'rgba(0,0,0,.18)';
  for (let x = 0; x < W; x += 4) ctx.fillRect(x, 0, 1, H);
  for (let y = 0; y < H; y += 4) ctx.fillRect(0, y, W, 1);
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = 4;
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(SCREEN.width, SCREEN.height).rotateY(Math.PI),
    new THREE.MeshBasicMaterial({ map: texture, toneMapped: false, fog: false }));
  mesh.position.set(0, SCREEN.bottom + SCREEN.height / 2, BLOCK.z + 1.75 + .08);
  mesh.name = 'Big screen';
  return { mesh, texture };
}

/**
 * The floodlights: a white mast and a square head of round lamps, five by
 * four, in a white frame, turned to the middle and tipped down at it. The far
 * pair stand over the canopies at the top corners of a phone's picture.
 */
function towers(b: Batch, lights: StadiumLights) {
  const { mast, head: housing } = CANOPY;
  const centre = new THREE.Vector3(0, 0, CENTRE_Z);
  for (const [x, z] of TOWERS) {
    const at = new THREE.Vector3(x, 0, z);
    const yaw = Math.atan2(at.x - centre.x, at.z - centre.z);
    const frame = new THREE.Matrix4().compose(at, new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw), new THREE.Vector3(1, 1, 1));
    b.add(new THREE.CylinderGeometry(.3, .6, MAST, 8).translate(0, MAST / 2, 0), mast, frame);
    // A platform under the head, and the head on it.
    b.box(5.4, .25, 1.6, mast, 0, MAST + .1, -.2, frame);
    const head = new THREE.Matrix4().multiplyMatrices(frame, new THREE.Matrix4().compose(
      new THREE.Vector3(0, MAST + 2.6, -.5), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), .3), new THREE.Vector3(1, 1, 1)));
    b.box(5.2, 4.3, .45, housing, 0, 0, 0, head);
    for (const y of [-2.2, 2.2]) b.box(5.6, .22, .6, mast, 0, y, 0, head);
    for (const x of [-2.7, 2.7]) b.box(.22, 4.6, .6, mast, x, 0, 0, head);
    for (let r = 0; r < 4; r++) for (let c = 0; c < 5; c++) {
      b.add(new THREE.CircleGeometry(.42, 16).rotateY(Math.PI).translate(-1.96 + c * .98, -1.47 + r * .98, -.25), STADIUM.lamp, head);
    }
    lights.towers.push(new THREE.Vector3(0, 0, -.9).applyMatrix4(head));
  }
}

/** Trees behind the far end and its corners, standing up between the stands and the canopies. */
function trees(b: Batch) {
  const random = seeded(23);
  for (let i = 0; i < 46; i++) {
    const angle = (random() * 2 - 1) * 1.1, radius = RING + 16 + random() * 10;
    const r = 2.6 + random() * 2.2;
    const x = Math.sin(angle) * radius, z = CENTRE_Z + Math.cos(angle) * radius;
    b.add(new THREE.IcosahedronGeometry(r, 1).scale(1, .92, 1).translate(x, 8.5 + random() * 3, z), random() < .5 ? CANOPY.leaf : CANOPY.leafLight);
  }
}
