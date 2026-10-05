import * as THREE from 'three';
import { seeded } from './turf';

/**
 * The sky, and the light it gives off.
 *
 * It used to be the clear colour: one flat teal behind everything, which is the
 * single thing that made the ground read as a prototype rather than a venue.
 * Now it is a dome that goes from a hazy horizon to a clear blue overhead, with
 * fair-weather cloud painted once into a strip and wrapped round the ground.
 *
 * The same dome is rendered once into an environment map, so a helmet or a
 * ball held up to it picks up the sky it is under instead of nothing at all.
 * That is one render at start-up, not one a frame.
 */

/** Colours in sRGB, as a designer would pick them. `THREE.Color` does the rest. */
export const SKY = {
  zenith: 0x3f86cf,
  horizon: 0xcfe4ea,
  /** What the lower half of the environment map sees: the outfield. */
  ground: 0x5d7d44,
} as const;

/**
 * The same dome after dark: a deep blue overhead, going to a horizon lifted by
 * the glow of the ground's own lights, and an outfield the floodlights have
 * made brighter than anything round it.
 */
export const NIGHT_SKY = {
  zenith: 0x0b1530,
  horizon: 0x2a3d5e,
  ground: 0x3d5a34,
} as const;

/** Day or night: the palette, how much light the clouds catch, and whether the stars are out. */
export type SkyTime = 'day' | 'night';
const TIMES = {
  day: { ...SKY, cloud: 1, cover: 1, stars: 0 },
  // No cloud at night: a clear sky, so the stars and the moon have it to themselves.
  night: { ...NIGHT_SKY, cloud: 0.1, cover: 0, stars: 1 },
} as const;

/** How far up the sky the cloud band reaches, as the sine of the elevation (30°). */
const CLOUD_TOP = 0.5;

const vertexShader = /* glsl */`
  varying vec3 vDir;
  void main() {
    vDir = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    // Pinned to the far plane, so the dome is behind everything whatever its
    // radius and never clipped by it.
    gl_Position.z = gl_Position.w;
  }
`;

