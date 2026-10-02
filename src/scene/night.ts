import * as THREE from 'three';
import { seeded } from './turf';
import type { SkyTime } from './sky';

/**
 * The ground after dark: the light that falls on it, the moon over it, and
 * the glow round every lamp.
 *
 * Night is the Blast's — a Test is played by day — and it is the same
 * stadium, lit differently: the sun becomes the floodlights, coming down
 * from behind the batter's end so he is lit from the side the camera sees,
 * with a second, cooler light from the towers at the far end catching his
 * edges; the sky goes to a deep blue with stars and a full moon; the lamps
 * burn, and each carries a glow; the boards along the rope light up the way
 * LED boards do at a night game.
 */

/** How the scene's lights stand, by day and by night. */
export const LIGHTING: Record<SkyTime, {
  hemisphere: { sky: number; ground: number; intensity: number };
  key: { colour: number; intensity: number; position: [number, number, number] };
  fill: { colour: number; intensity: number };
  environment: number;
  boards: number;
  lamps: number;
}> = {
  day: {
    hemisphere: { sky: 0xfff4e2, ground: 0x66744a, intensity: 1.1 },
    key: { colour: 0xffedce, intensity: 3.2, position: [-15, 30, -8] },
    fill: { colour: 0xdfe8ff, intensity: 0 },
    environment: 0.75,
    boards: 0.35,
    lamps: 0.9,
  },
  night: {
    // What little the sky gives, cool; the grass throws back the floodlights.
    hemisphere: { sky: 0x8296c0, ground: 0x34502c, intensity: 0.75 },
    // The floodlights behind the batter's end: high, warm-white, and the one that casts.
    key: { colour: 0xfff3e2, intensity: 3.4, position: [-12, 34, -30] },
    // The far towers, catching the batter's edges from the other side.
    fill: { colour: 0xe4ecff, intensity: 1.1 },
    environment: 0.5,
    boards: 1,
    lamps: 2.6,
  },
};

/** Where the fill light comes from: the far towers. */
export const FILL_POSITION: [number, number, number] = [14, 28, 60];

/**
 * The moon: full, low over the far end and to one side of the commentary box,
 * in the stretch of sky a phone held upright actually shows — between the
 * roofline and the score bar, inside the floodlight towers.
 */
const MOON = { azimuth: 10.5, elevation: 10.8, distance: 150, size: 9 } as const;

function moonTexture() {
  const S = 256;
  const canvas = document.createElement('canvas'); canvas.width = S; canvas.height = S;
  const ctx = canvas.getContext('2d')!;
  const c = S / 2, r = S * 0.22;
  // The halo, then the disc.
  const halo = ctx.createRadialGradient(c, c, r * 0.9, c, c, c);
  halo.addColorStop(0, 'rgba(225,232,255,0.42)');
  halo.addColorStop(0.35, 'rgba(200,214,255,0.12)');
  halo.addColorStop(1, 'rgba(200,214,255,0)');
  ctx.fillStyle = halo; ctx.fillRect(0, 0, S, S);
  const disc = ctx.createRadialGradient(c - r * 0.25, c - r * 0.25, r * 0.1, c, c, r);
  disc.addColorStop(0, '#fbf8ee'); disc.addColorStop(1, '#e6e1d0');
  ctx.fillStyle = disc; ctx.beginPath(); ctx.arc(c, c, r, 0, Math.PI * 2); ctx.fill();
  // The seas: soft grey patches, the same every night.
  ctx.save(); ctx.beginPath(); ctx.arc(c, c, r, 0, Math.PI * 2); ctx.clip();
  const random = seeded(19);
  for (let i = 0; i < 9; i++) {
    const x = c + (random() - 0.5) * r * 1.3, y = c + (random() - 0.55) * r * 1.2, size = r * (0.12 + random() * 0.22);
    const sea = ctx.createRadialGradient(x, y, 0, x, y, size);
    sea.addColorStop(0, 'rgba(150,150,140,0.38)'); sea.addColorStop(1, 'rgba(150,150,140,0)');
    ctx.fillStyle = sea; ctx.beginPath(); ctx.arc(x, y, size, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** The moon, placed relative to where the camera stands. Hidden by day. */
export function moon(camera: THREE.Vector3) {
  const texture = moonTexture();
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, fog: false, depthWrite: false, transparent: true, toneMapped: false }));
  const az = THREE.MathUtils.degToRad(MOON.azimuth), el = THREE.MathUtils.degToRad(MOON.elevation);
  // +x is the left of the screen: the stage is mirrored, the scene is not.
  sprite.position.set(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)).multiplyScalar(MOON.distance).add(camera);
  sprite.scale.setScalar(MOON.size / 0.44);
  sprite.visible = false;
  return { sprite, texture };
}

function glowTexture() {
  const S = 64;
  const canvas = document.createElement('canvas'); canvas.width = S; canvas.height = S;
  const ctx = canvas.getContext('2d')!;
  const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  g.addColorStop(0, 'rgba(255,250,235,1)'); g.addColorStop(0.18, 'rgba(255,240,205,0.55)');
  g.addColorStop(0.5, 'rgba(255,230,190,0.12)'); g.addColorStop(1, 'rgba(255,230,190,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, S, S);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/**
 * The glow round the lamps: one cloud of points for the roof's lamps and one
 * for the towers' heads, added light, so the whole of it is two draw calls.
 * Hidden by day.
 */
export function glows(roof: THREE.Vector3[], towers: THREE.Vector3[]) {
  const texture = glowTexture();
  const cloud = (at: THREE.Vector3[], size: number) => {
    const points = new THREE.Points(
      new THREE.BufferGeometry().setFromPoints(at),
      new THREE.PointsMaterial({ map: texture, size, sizeAttenuation: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, toneMapped: false }),
    );
    points.visible = false;
    return points;
  };
  return { points: [cloud(roof, 4.2), cloud(towers, 16)], texture };
}
