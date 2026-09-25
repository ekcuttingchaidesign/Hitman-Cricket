import * as THREE from 'three';

/**
 * The painted surfaces of the ground: the outfield, the pitch, the sky and the
 * soft patch of shade under a pair of feet. All of it is drawn into canvases
 * at start-up from nothing but numbers, so the game still ships no image files
 * for its 3D world. Each function returns textures the scene owns and must
 * dispose.
 *
 * The look these chase is the cover art: rich green with the mower's straight
 * bands and the circles a groundsman leaves, a warm sandy strip worn darker
 * down the middle and scuffed at both ends, and a blue sky with soft clouds.
 */

function canvas(width: number, height: number) {
  const el = document.createElement('canvas');
  el.width = width; el.height = height;
  return { el, ctx: el.getContext('2d')! };
}

/** A small deterministic generator, so the ground is the same every time. */
function random(seed: number) {
  return () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
}

/** Smooth value noise on a repeating grid, in [-.5, .5]. */
function valueNoise(size: number, seed: number) {
  const rng = random(seed);
  const values = Float32Array.from({ length: size * size }, () => rng());
  return (u: number, v: number) => {
    const x = ((u % 1) + 1) % 1 * size, y = ((v % 1) + 1) % 1 * size;
    const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
    const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    const at = (dx: number, dy: number) => values[((iy + dy) % size) * size + (ix + dx) % size];
    const a = at(0, 0) + (at(1, 0) - at(0, 0)) * sx, b = at(0, 1) + (at(1, 1) - at(0, 1)) * sx;
    return a + (b - a) * sy - .5;
  };
}

/** Per-pixel grain and low-frequency mottle over whatever is already painted. */
function grain(ctx: CanvasRenderingContext2D, width: number, height: number, seed: number, fine: number, coarse: number, coarseScale: number) {
  const image = ctx.getImageData(0, 0, width, height), data = image.data;
  const rng = random(seed), mottle = valueNoise(coarseScale, seed + 7), mottle2 = valueNoise(coarseScale * 4, seed + 11);
  for (let y = 0; y < height; y++) {
    const v = y / height;
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const n = 1 + (rng() - .5) * fine + (mottle(x / width, v) * 1.4 + mottle2(x / width, v) * .6) * coarse;
      data[i] = Math.min(255, data[i] * n); data[i + 1] = Math.min(255, data[i + 1] * n); data[i + 2] = Math.min(255, data[i + 2] * n);
    }
  }
  ctx.putImageData(image, 0, 0);
}

function texture(el: HTMLCanvasElement, anisotropy: number) {
  const t = new THREE.CanvasTexture(el);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = Math.min(8, anisotropy);
  t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter;
  return t;
}

/**
 * The outfield, painted over the whole disc: `radius` metres either side of
 * the centre. Straight bands run along the pitch and the circles run round it,
 * both a few percent apart, and grain and mottle keep a big flat green from
 * reading as a flat green. Everything is cut off at the disc edge by the
 * geometry, so the corners of the square are never seen.
 */
export function outfieldTexture(radius: number, anisotropy: number, size = 1536) {
  const { el, ctx } = canvas(size, size), px = size / (radius * 2);
  ctx.fillStyle = '#33a028'; ctx.fillRect(0, 0, size, size);
  // The mower's bands, along the pitch, about five metres wide.
  const band = 5 * px;
  for (let x = 0, i = 0; x < size; x += band, i++) {
    ctx.fillStyle = i % 2 ? 'rgba(255,255,255,.055)' : 'rgba(0,30,0,.045)';
    ctx.fillRect(x, 0, band, size);
  }
  // The circles, every six metres out from the middle, with a soft edge.
  ctx.lineWidth = 3.1 * px; ctx.strokeStyle = 'rgba(255,255,230,.07)';
  for (let r = 3.5; r < radius; r += 6) { ctx.beginPath(); ctx.arc(size / 2, size / 2, r * px, 0, Math.PI * 2); ctx.stroke(); }
  ctx.lineWidth = 1.2 * px; ctx.strokeStyle = 'rgba(0,25,0,.035)';
  for (let r = 6.5; r < radius; r += 6) { ctx.beginPath(); ctx.arc(size / 2, size / 2, r * px, 0, Math.PI * 2); ctx.stroke(); }
  // The square is a shade paler where the strips are: the cover has it too.
  const square = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, 16 * px);
  square.addColorStop(0, 'rgba(230,220,150,.10)'); square.addColorStop(1, 'rgba(230,220,150,0)');
  ctx.fillStyle = square; ctx.fillRect(0, 0, size, size);
  grain(ctx, size, size, 31, .07, .05, 24);
  return texture(el, anisotropy);
}

/**
 * The strip: `width` by `length` metres, drawn with the batter's end at the
 * top and the bowler's at the bottom — a plane laid flat by turning it back
 * about X puts its top row at the near end. The creases are painted in rather
 * than built, so they are as crisp as the canvas and cost no meshes;
 * `creases` is the two popping-crease distances from each end.
 */
