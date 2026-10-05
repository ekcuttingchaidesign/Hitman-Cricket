import * as THREE from 'three';

/**
 * The outfield and the square, painted once into canvases when the scene is
 * built. Nothing is downloaded and nothing is redrawn after the first frame.
 *
 * What they replace was geometry: ten concentric rings of a second green for
 * the outfield, and ninety-five tiny boxes for the wear on the pitch. The rings
 * are not how a ground is cut — it is mown in straight lines, up and down the
 * wicket — and every box was a draw call, twice over with its shadow, for marks
 * that read as confetti from the crease. A texture is one draw for the lot.
 */

/** A small seeded generator, so every load paints the same ground. */
export function seeded(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function canvas(width: number, height: number) {
  const c = document.createElement('canvas'); c.width = width; c.height = height;
  return { c, ctx: c.getContext('2d')! };
}

/** A tile of per-pixel grain, laid over a whole canvas so nothing reads as flat fill. */
function grain(random: () => number, size = 128) {
  const { c, ctx } = canvas(size, size);
  const image = ctx.createImageData(size, size);
  for (let i = 0; i < image.data.length; i += 4) {
    const v = 90 + random() * 76;
    image.data[i] = image.data[i + 1] = image.data[i + 2] = v; image.data[i + 3] = 255;
  }
  ctx.putImageData(image, 0, 0);
  return c;
}

function overlayGrain(ctx: CanvasRenderingContext2D, random: () => number, width: number, height: number, alpha: number) {
  ctx.save();
  ctx.globalCompositeOperation = 'overlay'; ctx.globalAlpha = alpha;
  ctx.fillStyle = ctx.createPattern(grain(random), 'repeat')!;
  ctx.fillRect(0, 0, width, height);
  ctx.restore();
}

function blob(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, colour: string, alpha: number) {
  ctx.save(); ctx.translate(x, y); ctx.scale(rx / ry, 1);
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, ry);
  g.addColorStop(0, colour); g.addColorStop(1, colour.replace(/[\d.]+\)$/, '0)'));
  ctx.globalAlpha = alpha; ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(0, 0, ry, 0, Math.PI * 2); ctx.fill(); ctx.restore();
}

function finish(c: HTMLCanvasElement, anisotropy: number) {
  const texture = new THREE.CanvasTexture(c);
  texture.colorSpace = THREE.SRGBColorSpace;
  // The ground is seen almost edge-on; without this the stripes smear to a
  // single green a few metres out.
  texture.anisotropy = anisotropy;
  return texture;
}

/** Outfield colours, in sRGB. */
export const TURF = { light: '#6aa449', dark: '#5e9540', edge: 'rgba(38,70,30,1)' } as const;

/**
 * The outfield, for a `CircleGeometry` of `radius` centred `centreZ` along
 * the wicket and laid flat. The circle's UVs are its bounding square, so a
 * metre is the same number of pixels in both directions.
 */
