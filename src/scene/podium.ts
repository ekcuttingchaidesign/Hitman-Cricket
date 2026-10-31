import * as THREE from 'three';
import { ARENA, lettering, shard, slash, sub } from './arena';

/**
 * The podium: a stage put up on the outfield for an innings that made a new
 * best or won a chase, after the presentation stage at a final — a deck with
 * the score on the block he stands on, an arch behind him, stacks of printed
 * blocks either side, cold-spark fountains along its front, smoke, fireworks
 * over the stand behind it, and his bat on fire. Built when it is wanted and
 * thrown away after.
 *
 * Its own frame: the middle of the deck's front edge on the grass, the front
 * facing +z, so the arch is at -z. Everything that moves is a closed-form
 * function of the stage's clock (`uTime`, seconds), so any moment can be
 * drawn on its own.
 */
export interface PodiumCard {
  /** The figure on the block he stands on. */
  score: string;
  /** Across the deck's front: NEW BEST, or CHASED KABIR'S 157. */
  line: string;
  name: string;
  /** The mode's colour, for the arch and the blocks. */
  mode: string;
  /** Whose stage: the game's, for the Blast, or Super10's, in its brand (`ARENA`). */
  brand: 'blast' | 'super10';
}
const hex = (c: number) => `#${c.toString(16).padStart(6, '0')}`;
const S10 = { ink: hex(ARENA.ink), plate: hex(ARENA.plate), violet: hex(ARENA.violet), volt: hex(ARENA.volt), mist: hex(ARENA.mist), white: '#ffffff' } as const;
const MARK = new URL('../assets/super10/mark.png', import.meta.url).href;

