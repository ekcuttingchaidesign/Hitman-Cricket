import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Batch } from './build';
import { CENTRE_Z, RING, SECTIONS, STADIUM, span, stadium, type BigScreen, type SeatFn, type StadiumLights } from './stadium';
import { seeded } from './turf';
import { skyline } from './arena';

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
  /** Glass balustrades: see-through, `glass` in `canopyStands`. */
  glass: 0x86a0b0,
  /** The downlights in the soffits and the hospitality ceilings: grey fittings by day, lit at night. */
  light: 0xd8d5ce,
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
 * The canopies: a shell either side of the screen, as the reference has
 * them. In section each is an arc in the plane through the middle of the
 * ground: from its bottom edge over the front of the upper tier it climbs
 * back and up, stands furthest back at mid height and curls forward again to
 * a lip at the top, so its concave face — the lit inside — looks straight
 * down the ground at the camera and is most of what a phone sees of it.
 * Along the ring it is a petal: closed to a point low beside the screen,
 * growing to its full size by the edge of a phone's picture (`peakAt`) and
 * holding that round to behind the batter, its bottom edge easing down a
 * little as it grows (`drop`). A level roof along the ring, tilted or swept,
 * read as two planks from the crease: the camera sees a roof's underside
 * only edge on, and a shell stood up on end is the one shape that shows it
 * face on.
 */
const DEG = Math.PI / 180;
const SHELL = {
  from: .13, to: Math.PI - .03, peakAt: .52,
  /** The bottom edge: its radius from the middle of the ground, its height at the tip, and how far it eases down by the peak. */
  r: RING + 2.5, y: 10.9, drop: 1.1,
  /** The arc at full size: its radius, and where on it the bottom edge and the lip stand (nought is its furthest back). */
  radius: 5, bottom: -60 * DEG, top: 50 * DEG,
  /** The skin's thickness, and the lit rim along each edge of the inside. */
  thick: .35, rim: .55,
} as const;
/** The shell `angle` off straight: how grown it is, its arc's radius and the arc's centre, in the plane through the middle. */
export function shellAt(angle: number) {
  const s = THREE.MathUtils.smoothstep(Math.abs(angle), SHELL.from, SHELL.peakAt);
  const R = SHELL.radius * Math.max(s, .02);
  const bottom = { r: SHELL.r, y: SHELL.y - SHELL.drop * s };
  return { s, R, centre: { r: bottom.r - R * Math.cos(SHELL.bottom), y: bottom.y - R * Math.sin(SHELL.bottom) } };
}

/** The far end's block, straight across behind the sightscreen. */
const BLOCK = { z: CENTRE_Z + RING - 1.7, width: 9.8, floor1: 3.3, floor2: 5.6, roof: 7.9 } as const;
/** The screen on the block's roof: its face, and the frame round it. */
const SCREEN = { width: 9.2, height: 3.5, bottom: 8.35 } as const;

/** The towers: over the far corners, standing above the canopies, and a pair out of shot behind the batter. */
const TOWERS = [[-21, 70], [21, 70], [-25, -46], [25, -46]] as const;
const MAST = 22;