export function grassTexture(radius: number, centreZ: number, boundary: number, anisotropy: number) {
  const size = 2048, scale = size / (radius * 2);
  const { c, ctx } = canvas(size, size);
  const random = seeded(11);
  // Laid flat, the circle's +v runs away from the bowler; canvas rows run down
  // the page, which is towards him.
  const col = (x: number) => (x + radius) * scale;
  const row = (z: number) => (z - centreZ + radius) * scale;

  ctx.fillStyle = TURF.dark; ctx.fillRect(0, 0, size, size);
  // Mown up and down the wicket, one stripe centred on the pitch.
  const stripe = 4.2;
  ctx.fillStyle = TURF.light;
  for (let x = -stripe / 2 - stripe * 20; x < radius; x += stripe * 2) ctx.fillRect(col(x), 0, stripe * scale, size);
  // And cut across, fainter, which is what makes the chequer a groundsman is proud of.
  ctx.fillStyle = 'rgba(255,255,230,0.045)';
  const middle = 9.35;
  for (let z = middle - stripe / 2 - stripe * 20; z < centreZ + radius; z += stripe * 2) ctx.fillRect(0, row(z), size, stripe * scale);

  // Patches where the grass is thicker, thinner, wetter or drier.
  for (let i = 0; i < 260; i++) {
    const r = (1.5 + random() * 6) * scale;
    const dark = random() < 0.55;
    blob(ctx, random() * size, random() * size, r * (1 + random()), r, dark ? 'rgba(30,60,20,1)' : 'rgba(210,230,150,1)', 0.05 + random() * 0.05);
  }

  // The square: the table of pitches around this one, cut tighter and a
  // little paler. Soft-edged by stacking a few faint rectangles.
  for (let i = 0; i < 6; i++) {
    const inset = i * 0.6;
    ctx.fillStyle = 'rgba(228,228,160,0.035)';
    ctx.fillRect(col(-9 + inset), row(-3.5 + inset), (18 - inset * 2) * scale, (26.5 - inset * 2) * scale);
  }

  // Beyond the rope the grass is left longer and the stripes die away.
  const cx = col(0), cy = row(centreZ);
  const outside = ctx.createRadialGradient(cx, cy, (boundary + 0.4) * scale, cx, cy, radius * scale);
  outside.addColorStop(0, TURF.edge.replace(/1\)$/, '0.22)'));
  outside.addColorStop(0.35, TURF.edge.replace(/1\)$/, '0.32)'));
  outside.addColorStop(1, TURF.edge.replace(/1\)$/, '0.45)'));
  ctx.fillStyle = outside;
  ctx.beginPath(); ctx.arc(cx, cy, radius * scale, 0, Math.PI * 2); ctx.arc(cx, cy, (boundary + 0.4) * scale, 0, Math.PI * 2, true); ctx.fill();

  overlayGrain(ctx, random, size, size, 0.22);
  return finish(c, anisotropy);
}

/** Two hex colours, a fraction `t` of the way from the first to the second. */
function mix(from: string, to: string, t: number) {
  const a = parseInt(from.slice(1), 16), b = parseInt(to.slice(1), 16);
  const channel = (shift: number) => Math.round(((a >> shift) & 255) * (1 - t) + ((b >> shift) & 255) * t);
  return `#${((channel(16) << 16) | (channel(8) << 8) | channel(0)).toString(16).padStart(6, '0')}`;
}

/**
 * The strip, for a `BoxGeometry` `width` by `length` centred `centreZ`: the
 * cut playing surface down the middle, fading to worn grass at its edges,
 * with the marks a match leaves on it.
 *
 * `green` is how much live grass has been left on it, nought to one. The
 * Blast's strip has none — a dry, cracked one-day surface. A Test is played on
 * a greener one: grass through the surface, fewer cracks, less dust between
 * the wickets, and the bowlers' footmarks worn just the same. At nought this
 * paints exactly the strip it always has, ball mark for ball mark.
 *
 * `wear` is how far through a long innings the strip is, nought to one: the
 * grass going off it, the surface browning, more cracks and longer, wider
 * ones, the footmarks scuffed darker and spreading, and the rough a bowler's
 * follow-through digs outside the batter's off stump. The Marathon repaints
 * it as its levels come (`WEAR_STAGES`). At nought nothing is drawn that was
 * not drawn before, and in the same order, so the strip is unchanged.
 */