/** Super10's deck front: ink, violet slashes off both ends, the line in the brand's lettering and the name tracked after it. */
function fasciaS10(card: PodiumCard) {
  const { element, context: g } = canvas(2048, 164);
  g.fillStyle = S10.ink; g.fillRect(0, 0, 2048, 164);
  g.fillStyle = S10.violet; g.fillRect(0, 0, 2048, 8); g.fillRect(0, 156, 2048, 8);
  for (let i = 0; i < 8; i++) {
    const tone = i % 3 === 0 ? S10.violet : S10.plate;
    slash(g, 30 + i * 46, 30, 22, 104, tone); slash(g, 2048 - 70 - i * 46, 30, 22, 104, tone);
  }
  lettering(g, card.line.toUpperCase(), 860, 84, 104, 1180);
  sub(g, card.name.toUpperCase(), 1660, 86, 64, S10.mist);
  return textureOf(element);
}
/** The block's face: the score on its plate slab, the figure lime, the one charged thing on the stage. */
function scoreS10(card: PodiumCard) {
  const { element, context: g } = canvas(1024, 296);
  g.fillStyle = S10.ink; g.fillRect(0, 0, 1024, 296);
  g.strokeStyle = S10.violet; g.lineWidth = 10; g.strokeRect(14, 14, 996, 268);
  lettering(g, card.score, 512, 150, 220, 900);
  return textureOf(element);
}
/** The disc in the arch: violet rays on ink round the mark. */
function emblemS10() {
  const { element, context: g } = canvas(1024, 1024);
  const texture = textureOf(element);
  const draw = (mark: HTMLImageElement | null) => {
    g.fillStyle = S10.ink; g.beginPath(); g.arc(512, 512, 512, 0, Math.PI * 2); g.fill();
    for (let i = 0; i < 24; i++) {
      const a = i / 24 * Math.PI * 2;
      g.fillStyle = i % 2 ? S10.plate : '#1c0a40';
      g.beginPath(); g.moveTo(512, 512); g.arc(512, 512, 512, a, a + Math.PI * 2 / 24); g.closePath(); g.fill();
    }
    g.lineWidth = 22; g.strokeStyle = S10.violet; g.beginPath(); g.arc(512, 512, 340, 0, Math.PI * 2); g.stroke();
    g.lineWidth = 6; g.strokeStyle = S10.mist; g.beginPath(); g.arc(512, 512, 376, 0, Math.PI * 2); g.stroke();
    g.fillStyle = S10.ink; g.beginPath(); g.arc(512, 512, 326, 0, Math.PI * 2); g.fill();
    if (mark) { const w = 600, h = w * mark.height / mark.width; g.drawImage(mark, 512 - w / 2, 512 - h / 2, w, h); }
    texture.needsUpdate = true;
  };
  draw(null);
  if (typeof Image !== 'undefined') { const mark = new Image(); mark.onload = () => draw(mark); mark.src = MARK; }
  return texture;
}
/** Super10's printed blocks: ink, plate and violet, slashed and sharded, lime on two faces in sixteen. */
function blocksS10() {
  const size = 256, { element, context: g } = canvas(size * 4, size * 4);
  const grounds = [S10.ink, S10.violet, S10.plate, S10.ink, S10.plate, S10.violet, S10.ink, S10.mist];
  for (let tile = 0; tile < 16; tile++) {
    const x = (tile % 4) * size, y = Math.floor(tile / 4) * size, ground = grounds[tile % grounds.length];
    g.fillStyle = ground; g.fillRect(x, y, size, size);
    g.save(); g.beginPath(); g.rect(x, y, size, size); g.clip();
    const kind = tile % 4, ink = ground === S10.ink ? S10.violet : ground === S10.mist ? S10.violet : S10.ink;
    if (kind === 0) for (let i = 0; i < 4; i++) slash(g, x + 20 + i * 58, y + 30, 26, size - 60, i % 2 ? ink : S10.plate);
    else if (kind === 1) { shard(g, x + 20, y + size * .45, size * .95, 60, tile === 5 || tile === 13 ? S10.volt : ink); shard(g, x + 60, y + size * .78, size * .7, 34, S10.white); }
    else if (kind === 2) { g.fillStyle = ink; g.beginPath(); g.moveTo(x, y + size); g.lineTo(x + size, y + size * .25); g.lineTo(x + size, y + size); g.fill(); slash(g, x + 70, y + 50, 40, 110, S10.white); }
    else { g.fillStyle = ink; g.font = 'italic 900 180px Saira, Impact, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('10', x + size / 2, y + size / 2 + 8); }
    g.restore();
  }
  return textureOf(element);
}

const C = {
  orange: '#ed7044', blue: '#3f88f2', navy: '#152b3c', deep: '#0b1824', cream: '#f5efe6', gold: '#f5b83d', red: '#ff5a4e',
} as const;
/** Where he stands: on top of the block in the middle of the deck. */
export const PODIUM_TOP = new THREE.Vector3(0, 1.35, -2.4);
const DECK = { width: 10, height: .8, depth: 5 } as const;
const BLOCK = { width: 1.9, height: .55, depth: 1.5 } as const;

function canvas(width: number, height: number) {
  const element = document.createElement('canvas');
  element.width = width; element.height = height;
  const context = element.getContext('2d')!;
  return { element, context };
}
function textureOf(element: HTMLCanvasElement, anisotropy = 8) {
  const texture = new THREE.CanvasTexture(element);
  texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = anisotropy;
  return texture;
}
/** A lit, printed surface: its own picture glowing a little, as a set under the lights does. */
function printed(map: THREE.Texture, glow = .45) {
  return new THREE.MeshStandardMaterial({ map, emissiveMap: map, emissive: 0xffffff, emissiveIntensity: glow, roughness: .65, metalness: 0 });
}
function chevron(context: CanvasRenderingContext2D, x: number, y: number, size: number, colour: string) {
  context.fillStyle = colour;
  context.beginPath();
  context.moveTo(x - size, y + size * .5); context.lineTo(x, y - size * .5); context.lineTo(x + size, y + size * .5);
  context.lineTo(x + size, y + size * 1.05); context.lineTo(x, y + size * .05); context.lineTo(x - size, y + size * 1.05);
  context.closePath(); context.fill();
}

/** The deck's front: the line big, the name after it, chevrons running off both ends. */
function fasciaTexture(card: PodiumCard) {
  const { element, context: g } = canvas(2048, 164);
  const fill = g.createLinearGradient(0, 0, 0, 164);
  fill.addColorStop(0, C.navy); fill.addColorStop(1, C.deep);
  g.fillStyle = fill; g.fillRect(0, 0, 2048, 164);
  g.fillStyle = card.mode; g.fillRect(0, 0, 2048, 10); g.fillRect(0, 154, 2048, 10);
  for (let i = 0; i < 7; i++) {
    g.save(); g.translate(70 + i * 62, 82); g.rotate(Math.PI / 2); chevron(g, 0, -22, 30, i % 2 ? C.orange : card.mode); g.restore();
    g.save(); g.translate(2048 - 70 - i * 62, 82); g.rotate(-Math.PI / 2); chevron(g, 0, -22, 30, i % 2 ? C.orange : card.mode); g.restore();
  }
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = '112px Jaro, Impact, sans-serif';
  const line = card.line.toUpperCase(), name = card.name.toUpperCase();
  const lineWidth = g.measureText(line).width;
  g.font = '64px Saira, sans-serif'; const nameWidth = g.measureText(name).width;
  const gap = 56, total = lineWidth + gap + nameWidth, left = 1024 - total / 2;
  g.font = '112px Jaro, Impact, sans-serif';
  const gold = g.createLinearGradient(0, 30, 0, 140);
  gold.addColorStop(0, '#fff3c4'); gold.addColorStop(.5, C.gold); gold.addColorStop(1, '#c98a1c');
  g.fillStyle = gold; g.fillText(line, left + lineWidth / 2, 88);
  g.fillStyle = C.orange; g.beginPath(); g.arc(left + lineWidth + gap / 2, 84, 9, 0, Math.PI * 2); g.fill();
  g.font = 'italic 900 64px Saira, sans-serif'; g.fillStyle = C.cream; g.fillText(name, left + lineWidth + gap + nameWidth / 2, 88);
  return textureOf(element);
}

/** The block he stands on: the score, huge, in gold. */
function scoreTexture(card: PodiumCard) {
  const { element, context: g } = canvas(1024, 296);
  const fill = g.createLinearGradient(0, 0, 0, 296);
  fill.addColorStop(0, '#203c55'); fill.addColorStop(1, C.deep);
  g.fillStyle = fill; g.fillRect(0, 0, 1024, 296);
  g.strokeStyle = C.gold; g.lineWidth = 10; g.strokeRect(14, 14, 996, 268);
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = '250px Jaro, Impact, sans-serif';
  const gold = g.createLinearGradient(0, 40, 0, 260);
  gold.addColorStop(0, '#fff6cf'); gold.addColorStop(.45, C.gold); gold.addColorStop(1, '#b8780f');
  g.shadowColor = 'rgba(0,0,0,.45)'; g.shadowOffsetY = 8; g.shadowBlur = 0;
  g.fillStyle = gold; g.fillText(card.score, 512, 160);
  return textureOf(element);
}

/** The disc inside the arch: rays from a gold ring round the game's name. */
function emblemTexture(card: PodiumCard) {
  const { element, context: g } = canvas(1024, 1024);
  g.fillStyle = C.navy; g.beginPath(); g.arc(512, 512, 512, 0, Math.PI * 2); g.fill();
  for (let i = 0; i < 24; i++) {
    const a = i / 24 * Math.PI * 2;
    g.fillStyle = i % 2 ? '#1c3953' : '#22476a';
    g.beginPath(); g.moveTo(512, 512);
    g.arc(512, 512, 512, a, a + Math.PI * 2 / 24); g.closePath(); g.fill();
  }
  g.lineWidth = 26; g.strokeStyle = C.gold; g.beginPath(); g.arc(512, 512, 330, 0, Math.PI * 2); g.stroke();
  g.lineWidth = 8; g.strokeStyle = card.mode; g.beginPath(); g.arc(512, 512, 372, 0, Math.PI * 2); g.stroke();
  g.fillStyle = C.deep; g.beginPath(); g.arc(512, 512, 316, 0, Math.PI * 2); g.fill();
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = '190px Jaro, Impact, sans-serif'; g.fillStyle = C.cream; g.fillText('HITMAN', 512, 470);
  g.font = 'italic 900 92px Saira, sans-serif'; g.fillStyle = C.orange; g.fillText('CRICKET', 512, 600);
  for (let i = 0; i < 3; i++) chevron(g, 512, 300 - i * 34, 44, i === 0 ? C.gold : 'rgba(245,184,61,.5)');
  return textureOf(element);
}

/** The printed blocks: a four by four sheet of faces, each split in two colours with a mark on it. */
const MARKS = ['circle', 'diamond', 'star', 'chevron', 'sun', 'drop', 'half', 'ring'] as const;
function blocksTexture(card: PodiumCard) {
  const size = 256, { element, context: g } = canvas(size * 4, size * 4);
  const pairs: [string, string, string][] = [
    [C.orange, C.navy, C.gold], [card.mode, C.orange, C.cream], [C.navy, card.mode, C.gold], [C.red, C.gold, C.navy],
    [C.gold, C.orange, C.navy], [C.navy, C.red, C.cream], [card.mode, C.navy, C.orange], [C.cream, C.orange, C.navy],
  ];
  for (let tile = 0; tile < 16; tile++) {
    const x = (tile % 4) * size, y = Math.floor(tile / 4) * size, [a, b, mark] = pairs[tile % pairs.length], kind = MARKS[(tile * 3) % MARKS.length];
    const cx = x + size / 2, cy = y + size / 2, r = size * .26;
    g.fillStyle = a; g.fillRect(x, y, size, size);
    g.fillStyle = b; g.beginPath();
    if (tile % 3 === 0) { g.moveTo(x, y + size); g.lineTo(x + size, y); g.lineTo(x + size, y + size); }
    else if (tile % 3 === 1) g.rect(x, y + size / 2, size, size / 2);
    else { g.moveTo(x, y); g.lineTo(x + size, y + size); g.lineTo(x, y + size); }
    g.fill();
    g.fillStyle = mark; g.strokeStyle = mark; g.lineWidth = 22;
    g.beginPath();
    if (kind === 'circle') { g.arc(cx, cy, r, 0, Math.PI * 2); g.fill(); }
    else if (kind === 'ring') { g.arc(cx, cy, r * .9, 0, Math.PI * 2); g.stroke(); }
    else if (kind === 'diamond') { g.moveTo(cx, cy - r * 1.2); g.lineTo(cx + r * .8, cy); g.lineTo(cx, cy + r * 1.2); g.lineTo(cx - r * .8, cy); g.fill(); }
    else if (kind === 'star') {
      for (let i = 0; i < 8; i++) { const ang = i * Math.PI / 4, rr = i % 2 ? r * .38 : r * 1.25; g.lineTo(cx + Math.sin(ang) * rr, cy - Math.cos(ang) * rr); }
      g.fill();
    } else if (kind === 'chevron') { chevron(g, cx, cy - r * .6, r * 1.1, mark); chevron(g, cx, cy + r * .2, r * 1.1, mark); }
    else if (kind === 'sun') {
      for (let i = 0; i < 8; i++) { g.save(); g.translate(cx, cy); g.rotate(i * Math.PI / 4); g.fillRect(-r * .16, -r * 1.25, r * .32, r * .8); g.restore(); }
      g.beginPath(); g.arc(cx, cy, r * .42, 0, Math.PI * 2); g.fill();
    } else if (kind === 'drop') {
      g.moveTo(cx, cy - r * 1.2); g.quadraticCurveTo(cx + r, cy + r * .2, cx, cy + r); g.quadraticCurveTo(cx - r, cy + r * .2, cx, cy - r * 1.2); g.fill();
    } else { g.arc(cx, cy + r * .3, r, Math.PI, 0); g.fill(); }
  }
  return textureOf(element);
}
/** A cube whose six faces each show one tile of the sheet. */
function blockGeometry(edge: number, tiles: number[]) {
  const geometry = new THREE.BoxGeometry(edge, edge, edge);
  const uv = geometry.getAttribute('uv') as THREE.BufferAttribute;
  for (let face = 0; face < 6; face++) {
    const tile = tiles[face % tiles.length], u0 = (tile % 4) / 4, v0 = 1 - (Math.floor(tile / 4) + 1) / 4;
    for (let k = 0; k < 4; k++) {
      const i = face * 4 + k;
      uv.setXY(i, u0 + uv.getX(i) / 4, v0 + uv.getY(i) / 4);
    }
  }
  return geometry;
}
/** The arch: two legs and a half circle, `width` across its outside, `height` to its crown. */
function archGeometry(width: number, height: number, thick: number, depth: number) {
  const r = width / 2, legs = height - r, inner = r - thick;
  const shape = new THREE.Shape();
  shape.moveTo(-r, 0); shape.lineTo(-r, legs); shape.absarc(0, legs, r, Math.PI, 0, true); shape.lineTo(r, 0);
  shape.lineTo(inner, 0); shape.lineTo(inner, legs); shape.absarc(0, legs, inner, 0, Math.PI, false); shape.lineTo(-inner, 0);
  shape.closePath();
  return new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 40 }).translate(0, 0, -depth / 2);
}