export function canopyStands(world: THREE.Object3D): StadiumLights {
  const warm = {
    wall: new THREE.MeshStandardMaterial({ color: CANOPY.wall, roughness: .9, emissive: 0xffd49a, emissiveIntensity: 0 }),
    soffit: new THREE.MeshStandardMaterial({ color: CANOPY.soffit, roughness: .85, emissive: 0x9c8466, emissiveIntensity: 0 }),
    // Not the stadium's lamps, which glow a little by day: these are off until the floodlights are on.
    light: new THREE.MeshStandardMaterial({ color: CANOPY.light, roughness: .4, emissive: 0xfff6e6, emissiveIntensity: 0 }),
  };
  const spots: THREE.Vector3[] = [];
  // Glass that can be seen through: the boxes' balustrade and the decks', with the people behind them showing.
  const glass = new THREE.MeshStandardMaterial({ color: 0xcfe0ea, roughness: .15, metalness: .1, transparent: true, opacity: .3, depthWrite: false });
  const lights = stadium(world, {
    commentary: false, towers: false, roofLamps: false, crowd: CROWD,
    section: (b, seat, frame) => tiers(b, seat, frame, span, spots),
    end: {
      skip: section => section === 0,
      build: (b, seat, l) => {
        b.finish(CANOPY.wall, warm.wall); b.finish(CANOPY.soffit, warm.soffit); b.finish(CANOPY.light, warm.light); b.finish(CANOPY.glass, glass);
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
  // The arena's city behind it, after dark only: by day the trees and the sky are what is behind the stands.
  const city = skyline(4); city.mesh.userData.nightOnly = true;
  lights.spots = spots;
  lights.warm = [warm.wall, warm.soffit, warm.light, roof.under];
  lights.unmirrored = [screen.mesh, city.mesh];
  lights.textures = [...roof.textures, screen.texture, city.texture];
  // The brand paints the screen: its mark and the score between moments, its stings in them (`Showboards` in `arena.ts`).
  lights.screen = screen.screen;
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
      b.box(.34, .06, .34, CANOPY.light, x, DECK.y - .02, z, frame);
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
 * sightscreen; two hospitality floors — the VIP boxes — each a white slab
 * with a warm back wall and lamps along its ceiling, and two rows of people
 * standing at its front, raised so they show from the chest up over it: the
 * upper box behind a glass balustrade on white mullions, the lower behind a
 * solid parapet, as the reference has them (the first build sat them behind
 * panes drawn solid, and nobody was seen in either); the big screen on the
 * roof in a dark frame with a white edge, and a flag over either corner. It
 * stands in the one section of the ring straight behind the bowler, as wide
 * as it is.
 */
function block(b: Batch, seat: SeatFn, spots: THREE.Vector3[]) {
  const { trim, dark, glass, concrete, wall, frame: box, flag } = CANOPY;
  const at = new THREE.Matrix4().makeTranslation(0, 0, BLOCK.z);
  const W = BLOCK.width, deep = 7;
  b.box(W, BLOCK.floor1, deep, dark, 0, BLOCK.floor1 / 2, deep / 2, at);
  for (const [floor, ceiling, back, glazed] of [[BLOCK.floor1, BLOCK.floor2, 0, false], [BLOCK.floor2, BLOCK.roof, .5, true]] as const) {
    b.box(W + .3, .26, deep, trim, 0, floor, deep / 2, at);
    // Two rows on their feet, the front at the rail and the second a step up behind, close packed.
    for (const [z, up] of [[back + .8, .7], [back + 1.65, 1.1]] as const) {
      b.box(W - .4, up, .85, concrete, 0, floor + up / 2, z, at);
      for (let x = -W / 2 + .5; x <= W / 2 - .5; x += .5) seat(at, x, floor + up + .3, z, shirt());
    }
    b.box(W - .2, ceiling - floor, .3, wall, 0, (floor + ceiling) / 2, back + 3.2, at);
    b.box(W + .3, .3, deep, trim, 0, ceiling - .02, deep / 2, at);
    // The front: glass or a parapet, a rail along the top, and white mullions the floor's height.
    b.box(W - .2, 1.0, glazed ? .05 : .25, glazed ? glass : trim, 0, floor + .63, back + .12, at);
    b.box(W - .2, .07, .12, trim, 0, floor + 1.15, back + .12, at);
    for (let x = -W / 2 + .1; x <= W / 2; x += 1.62) b.box(.1, ceiling - floor, .12, trim, x, (floor + ceiling) / 2, back + .08, at);
    // The lamps along the back of the ceiling, lighting the wall behind the people.
    for (let x = -W / 2 + .9; x < W / 2; x += 1.62) {
      b.box(.34, .06, .34, CANOPY.light, x, ceiling - .19, back + 2.7, at);
      spots.push(new THREE.Vector3(x, ceiling - .3, back + 2.7).applyMatrix4(at));
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

/**
 * What holds a shell up: behind every section where it is grown, a column
 * behind the stand's back wall and a beam from its top forward to the
 * shell's back, a goalpost the camera sees nothing of but through the gaps
 * at the tips.
 */
function columns(b: Batch) {
  const { steel } = CANOPY;
  for (let section = 1; section < SECTIONS; section++) {
    const a = (section + .5) / SECTIONS * Math.PI * 2, signed = a > Math.PI ? a - Math.PI * 2 : a;
    const { s, R, centre } = shellAt(signed);
    if (s < .5) continue;
    const at = (r: number, y: number) => new THREE.Vector3(Math.sin(a) * r, y, CENTRE_Z + Math.cos(a) * r);
    const foot = at(RING + BACK + 1.2, 0), top = centre.y + .4;
    b.add(new THREE.CylinderGeometry(.22, .32, top, 8).translate(foot.x, top / 2, foot.z), steel);
    const from = at(RING + BACK + 1.2, top - .1), to = at(centre.r + R - .2, centre.y);
    const mid = from.clone().add(to).multiplyScalar(.5);
    b.add(new THREE.BoxGeometry(.16, .16, from.distanceTo(to)).lookAt(to.clone().sub(from)).translate(mid.x, mid.y, mid.z), steel);
  }
}

/**
 * The two shells, one geometry each for their lit insides, their white
 * outer skins and the white rims along their edges, laid out round the
 * ground by `shellAt`: at each step round, the arc from the bottom edge to
 * the lip, in `V` pieces.
 */
function canopies(spots: THREE.Vector3[]) {
  const U = 120, V = 10;
  const insides: THREE.BufferGeometry[] = [], skins: THREE.BufferGeometry[] = [], rims: THREE.BufferGeometry[] = [];
  const point = (a: number, r: number, y: number) => new THREE.Vector3(Math.sin(a) * r, y, CENTRE_Z + Math.cos(a) * r);
  /** A point on the arc at `angle`, `theta` round it, moved `off` along the arc's inward normal (towards the ground). */
  const on = (angle: number, theta: number, off: number) => {
    const { R, centre } = shellAt(angle);
    return point(angle, centre.r + (R - off) * Math.cos(theta), centre.y + (R - off) * Math.sin(theta));
  };
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
  for (const side of [-1, 1]) {
    const inside: number[] = [], skin: number[] = [], uv: number[] = [];
    const bands: { xyz: number[]; uv: number[] }[] = [{ xyz: [], uv: [] }, { xyz: [], uv: [] }, { xyz: [], uv: [] }, { xyz: [], uv: [] }];
    for (let u = 0; u <= U; u++) {
      const a = side * THREE.MathUtils.lerp(SHELL.from, SHELL.to, u / U);
      const { s, R } = shellAt(a);
      for (let v = 0; v <= V; v++) {
        const theta = THREE.MathUtils.lerp(SHELL.bottom, SHELL.top, v / V);
        inside.push(...on(a, theta, 0).toArray());
        skin.push(...on(a, theta, -SHELL.thick).toArray());
        uv.push(Math.abs(a) * SHELL.r / 4, (theta - SHELL.bottom) * SHELL.radius / 4);
      }
      // The rims: a band along each edge of the inside, and the skin's thickness closed at each edge.
      const width = Math.min(12 * DEG, SHELL.rim / R);
      for (const [edge, sign, band, closer] of [[SHELL.bottom, 1, bands[0], bands[1]], [SHELL.top, -1, bands[2], bands[3]]] as const) {
        band.xyz.push(...on(a, edge, .03).toArray(), ...on(a, edge + sign * width, .03).toArray());
        band.uv.push(u / U, 0, u / U, 1);
        closer.xyz.push(...on(a, edge, .01).toArray(), ...on(a, edge, -SHELL.thick - .01).toArray());
        closer.uv.push(u / U, 0, u / U, 1);
      }
      // Downlights across the inside, where the shell is grown enough to hold them.
      if (u % 2 === 0 && s > .3) for (const t of [.25, .5, .75]) spots.push(on(a, THREE.MathUtils.lerp(SHELL.bottom, SHELL.top, t), .12));
    }
    insides.push(grid(inside, uv, V + 1));
    skins.push(grid(skin, uv, V + 1));
    for (const band of bands) rims.push(grid(band.xyz, band.uv, 2));
  }
  const panels = panelTexture(), glow = panelGlow();
  for (const texture of [panels, glow]) { texture.wrapS = texture.wrapT = THREE.RepeatWrapping; }
  // Stood up to face the ground, the inside takes the sky's light, not the grass's: a plain cream, no tint against the green.
  const under = new THREE.MeshStandardMaterial({ color: 0xe9e2d6, map: panels, roughness: .8, envMapIntensity: .5, side: THREE.DoubleSide, emissive: 0xfff0d8, emissiveMap: glow, emissiveIntensity: 0 });
  const merged = (list: THREE.BufferGeometry[]) => { const geometry = mergeGeometries(list); list.forEach(g => g.dispose()); return geometry; };
  const meshes = [
    new THREE.Mesh(merged(skins), new THREE.MeshStandardMaterial({ color: 0xeef0ec, roughness: .55, side: THREE.DoubleSide })),
    new THREE.Mesh(merged(insides), under),
    new THREE.Mesh(merged(rims), new THREE.MeshStandardMaterial({ color: CANOPY.trim, roughness: .5, side: THREE.DoubleSide })),
  ];
  meshes.forEach((mesh, i) => { mesh.name = ['Canopy', 'Canopy underside', 'Canopy rim'][i]; mesh.receiveShadow = true; });
  return { meshes, under, textures: [panels, glow] };
}

/** The canopy's underside by day: pale panels with their seams and a downlight in each, off: a grey fitting. */
function panelTexture() {
  const S = 128, canvas = document.createElement('canvas'); canvas.width = canvas.height = S;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#f2f1ee'; ctx.fillRect(0, 0, S, S);
  ctx.fillStyle = '#c9c7c2'; ctx.fillRect(0, 0, S, 3); ctx.fillRect(0, 0, 3, S);
  ctx.fillStyle = '#e4e2dc'; ctx.fillRect(0, S / 2 - 1, S, 2);
  for (const [x, y] of [[S / 4, S / 4], [S * 3 / 4, S * 3 / 4]]) {
    ctx.fillStyle = '#b8b5ae'; ctx.beginPath(); ctx.arc(x, y, 7, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#d6d3cc'; ctx.beginPath(); ctx.arc(x, y, 4.5, 0, Math.PI * 2); ctx.fill();
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
 * The big screen, painted by the brand (`Showboards` in `arena.ts`): the
 * Super10 mark and the score in its lettering between moments, its stings
 * and words in them. Hung in the scene rather than the mirrored stage, so it
 * reads the right way round for either hand, and lit by itself, day and
 * night. It carried HITMAN CRICKET under a crown before, which said nothing
 * about the game being played under it.
 */
function bigScreen() {
  // Half of what the screen is drawn at (`Showboards`): on a phone it stands about 130 points across, and
  // every frame of a sting this picture goes to the GPU again, which at 1024 cost an iPhone its frame rate.
  const W = 512, H = Math.round(W * SCREEN.height / SCREEN.width);
  const canvas = document.createElement('canvas'); canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = 4;
  // And with no mipmaps to rebuild each time it goes.
  texture.generateMipmaps = false; texture.minFilter = THREE.LinearFilter;
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(SCREEN.width, SCREEN.height).rotateY(Math.PI),
    new THREE.MeshBasicMaterial({ map: texture, toneMapped: false, fog: false }));
  mesh.position.set(0, SCREEN.bottom + SCREEN.height / 2, BLOCK.z + 1.75 + .08);
  mesh.name = 'Big screen';
  const screen: BigScreen = { context: ctx, texture };
  return { mesh, texture, screen };
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