export function pitchTexture(width: number, length: number, centreZ: number, anisotropy: number, ends: { batting: number; bowling: number }, green = 0, wear = 0) {
  green *= 1 - 0.8 * wear;
  const W = 320, H = 3072;
  const { c, ctx } = canvas(W, H);
  const random = seeded(23);
  // The top face of a box has +v towards -z, and a canvas is drawn top down,
  // so the first row is the end behind the batter.
  const col = (x: number) => (x / width + 0.5) * W;
  const row = (z: number) => ((z - centreZ) / length + 0.5) * H;
  const px = W / width;

  // Worn grass at the edges, the prepared surface in the middle.
  const across = ctx.createLinearGradient(0, 0, W, 0);
  const browned = (colour: string) => (wear ? mix(colour, '#b0905e', 0.5 * wear) : colour);
  const edge = browned(mix('#aaae70', '#93a862', green)), surface = browned(mix('#d3b683', '#b3bd78', green)), verge = browned(mix('#b9b27b', '#a1ae6a', green));
  across.addColorStop(0, edge); across.addColorStop(0.1, verge); across.addColorStop(0.16, surface);
  across.addColorStop(0.84, surface); across.addColorStop(0.9, verge); across.addColorStop(1, edge);
  ctx.fillStyle = across; ctx.fillRect(0, 0, W, H);
  // And at the ends, where the surface gives way to the square.
  for (const [from, to] of [[0, row(ends.batting - 9)], [H, row(ends.bowling + 1)]] as const) {
    const g = ctx.createLinearGradient(0, from, 0, to);
    g.addColorStop(0, 'rgba(160,170,105,0.85)'); g.addColorStop(1, 'rgba(160,170,105,0)');
    ctx.fillStyle = g; ctx.fillRect(0, Math.min(from, to), W, Math.abs(to - from));
  }

  // The grain of the rolled surface, running down the pitch.
  for (let i = 0; i < 520; i++) {
    const x = random() * W, y = random() * H, len = (0.3 + random() * 2.5) * px;
    ctx.fillStyle = random() < 0.5 ? 'rgba(120,98,60,0.10)' : 'rgba(245,232,200,0.12)';
    ctx.fillRect(x, y, 1, len);
  }

  // The grass left on it: short blades down the grain, thickest away from
  // the line of the ball, where nobody has been running.
  for (let i = 0; i < Math.round(2600 * green); i++) {
    const x = random() * W, y = random() * H, len = (0.15 + random() * 0.5) * px;
    const shade = random();
    ctx.fillStyle = shade < 0.5 ? `rgba(92,138,58,${(0.16 + random() * 0.14).toFixed(2)})` : `rgba(130,168,84,${(0.14 + random() * 0.12).toFixed(2)})`;
    ctx.fillRect(x, y, 1.4, len);
  }

  // Where the ball pitches: darker, and pocked with ball marks.
  blob(ctx, col(0), row((ends.batting + ends.bowling) * 0.36), 0.75 * px, 4.2 * px, 'rgba(150,120,80,1)', 0.22 * (1 - 0.4 * green));
  for (let i = 0; i < 90; i++) {
    const r = (0.012 + random() * 0.02) * px;
    blob(ctx, col((random() - 0.5) * 1.1), row(ends.batting + 3 + random() * 7), r * 1.3, r, 'rgba(110,88,55,1)', 0.45);
  }

  // Dust and footmarks round both creases, where every ball is played from
  // and bowled from.
  for (const [z, spread, feet] of [[ends.batting + 1.1, 1.6, 70], [ends.bowling - 1.2, 1.8, 110]] as const) {
    blob(ctx, col(0), row(z), 1.05 * px, spread * px, 'rgba(226,210,170,1)', 0.45 * (1 - 0.3 * green));
    // Scuffed rather than stamped: many faint marks that overlap into a worn
    // patch, where a few dark ones read as spots.
    for (let i = 0; i < feet * 2; i++) {
      const r = (0.025 + random() * 0.04) * px;
      blob(ctx, col((random() - 0.5) * 1.2), row(z + (random() - 0.5) * spread * 1.3), r * (1 + random() * 1.5), r, 'rgba(140,112,72,1)', 0.08 + random() * 0.14);
    }
  }

  // Cracks, mostly between the wickets.
  ctx.lineCap = 'round';
  // Short and nearly straight: a crack wanders a little, where a long winding
  // one reads from the crease as a scribble.
  for (let i = 0; i < Math.round(110 * (1 - 0.75 * green)); i++) {
    let x = col((random() - 0.5) * 1.8), y = row(ends.batting + random() * (ends.bowling - ends.batting));
    let heading = random() * Math.PI * 2;
    ctx.beginPath(); ctx.moveTo(x, y);
    const steps = 2 + Math.floor(random() * 3);
    for (let s = 0; s < steps; s++) {
      heading += (random() - 0.5) * 0.7;
      x += Math.cos(heading) * px * 0.035; y += Math.sin(heading) * px * 0.035;
      ctx.lineTo(x, y);
    }
    ctx.strokeStyle = `rgba(120,96,60,${(0.14 + random() * 0.18).toFixed(2)})`;
    ctx.lineWidth = 0.6 + random() * 0.5;
    ctx.stroke();
  }

  if (wear) wearMarks(ctx, random, wear, col, row, px, ends);

  overlayGrain(ctx, random, W, H, 0.16);
  return finish(c, anisotropy);
}