/** Round, soft points, added up: sparks, embers and fireworks. */
const POINT_FRAG = /* glsl */`
  varying vec3 vColour; varying float vAlpha;
  void main() {
    vec2 c = gl_PointCoord - .5; float d = length(c) * 2.;
    if (d > 1.) discard;
    float core = smoothstep(1., .0, d);
    gl_FragColor = vec4(vColour * (.6 + core * 1.4), vAlpha * core);
  }`;
function pointsMaterial(vertexShader: string, uniforms: Record<string, THREE.IUniform>) {
  return new THREE.ShaderMaterial({ uniforms, vertexShader, fragmentShader: POINT_FRAG, transparent: true, depthWrite: false,
    blending: THREE.AdditiveBlending, fog: false, toneMapped: false });
}
const rand = (seed: number) => { const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };

/** Cold-spark fountains: `bases` the nozzles, each throwing a column of white-gold sparks a few metres up. */
function fountains(bases: THREE.Vector3[], uniforms: Record<string, THREE.IUniform>, cool = false) {
  const each = 260, base = new Float32Array(bases.length * each * 3), seed = new Float32Array(bases.length * each * 4);
  bases.forEach((at, f) => {
    for (let i = 0; i < each; i++) {
      const n = f * each + i;
      base.set([at.x, at.y, at.z], n * 3);
      seed.set([rand(n), rand(n + .3), rand(n + .7), rand(n + .9)], n * 4);
    }
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(base, 3));
  geometry.setAttribute('aSeed', new THREE.BufferAttribute(seed, 4));
  const material = pointsMaterial(/* glsl */`
    uniform float uTime; uniform float uPixels;
    attribute vec4 aSeed; varying vec3 vColour; varying float vAlpha;
    void main() {
      float life = .95 + .35 * aSeed.w;
      float phase = fract(uTime / life + aSeed.x), age = phase * life;
      float ang = aSeed.y * 6.2832, spread = .55 * aSeed.z;
      float speed = 7.2 + 1.6 * aSeed.w;
      vec3 v = vec3(cos(ang) * spread, speed, sin(ang) * spread);
      vec3 p = position + v * age + vec3(0., -4.9 * age * age, 0.);
      vec4 mv = modelViewMatrix * vec4(p, 1.);
      gl_Position = projectionMatrix * mv;
      gl_PointSize = (.055 + .05 * (1. - phase)) * uPixels / -mv.z;
      vColour = mix(vec3(1., .97, .85), ${cool ? 'vec3(.62, .45, 1.)' : 'vec3(1., .62, .22)'}, phase);
      vAlpha = (1. - phase) * smoothstep(0., .04, phase);
    }`, uniforms);
  return new THREE.Points(geometry, material);
}

/** Fireworks over the stand behind: shells bursting in turn, each a sphere of stars that droops and fades. */
function shells(uniforms: Record<string, THREE.IUniform>, colours: string[]) {
  const places: [number, number, number, number, THREE.Color][] = [
    [-9, 19, -24, 0, new THREE.Color(colours[0])], [7, 22, -27, .6, new THREE.Color(colours[1])], [0, 25, -30, 1.2, new THREE.Color(colours[2])],
    [-14, 15, -22, 1.6, new THREE.Color(colours[3])], [13, 17, -23, 2.1, new THREE.Color(colours[4])], [3, 18, -21, 2.6, new THREE.Color(colours[5])],
  ];
  const each = 340, n = places.length * each;
  const centre = new Float32Array(n * 3), dir = new Float32Array(n * 3), colour = new Float32Array(n * 3), start = new Float32Array(n);
  places.forEach(([x, y, z, t0, c], s) => {
    for (let i = 0; i < each; i++) {
      const k = s * each + i, u = rand(k + 1.1) * 2 - 1, a = rand(k + 2.3) * Math.PI * 2, r = Math.sqrt(1 - u * u);
      centre.set([x, y, z], k * 3); dir.set([r * Math.cos(a), u, r * Math.sin(a)], k * 3);
      const tint = c.clone().lerp(new THREE.Color(1, 1, 1), rand(k + 4.4) * .35);
      colour.set([tint.r, tint.g, tint.b], k * 3); start[k] = t0;
    }
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(centre, 3));
  geometry.setAttribute('aDir', new THREE.BufferAttribute(dir, 3));
  geometry.setAttribute('aColour', new THREE.BufferAttribute(colour, 3));
  geometry.setAttribute('aStart', new THREE.BufferAttribute(start, 1));
  const material = pointsMaterial(/* glsl */`
    uniform float uTime; uniform float uPixels;
    attribute vec3 aDir; attribute vec3 aColour; attribute float aStart;
    varying vec3 vColour; varying float vAlpha;
    void main() {
      float age = mod(uTime - aStart, 3.2);
      float out_ = 1. - exp(-age * 3.2);
      vec3 p = position + aDir * 6.5 * out_ + vec3(0., -1.1 * age * age, 0.);
      vec4 mv = modelViewMatrix * vec4(p, 1.);
      gl_Position = projectionMatrix * mv;
      float lit = age < 1.8 ? 1. - age / 1.8 : 0.;
      gl_PointSize = (.42 + .25 * exp(-age * 2.)) * uPixels / -mv.z * (lit > 0. ? 1. : 0.);
      vColour = aColour * (1.6 + 2. * exp(-age * 5.));
      vAlpha = lit * lit;
    }`, uniforms);
  return new THREE.Points(geometry, material);
}

/** Low smoke drifting over the deck and round the fountains. */
function smoke(uniforms: Record<string, THREE.IUniform>) {
  const n = 46, at = new Float32Array(n * 3), seed = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    at.set([(rand(i + .5) - .5) * 15, .9 + rand(i + 1.5) * 2.4, -5 + rand(i + 2.5) * 6.5], i * 3); seed[i] = rand(i + 3.5);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(at, 3));
  geometry.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
  return new THREE.Points(geometry, new THREE.ShaderMaterial({ uniforms, transparent: true, depthWrite: false, fog: false,
    vertexShader: /* glsl */`
      uniform float uTime; uniform float uPixels; attribute float aSeed; varying float vAlpha;
      void main() {
        vec3 p = position + vec3(sin(uTime * .3 + aSeed * 6.) * .8 + uTime * .35, uTime * .12 * aSeed, 0.);
        vec4 mv = modelViewMatrix * vec4(p, 1.);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = (2.6 + 2. * aSeed) * uPixels / -mv.z;
        vAlpha = .16 + .1 * aSeed;
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uSmoke; varying float vAlpha;
      void main() { float d = length(gl_PointCoord - .5) * 2.; if (d > 1.) discard; gl_FragColor = vec4(uSmoke, vAlpha * pow(1. - d, 1.6)); }`,
  }));
}

/**
 * The bat on fire: drawn flames, not real ones, in the game's inked style —
 * tongues of yellow inside orange inside red with a dark rim, standing up
 * off the blade whichever way it lies, flickering and swaying, with embers
 * rising off them and a glow round the lot. Hung on the bat, in its frame.
 */
function flames(toe: THREE.Vector3, shoulder: THREE.Vector3, uniforms: Record<string, THREE.IUniform>) {
  const group = new THREE.Group();
  const tongues = 11, verts: number[] = [], corner: number[] = [], seed: number[] = [], size: number[] = [], index: number[] = [];
  for (let i = 0; i < tongues; i++) {
    const along = .1 + .9 * i / (tongues - 1), at = shoulder.clone().lerp(toe, along);
    const w = .085 + .045 * rand(i + .2), h = .34 + .26 * rand(i + 1.7) + .1 * along;
    for (const [cx, cy] of [[-1, 0], [1, 0], [1, 1], [-1, 1]]) { verts.push(at.x, at.y, at.z); corner.push(cx, cy); seed.push(rand(i + 5.1)); size.push(w, h); }
    const b = i * 4; index.push(b, b + 1, b + 2, b, b + 2, b + 3);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  geometry.setAttribute('aCorner', new THREE.Float32BufferAttribute(corner, 2));
  geometry.setAttribute('aSeed', new THREE.Float32BufferAttribute(seed, 1));
  geometry.setAttribute('aSize', new THREE.Float32BufferAttribute(size, 2));
  geometry.setIndex(index);
  const tongue = new THREE.Mesh(geometry, new THREE.ShaderMaterial({
    uniforms, transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false, toneMapped: false,
    vertexShader: /* glsl */`
      uniform float uTime; attribute vec2 aCorner; attribute float aSeed; attribute vec2 aSize;
      varying vec2 vUv; varying float vSeed;
      void main() {
        vec4 c = modelViewMatrix * vec4(position, 1.);
        vec3 up = normalize((viewMatrix * vec4(0., 1., 0., 0.)).xyz);
        vec3 right = normalize(cross(up, normalize(-c.xyz)));
        float h = aSize.y * (.82 + .22 * sin(uTime * 9. + aSeed * 11.) + .1 * sin(uTime * 23. + aSeed * 5.));
        vec3 p = c.xyz + right * aCorner.x * aSize.x * 1.6 + up * (aCorner.y * h - .06);
        vUv = vec2(aCorner.x * 1.6, aCorner.y); vSeed = aSeed;
        gl_Position = projectionMatrix * vec4(p, 1.);
      }`,
    fragmentShader: /* glsl */`
      uniform float uTime; varying vec2 vUv; varying float vSeed;
      void main() {
        float y = vUv.y, t = uTime + vSeed * 7.;
        float x = vUv.x - .34 * y * sin(y * 4.6 - t * 7.) - .12 * y * sin(y * 10. - t * 12.);
        float w = y < .22 ? sqrt(max(0., 1. - pow((.22 - y) / .22, 2.))) : pow(max(0., 1. - (y - .22) / .78), .85);
        float d = abs(x) / max(w, .001);
        float edge = fwidth(d) * 1.5;
        float alpha = 1. - smoothstep(1. - edge, 1., d);
        if (alpha <= 0.) discard;
        vec3 ink = vec3(.42, .05, .02), red = vec3(.95, .2, .07), orange = vec3(1., .52, .1), yellow = vec3(1., .9, .38), white = vec3(1., .98, .86);
        float coreH = .5 + .08 * sin(t * 6.);
        vec3 col = d > .86 ? ink : d > .62 || y > .78 ? red : d > .36 || y > coreH ? orange : d > .16 || y > coreH * .6 ? yellow : white;
        gl_FragColor = vec4(col * 1.25, alpha);
      }`,
  }));
  tongue.renderOrder = 3; tongue.frustumCulled = false;
  group.add(tongue);
  // The glow round it: a soft disc, added, behind the tongues.
  const glowAt = shoulder.clone().lerp(toe, .55);
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.ShaderMaterial({
    uniforms, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, toneMapped: false,
    vertexShader: /* glsl */`
      uniform float uTime; varying vec2 vUv;
      void main() {
        vec4 c = modelViewMatrix * vec4(${glowAt.x.toFixed(4)}, ${glowAt.y.toFixed(4)}, ${glowAt.z.toFixed(4)}, 1.);
        float s = 1.5 + .08 * sin(uTime * 11.);
        vUv = position.xy * 2.; gl_Position = projectionMatrix * (c + vec4(position.xy * s + vec2(0., .25), 0., 0.));
      }`,
    fragmentShader: /* glsl */`
      varying vec2 vUv;
      void main() { float d = length(vUv); gl_FragColor = vec4(vec3(1., .45, .12) * .55 * pow(max(0., 1. - d), 2.2), 1.); }`,
  }));
  glow.renderOrder = 2; glow.frustumCulled = false;
  group.add(glow);
  // Embers: rising off the blade, up the screen whichever way the bat lies.
  const embers = 70, at = new Float32Array(embers * 3), es = new Float32Array(embers * 2);
  for (let i = 0; i < embers; i++) { const p = shoulder.clone().lerp(toe, rand(i + 9.9)); at.set([p.x, p.y, p.z], i * 3); es.set([rand(i + 3.3), rand(i + 7.7)], i * 2); }
  const eg = new THREE.BufferGeometry();
  eg.setAttribute('position', new THREE.BufferAttribute(at, 3));
  eg.setAttribute('aSeed', new THREE.BufferAttribute(es, 2));
  const ember = new THREE.Points(eg, pointsMaterial(/* glsl */`
    uniform float uTime; uniform float uPixels; attribute vec2 aSeed; varying vec3 vColour; varying float vAlpha;
    void main() {
      float life = 1.1 + .6 * aSeed.y, phase = fract(uTime / life + aSeed.x), age = phase * life;
      vec4 c = modelViewMatrix * vec4(position, 1.);
      vec3 up = normalize((viewMatrix * vec4(0., 1., 0., 0.)).xyz);
      vec3 right = normalize(cross(up, normalize(-c.xyz)));
      c.xyz += up * (.3 + 1.3 * age) + right * sin(age * 5. + aSeed.y * 9.) * .12 * age;
      gl_Position = projectionMatrix * c;
      gl_PointSize = .028 * uPixels / -c.z;
      vColour = mix(vec3(1., .85, .4), vec3(1., .35, .08), phase); vAlpha = 1. - phase;
    }`, uniforms));
  ember.frustumCulled = false; ember.renderOrder = 4;
  group.add(ember);
  return group;
}

export class Podium {
  readonly group = new THREE.Group();
  /** The bat's flames: hung on the bat by whoever holds it. */
  readonly fire: THREE.Group;
  private readonly uniforms = { uTime: { value: 0 }, uPixels: { value: 800 }, uSmoke: { value: new THREE.Color(0xc9cbd6) } };
  private readonly night: THREE.Object3D;
  private readonly owned: { dispose(): void }[] = [];

  constructor(card: PodiumCard, blade: [toe: THREE.Vector3, shoulder: THREE.Vector3], night: boolean) {
    const { group, uniforms } = this;
    const s10 = card.brand === 'super10';
    const fascia = s10 ? fasciaS10(card) : fasciaTexture(card), score = s10 ? scoreS10(card) : scoreTexture(card);
    const emblem = s10 ? emblemS10() : emblemTexture(card), blocks = s10 ? blocksS10() : blocksTexture(card);
    this.owned.push(fascia, score, emblem, blocks);
    // Super10's: an ink deck, a violet arch with a mist trim, the block's top violet, lime left to the score alone.
    const navy = new THREE.MeshStandardMaterial({ color: s10 ? ARENA.ink : 0x1a2c44, roughness: .5, metalness: .1 });
    const modeColour = s10 ? hex(ARENA.violet) : card.mode;
    const mode = new THREE.MeshStandardMaterial({ color: modeColour, emissive: modeColour, emissiveIntensity: .35, roughness: .45 });
    const trimColour = s10 ? S10.mist : C.orange;
    const orange = new THREE.MeshStandardMaterial({ color: trimColour, emissive: trimColour, emissiveIntensity: .3, roughness: .45 });
    const topColour = s10 ? S10.violet : C.gold;
    const gold = new THREE.MeshStandardMaterial({ color: topColour, emissive: topColour, emissiveIntensity: .25, roughness: .35, metalness: .3 });
    // The deck, its top lip, and its printed front.
    const deck = new THREE.Mesh(new THREE.BoxGeometry(DECK.width, DECK.height, DECK.depth), navy);
    deck.position.set(0, DECK.height / 2, -DECK.depth / 2);
    const lip = new THREE.Mesh(new THREE.BoxGeometry(DECK.width + .12, .07, DECK.depth + .12), mode);
    lip.position.set(0, DECK.height, -DECK.depth / 2);
    const front = new THREE.Mesh(new THREE.PlaneGeometry(DECK.width, DECK.height), printed(fascia, .6));
    front.position.set(0, DECK.height / 2, .002);
    // The block he stands on, the score on its front.
    const block = new THREE.Mesh(new THREE.BoxGeometry(BLOCK.width, BLOCK.height, BLOCK.depth), navy);
    block.position.set(PODIUM_TOP.x, DECK.height + BLOCK.height / 2, PODIUM_TOP.z);
    const blockTop = new THREE.Mesh(new THREE.BoxGeometry(BLOCK.width + .06, .05, BLOCK.depth + .06), gold);
    blockTop.position.set(PODIUM_TOP.x, DECK.height + BLOCK.height, PODIUM_TOP.z);
    const scoreFace = new THREE.Mesh(new THREE.PlaneGeometry(BLOCK.width, BLOCK.height), printed(score, .7));
    scoreFace.position.set(PODIUM_TOP.x, DECK.height + BLOCK.height / 2, PODIUM_TOP.z + BLOCK.depth / 2 + .002);
    // The arch, the emblem in it, and its trim.
    const archAt = -DECK.depth + .45;
    const arch = new THREE.Mesh(archGeometry(6.8, 7.4, .75, .55), mode);
    arch.position.set(0, DECK.height, archAt);
    const trim = new THREE.Mesh(archGeometry(5.3, 6.65, .14, .6), orange);
    trim.position.set(0, DECK.height, archAt + .02);
    const disc = new THREE.Mesh(new THREE.CircleGeometry(2.45, 64), printed(emblem, .55));
    disc.position.set(0, DECK.height + 4.05, archAt - .2);
    // The printed blocks, either side of the deck and on its back corners.
    const sheet = printed(blocks, .5), stacks = new THREE.Group();
    const cubes: [number, number, number, number, number, number[]][] = [
      [-6.0, .85, -1.6, 1.7, .08, [0, 5, 2, 7, 9, 12]], [-6.1, 2.55, -1.7, 1.7, -.05, [3, 6, 1, 11, 4, 14]], [-7.8, .7, -2.2, 1.4, .12, [8, 13, 10, 15, 2, 5]],
      [-4.3, 1.45, -4.3, 1.3, -.1, [6, 4, 14, 1, 3, 9]], [-6.6, 4.0, -2.0, 1.2, .2, [12, 2, 7, 0, 10, 6]],
      [6.0, .85, -1.6, 1.7, -.08, [1, 9, 4, 13, 6, 0]], [6.1, 2.55, -1.7, 1.7, .05, [10, 7, 12, 2, 15, 3]], [7.8, .7, -2.2, 1.4, -.12, [14, 3, 5, 8, 11, 1]],
      [4.3, 1.45, -4.3, 1.3, .1, [11, 15, 0, 6, 8, 13]], [6.6, 4.0, -2.0, 1.2, -.2, [5, 0, 9, 3, 12, 7]],
    ];
    for (const [x, y, z, edge, turn, tiles] of cubes) {
      const cube = new THREE.Mesh(blockGeometry(edge, tiles), sheet);
      cube.position.set(x, y, z); cube.rotation.y = turn; stacks.add(cube);
    }
    for (const mesh of [deck, lip, front, block, blockTop, scoreFace, arch, trim, disc]) { mesh.castShadow = mesh !== front && mesh !== scoreFace; mesh.receiveShadow = true; group.add(mesh); }
    stacks.children.forEach(cube => { cube.castShadow = true; cube.receiveShadow = true; });
    group.add(stacks);
    // The fountains along the deck's front and at its back corners.
    const sparks = fountains([
      new THREE.Vector3(-4.3, DECK.height, -.25), new THREE.Vector3(-2.6, DECK.height, -.25), new THREE.Vector3(2.6, DECK.height, -.25), new THREE.Vector3(4.3, DECK.height, -.25),
      new THREE.Vector3(-4.6, DECK.height, -4.6), new THREE.Vector3(4.6, DECK.height, -4.6),
    ], uniforms, s10);
    sparks.frustumCulled = false; group.add(sparks);
    const haze = smoke(uniforms); haze.frustumCulled = false; group.add(haze);
    this.night = shells(uniforms, s10 ? [S10.violet, S10.white, S10.mist, S10.violet, S10.volt, S10.white] : [C.gold, C.orange, C.cream, C.blue, C.red, C.gold]); this.night.frustumCulled = false; this.night.visible = night; group.add(this.night);
    if (!night) uniforms.uSmoke.value.set(0xf1ece4);
    this.fire = flames(blade[0], blade[1], uniforms);
  }
  update(seconds: number, pixels: number) { this.uniforms.uTime.value = seconds; this.uniforms.uPixels.value = pixels; }
  dispose() {
    this.group.removeFromParent(); this.fire.removeFromParent();
    for (const root of [this.group, this.fire]) root.traverse(object => {
      if (object instanceof THREE.Mesh || object instanceof THREE.Points) {
        object.geometry.dispose(); [object.material].flat().forEach(m => m.dispose());
      }
    });
    this.owned.forEach(o => o.dispose());
  }
}
