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
    hemisphere: { sky: 0xe5f1ff, ground: 0x73886d, intensity: 1.25 },
    key: { colour: 0xfffaf1, intensity: 2.75, position: [-15, 30, -8] },
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
    environment: 0.85,
    boards: 1,
    lamps: 2.6,
  },
};

/**
 * What the ground reflects at night, besides the sky: the floodlights' heads,
 * the ring of lamps along the roof, and the lit stands under them. Without
 * these a helmet, the glass and the ball reflected nothing but a dark blue
 * dome, and everything shiny went dull exactly when a floodlit ground is
 * full of glints. Drawn into the environment map only — they are never in
 * the scene itself.
 */
export function nightReflections(): THREE.Object3D[] {
  const glare = (r: number, g: number, b: number) => new THREE.MeshBasicMaterial({ color: new THREE.Color(r, g, b), side: THREE.DoubleSide, toneMapped: false });
  const objects: THREE.Object3D[] = [];
  for (const [x, z] of [[-19, 58], [19, 58], [-19, -38], [19, -38]]) {
    const head = new THREE.Mesh(new THREE.PlaneGeometry(7, 4.5), glare(7, 6.6, 6));
    head.position.set(x, 15.6, z - 10).normalize().multiplyScalar(40);
    head.lookAt(0, 0, 0);
    objects.push(head);
  }
  const ring = new THREE.Mesh(new THREE.TorusGeometry(41, 0.3, 4, 64).rotateX(Math.PI / 2), glare(2.6, 2.5, 2.2));
  ring.position.y = 8.2;
  const stands = new THREE.Mesh(new THREE.CylinderGeometry(42, 42, 8, 48, 1, true), glare(0.34, 0.32, 0.29));
  stands.position.y = 4;
  objects.push(ring, stands);
  return objects;
}

/** Where the fill light comes from: the far towers. */
export const FILL_POSITION: [number, number, number] = [14, 28, 60];

/**
 * The moon: full, small and high, so it reads as far off rather than as a
 * lamp on the roof. A phone held upright shows the sky over the far end only
 * in the gap between the score bar and the buttons, just right of the middle,
 * so that is where it hangs; on a desktop it is near the top of the frame.
 */
const MOON = { azimuth: -2.5, elevation: 15.4, distance: 170, size: 4.2 } as const;

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