/** How worn the Marathon's strip is at each of its steps: fresh, the swing, the express bowler, Level 3. */
export const WEAR_STAGES = [0, 0.4, 0.7, 1] as const;

/**
 * What a long innings does to a strip, drawn over a fresh one: the footmarks
 * at both ends scuffed darker and wider, the rough outside the batter's off
 * stump where the bowler lands and follows through, more ball marks where it
 * pitches, a dusty patch on a length, and cracks between the wickets — more of
 * them, longer and opening wider the further it goes.
 */
function wearMarks(ctx: CanvasRenderingContext2D, random: () => number, wear: number, col: (x: number) => number, row: (z: number) => number, px: number, ends: { batting: number; bowling: number }) {
  for (const [z, spread] of [[ends.batting + 1.1, 1.9], [ends.bowling - 1.2, 2.2]] as const) {
    for (let i = 0; i < Math.round(160 * wear); i++) {
      const r = (0.03 + random() * 0.05) * px;
      blob(ctx, col((random() - 0.5) * 1.5), row(z + (random() - 0.5) * spread * 1.5), r * (1 + random() * 1.8), r, 'rgba(118,90,55,1)', 0.1 + random() * 0.18 * wear);
    }
  }
  // The rough: the bowler's landing and follow-through, a full stride outside
  // the batter's off stump, two to four metres from him.
  for (const side of [-1, 1]) {
    blob(ctx, col(side * 0.52), row(ends.batting + 3.1), 0.22 * px, 1.1 * px, 'rgba(112,84,50,1)', 0.32 * wear);
    for (let i = 0; i < Math.round(60 * wear); i++) {
      const r = (0.025 + random() * 0.045) * px;
      blob(ctx, col(side * (0.38 + random() * 0.3)), row(ends.batting + 2 + random() * 2.4), r * 1.4, r, 'rgba(96,72,44,1)', 0.18 + random() * 0.22);
    }
  }
  // Dust on a length, where the ball has been landing all day.
  blob(ctx, col(0), row(ends.batting + 6), 0.6 * px, 2.6 * px, 'rgba(232,214,176,1)', 0.22 * wear);
  for (let i = 0; i < Math.round(220 * wear); i++) {
    const r = (0.014 + random() * 0.022) * px;
    blob(ctx, col((random() - 0.5) * 1.1), row(ends.batting + 3 + random() * 7), r * 1.3, r, 'rgba(100,78,48,1)', 0.5);
  }
  // Cracks, opening: more, longer, wider and darker as it goes.
  ctx.lineCap = 'round';
  for (let i = 0; i < Math.round(170 * wear); i++) {
    let x = col((random() - 0.5) * 1.9), y = row(ends.batting + random() * (ends.bowling - ends.batting));
    let heading = random() * Math.PI * 2;
    ctx.beginPath(); ctx.moveTo(x, y);
    const steps = 3 + Math.floor(random() * (3 + 5 * wear));
    for (let s = 0; s < steps; s++) {
      heading += (random() - 0.5) * 0.9;
      x += Math.cos(heading) * px * 0.045; y += Math.sin(heading) * px * 0.045;
      ctx.lineTo(x, y);
    }
    ctx.strokeStyle = `rgba(92,70,42,${(0.22 + random() * 0.3 * wear).toFixed(2)})`;
    ctx.lineWidth = 0.8 + random() * (0.6 + 1.4 * wear);
    ctx.stroke();
  }
}

/**
 * Contact shadow: the soft dark patch right under a figure's feet that the
 * sun's shadow alone does not give, and without which a fielder in the deep
 * looks pasted onto the grass rather than stood on it.
 */
export function contactShadowTexture() {
  const { c, ctx } = canvas(64, 64);
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(0,0,0,0.55)'); g.addColorStop(0.5, 'rgba(0,0,0,0.28)'); g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}