export function pitchTexture(width: number, length: number, creases: { fromBatterEnd: number; fromBowlerEnd: number; returnX: number; returnLength: number }, anisotropy: number, size = 384) {
  const height = Math.round(size * length / width);
  const { el, ctx } = canvas(size, height), px = size / width;
  const zToY = (fromBatterEnd: number) => fromBatterEnd * px;
  ctx.fillStyle = '#d4b172'; ctx.fillRect(0, 0, size, height);
  // Softer, paler edges where the strip meets the grass.
  const rim = ctx.createLinearGradient(0, 0, size, 0);
  rim.addColorStop(0, 'rgba(255,250,225,.30)'); rim.addColorStop(.09, 'rgba(255,250,225,0)');
  rim.addColorStop(.91, 'rgba(255,250,225,0)'); rim.addColorStop(1, 'rgba(255,250,225,.30)');
  ctx.fillStyle = rim; ctx.fillRect(0, 0, size, height);
  // The worn middle: darker and browner where the ball has been landing all day.
  const middle = ctx.createLinearGradient(0, 0, size, 0);
  middle.addColorStop(0, 'rgba(120,80,30,0)'); middle.addColorStop(.32, 'rgba(120,80,30,.13)');
  middle.addColorStop(.68, 'rgba(120,80,30,.13)'); middle.addColorStop(1, 'rgba(120,80,30,0)');
  ctx.fillStyle = middle; ctx.fillRect(0, 0, size, height);
  // Good-length wear in front of the batter, a broad soft patch.
  const rng = random(77);
  const patch = (fromBatterEnd: number, spread: number, alpha: number) => {
    const g = ctx.createRadialGradient(size / 2, zToY(fromBatterEnd), 0, size / 2, zToY(fromBatterEnd), spread * px);
    g.addColorStop(0, `rgba(110,75,30,${alpha})`); g.addColorStop(1, 'rgba(110,75,30,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, size, height);
  };
  patch(length * .40, 5, .12); patch(length * .58, 4, .08);
  // Footmarks: the bowlers' where they land and run off, the batter's where he
  // stands. Small dark ellipses with soft edges, never the same twice.
  const mark = (x: number, fromBatterEnd: number, w: number, h: number, alpha: number, angle: number) => {
    ctx.save(); ctx.translate(size / 2 + x * px, zToY(fromBatterEnd)); ctx.rotate(angle);
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
    g.addColorStop(0, `rgba(100,66,26,${alpha})`); g.addColorStop(.6, `rgba(100,66,26,${alpha * .5})`); g.addColorStop(1, 'rgba(100,66,26,0)');
    ctx.scale(w * px, h * px); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, 1, 0, Math.PI * 2); ctx.fill(); ctx.restore();
  };
  for (let i = 0; i < 70; i++) mark((rng() - .5) * 1.2, length - creases.fromBowlerEnd - .2 - rng() * 6.5, .09 + rng() * .05, .13 + rng() * .08, .09 + rng() * .09, (rng() - .5) * .8);
  for (let i = 0; i < 26; i++) mark((rng() - .5) * 1.4, creases.fromBatterEnd - .9 + rng() * 1.8, .09 + rng() * .04, .12 + rng() * .07, .08 + rng() * .08, (rng() - .5) * .6);
  grain(ctx, size, height, 5, .09, .05, 16);
  // The creases, over everything: crisp white, popping and return at each end.
  ctx.fillStyle = '#f6f0e0';
  const line = 0.045 * px;
  for (const [fromEnd, behind] of [[creases.fromBatterEnd, -1], [length - creases.fromBowlerEnd, 1]] as const) {
    ctx.fillRect(0, zToY(fromEnd) - line / 2, size, line);
    for (const x of [-creases.returnX, creases.returnX]) {
      const y0 = zToY(fromEnd), y1 = zToY(fromEnd + behind * creases.returnLength);
      ctx.fillRect(size / 2 + x * px - line / 2, Math.min(y0, y1), line, Math.abs(y1 - y0));
    }
  }
  return texture(el, anisotropy);
}

/** A soft dark disc, for the shade under a figure's feet. */
export function contactTexture() {
  const size = 64, { el, ctx } = canvas(size, size);
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(.45, 'rgba(255,255,255,.55)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(el);
  t.minFilter = t.magFilter = THREE.LinearFilter;
  return t;
}

/**
 * The sky: a dome the camera sits inside, coloured by the direction it is
 * looked at, deep blue overhead easing to a pale horizon. The clouds are
 * modelled and placed in front of it by the scene. It is not tone mapped and
 * takes no fog, because it is the colour the fog fades everything else
 * towards.
 */
export function skyDome(radius: number) {
  const material = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false, toneMapped: false,
    uniforms: {
      zenith: { value: new THREE.Color('#1f6fd4') },
      middle: { value: new THREE.Color('#4a9ce6') },
      horizon: { value: new THREE.Color('#c9e6f4') },
    },
    vertexShader: `varying vec3 dir; void main() { dir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `
      varying vec3 dir;
      uniform vec3 zenith, middle, horizon;
      void main() {
        vec3 d = normalize(dir);
        float h = max(d.y, 0.0);
        vec3 color = mix(horizon, middle, smoothstep(0.0, .22, h));
        color = mix(color, zenith, smoothstep(.18, .75, h));
        gl_FragColor = vec4(color, 1.0);
        #include <colorspace_fragment>
      }`,
  });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(radius, 40, 24), material);
  dome.name = 'Sky';
  dome.renderOrder = -10;
  dome.frustumCulled = false;
  return dome;
}