const fragmentShader = /* glsl */`
  uniform vec3 zenith;
  uniform vec3 horizon;
  uniform vec3 ground;
  uniform sampler2D clouds;
  uniform float cloudLight;
  uniform float cover;
  uniform float stars;
  varying vec3 vDir;
  float hash(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
  void main() {
    vec3 d = normalize(vDir);
    float e = d.y;
    // Most of the blue arrives in the first few degrees above the stands, which
    // is the only sky the camera ever sees.
    vec3 colour = mix(horizon, zenith, pow(max(e, 0.0), 0.55));
    float v = e / ${CLOUD_TOP.toFixed(2)};
    if (v > 0.0 && v < 1.0) {
      float density = texture2D(clouds, vec2(atan(d.x, d.z) * 0.15915494 + 0.5, v)).r;
      // Thin cloud takes the colour of the sky behind it; thick cloud is white.
      vec3 cloud = mix(horizon * 0.92, vec3(cloudLight), smoothstep(0.25, 0.8, density));
      float coverage = smoothstep(0.12, 0.42, density) * smoothstep(0.0, 0.14, v) * (1.0 - smoothstep(0.7, 1.0, v));
      colour = mix(colour, cloud, coverage * 0.92 * cover);
    }
    // Stars: a sparse scatter that fades in with height, out of the horizon's glow.
    if (stars > 0.0) {
      // Sparse: about one cell in four hundred, each a pixel or two on a phone,
      // in a spread of brightness so they read as a sky rather than a grid.
      vec3 grid = d * 340.0, cell = floor(grid);
      // Round and soft rather than the square of the cell it lives in.
      float dot = 1.0 - smoothstep(0.12, 0.42, length(fract(grid) - 0.5));
      float star = step(0.9975, hash(cell)) * dot * smoothstep(0.06, 0.3, e);
      colour += vec3(0.86, 0.9, 1.0) * star * stars * (0.35 + 0.65 * hash(cell + 3.0));
    }
    colour = mix(colour, ground, smoothstep(0.0, -0.06, e));
    gl_FragColor = vec4(colour, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

/**
 * A strip of cumulus, horizon at the bottom, painted as density into the red
 * channel. Tiles left to right so the dome has no seam.
 */
function cloudTexture() {
  const W = 2048, H = 256;
  const canvas = document.createElement('canvas'); canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
  ctx.globalCompositeOperation = 'lighter';
  const random = seeded(7);
  const puff = (x: number, y: number, rx: number, ry: number, strength: number) => {
    for (const wrap of [-W, 0, W]) {
      ctx.save(); ctx.translate(x + wrap, y); ctx.scale(rx / ry, 1);
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, ry);
      const a = strength.toFixed(3);
      g.addColorStop(0, `rgba(255,255,255,${a})`); g.addColorStop(0.55, `rgba(255,255,255,${(strength * 0.55).toFixed(3)})`); g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, ry, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    }
  };
  for (let i = 0; i < 26; i++) {
    const x = random() * W;
    // Low clouds are far away, so they are smaller and flatter and there are more of them.
    const height = Math.pow(random(), 1.6);
    const y = H * (0.88 - height * 0.7);
    const size = 5 + height * 14 + random() * 6;
    const puffs = 6 + Math.floor(random() * 8);
    for (let p = 0; p < puffs; p++) {
      const spread = (random() - 0.5) * size * 5;
      // Puffs heap up in the middle of a cloud and sit on a flat base.
      const lift = Math.abs(random() * size * 1.1 * (1 - Math.abs(spread) / (size * 3)));
      const r = size * (0.5 + random() * 0.7);
      puff(x + spread, y - lift, r * 1.9, r, 0.32 + random() * 0.3);
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.colorSpace = THREE.NoColorSpace;
  return texture;
}

export class Sky {
  readonly mesh: THREE.Mesh;
  private clouds = cloudTexture();
  private material: THREE.ShaderMaterial;

  constructor() {
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        zenith: { value: new THREE.Color(SKY.zenith) },
        horizon: { value: new THREE.Color(SKY.horizon) },
        ground: { value: new THREE.Color(SKY.ground) },
        clouds: { value: this.clouds },
        cloudLight: { value: 1 },
        cover: { value: 1 },
        stars: { value: 0 },
      },
      vertexShader, fragmentShader,
      side: THREE.BackSide, depthWrite: false, fog: false,
    });
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(50, 48, 24), this.material);
    this.mesh.frustumCulled = false;
    // Drawn after every opaque thing, so the pixels they already cover are
    // thrown away by the depth test rather than shaded and painted over.
    this.mesh.renderOrder = 10;
  }

  /** Day or night: repaints the dome. The environment map has to be taken again after it. */
  time(time: SkyTime) {
    const t = TIMES[time], u = this.material.uniforms;
    (u.zenith.value as THREE.Color).set(t.zenith);
    (u.horizon.value as THREE.Color).set(t.horizon);
    (u.ground.value as THREE.Color).set(t.ground);
    u.cloudLight.value = t.cloud;
    u.cover.value = t.cover;
    u.stars.value = t.stars;
    return t;
  }

  /** The dome prefiltered for image-based lighting. Dispose of it with the scene. */
  environment(renderer: THREE.WebGLRenderer, extras: THREE.Object3D[] = []) {
    const pmrem = new THREE.PMREMGenerator(renderer);
    const room = new THREE.Scene();
    room.add(new THREE.Mesh(this.mesh.geometry, this.material));
    for (const extra of extras) room.add(extra);
    const target = pmrem.fromScene(room, 0.02);
    pmrem.dispose();
    return target;
  }

  dispose() {
    this.mesh.geometry.dispose(); this.material.dispose(); this.clouds.dispose();
  }
}
