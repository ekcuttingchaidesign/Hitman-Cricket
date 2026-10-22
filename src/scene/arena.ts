import * as THREE from 'three';
import { Batch, mat } from './build';
import { EAVES, STADIUM, stadium, type StadiumLights } from './stadium';
import { seeded } from './turf';
import type { Milestone } from '../game/milestone';
import { paintFilm, type Film, type Playing } from '../ui/Lottie';
import { banners, flags, waveAt, type CrowdLife } from './crowdLife';

/**
 * The arena: Super10's ground, played under lights and nowhere else, dressed
 * by the Super10 brand sheet (Figma section 17, node `467:5197`): ink night,
 * violet light, lime for the one thing that is charged, raspberry only when a
 * batter is out.
 *
 * It is the stadium's bowl (`stadium.ts`) with what makes a ground read as
 * new where a phone looks, which is the far end and the sky over it:
 *
 * - **A ring of fire.** No towers: the light is one ring of lamps round the
 *   edge of the roof, as at the Dubai International Stadium, with a glow on
 *   every few metres of it (the stadium's `glows`).
 * - **LED round the bowl.** The roof's fascia is a halo of LED in violet, the
 *   floodlights' wash; the front of the upper tier is a ribbon of LED board,
 *   and so is the ring of boards along the rope: both show the brand's board
 *   states (`BOARDS`), the lime mark and violet slashes drifting at the lean
 *   when nothing is happening, dimmed to 40% while the ball is live.
 * - **The two sides' supporters.** The stands in the sides' colours, a
 *   section each in turn, rather than the stadium's summer whites.
 * - **A city behind it**, under a sky the floodlights' violet has got into.
 * - **The big screen.** Where the commentary box was, over the far end: the
 *   mark, the score and who is in, in the brand's lettering, and the moment's
 *   word slammed on when there is one. `?screen=0` puts the commentary box
 *   back instead, for when the screen does not earn its place.
 * - **The eyeline dark.** The sightscreen and the covered seats behind the
 *   bowler's arm are ink, still and blank: the batter has to see the ball.
 *
 * And it reacts (`arenaFrame`) by the sheet's ground rules: light, not paint
 * (the grass, the pitch and the kits are never coloured); lime is a budget
 * (a tenth of any view at most, one thing at a time charged); no strobe
 * (nothing flashes more than three times a second, nothing flashes the whole
 * frame); a wicket means out (raspberry for a dismissal and for nothing else).
 */

/** The brand's colours (the sheet's C · Colour), changed here, changed everywhere. */
export const ARENA = {
  /** The ground: night, backgrounds, LED boards, sightscreens. */
  ink: 0x12052b,
  /** The slab behind every word, and the mark's outline. */
  plate: 0x2a0e5c,
  /** Secondary energy: shards, haze, the floodlights' wash, the halo. */
  violet: 0x8b5cf6,
  /** The charge. One thing at a time. */
  volt: 0xc6ff1a,
  /** Only the shaded side of lime lettering. */
  voltDeep: 0x93d400,
  white: 0xffffff,
  /** Only the shaded side of white lettering. */
  mist: 0xe4e1f2,
  /** Dismissals only: OUT, BOWLED, WICKET. Never decoration. */
  wicket: 0xff2e63,
  /** The ring of lamps: a cool white, where the stadium's lamps are warm. */
  lamp: 0xf2f6ff,
  /** The screen's frame, and the bars it stands on. */
  frame: 0x1b1430,
} as const;

/** The sky over it, the floodlights' violet got into the night: see `Sky.time`. */
export const ARENA_SKY = { zenith: 0x0d0726, horizon: 0x2c1d5c } as const;

/** The two sides in the stands, a section each in turn: a blue side and a yellow one, with the odd white shirt. */
export const ARENA_CROWD: readonly (readonly number[])[] = [
  [0x1f4fd6, 0x163a9e, 0x1f4fd6, 0xf2ede1, 0x2a62ff, 0x111418, 0x1f4fd6, 0xffffff, 0x163a9e],
  [0xffd23f, 0xf2b91c, 0xffd23f, 0x111418, 0xffe36e, 0xf2ede1, 0xffd23f, 0xffffff, 0xf2b91c],
];

/** `?screen=0` builds the commentary box in place of the big screen. */
export const screenFrom = (search: string) => new URLSearchParams(search).get('screen') !== '0';

/** Where the lit pieces stand, from the middle of the ground (the stands are centred on it, ten metres up the pitch). */
const CENTRE_Z = 10;
/** The roof's front edge, its fascia's height, and the ring of lamps over it. */
const HALO = { radius: 35.78, y: EAVES + .3, height: .8 } as const;
const LAMPS = { radius: 35.85, y: EAVES + 1.18, height: .42, every: 3 } as const;
/** The front of the upper tier, which the ribbon covers. */
const RIBBON = { radius: 40.62, y: 4.95, height: .5 } as const;
/** The city, well beyond the stands, round the far half of the ground only: nobody looks behind them. */
const CITY = { radius: 120, height: 46, from: -1, arc: 3.3 } as const;
/**
 * The big screen: over the far end on the roof, tipped to the crease. A
 * phone has it in the band between the score bar and the roof's edge, so it
 * stands clear of the ring of lamps (lower, its foot went behind them) and
 * no taller than that band.
 */
export const SCREEN = { width: 11.5, height: 4.3, bottom: EAVES + 1.85, z: CENTRE_Z + 37.6 } as const;

/** Builds the arena's stands onto `world`; the rest of it is `Arena`, which `GameScene` hangs in its own frame. */
export function arenaStands(world: THREE.Object3D, screen = true): StadiumLights {
  const lights = stadium(world, { crowd: ARENA_CROWD, towers: false, roofLamps: false, commentary: !screen, eyeline: ARENA.ink, lively: true });
  // The ring of fire's glow: one every few degrees, round the whole roof.
  for (let degrees = 0; degrees < 360; degrees += LAMPS.every) {
    const a = THREE.MathUtils.degToRad(degrees);
    lights.roof.push(new THREE.Vector3(Math.sin(a) * (LAMPS.radius - .3), LAMPS.y, CENTRE_Z + Math.cos(a) * (LAMPS.radius - .3)));
  }
  return lights;
}


export type ArenaMood = 'calm' | 'surge' | 'death';
export type ArenaCue = 'four' | 'six' | 'wicket' | 'milestone' | 'surge' | 'death';
/** What the LED boards show: the sheet's G · LED board states, and a word on its plate for the rest. */
export type BoardState = 'idle' | 'four' | 'six' | 'wicket' | 'word';

/**
 * How long each moment holds the arena, what it says, and the board it puts
 * up. The boundaries' and the wicket's are the brand's stings' lengths, so
 * the drawn word and a sting (`STINGS`) last the same.
 */
export const CUES: Record<ArenaCue, { ms: number; word: string; board: BoardState }> = {
  four: { ms: 2300, word: 'FOUR', board: 'four' },
  six: { ms: 2900, word: 'SIX', board: 'six' },
  wicket: { ms: 2600, word: 'OUT', board: 'wicket' },
  milestone: { ms: 3600, word: '50', board: 'word' },
  surge: { ms: 2600, word: 'POWER SURGE', board: 'word' },
  death: { ms: 2600, word: 'DEATH OVERS', board: 'word' },
};

/** What a milestone puts on the boards and the screen: figures, not words, for numbers. */
export const MILESTONE_WORDS: Record<Milestone, string> = {
  fifty: '50', century: '100', 'six-sixes': '6 SIXES', raise: '150', double: '200', triple: '300', four: '400',
};

/** What the arena shows at a moment: see `arenaFrame`. */
export interface ArenaFrame {
  /** The halo round the roof. */
  halo: THREE.Color;
  /** How bright the LED boards are, nought to one: 40% for the idle board while the ball is live. */
  boards: number;
  board: BoardState;
  /** How fast the boards run round the ground, in laps of their pattern a second. */
  chase: number;
  /** What the screen and the boards say, or nothing. */
  word: string | null;
  /** How far through its moment the word is, for the screen's slam and its leave. */
  since: number;
}

const colour = (hex: number) => new THREE.Color(hex);
const fade = (t: number, from: number, to: number) => THREE.MathUtils.clamp((t - from) / (to - from), 0, 1);
/** The idle boards' drift, at the lean: slow enough to read, never still. */
const DRIFT = .012;
/** Nothing flickers faster than three times a second: the sheet's NO STROBE. */
export const MOST_FLASHES = 3;
/** On, off, on: a crackle, `count` flashes at the most there are, from `since`. */
const crackle = (since: number, count: number) => {
  const period = 1000 / MOST_FLASHES;
  return since >= 0 && since < count * period && since % period < period * .5;
};

/**
 * The arena at `now`, in its mood and with the moment last cued: a function
 * of the clock and nothing else, so any moment can be asked for on its own
 * and the tests can hold each to the sheet. `live` is a ball on its way, when
 * the idle boards stand at 40%; `still` is reduced motion: the colours and
 * the words change, and nothing flickers, runs or sweeps.
 */
export function arenaFrame(mood: ArenaMood, cue: { kind: ArenaCue; at: number; word?: string } | null, now: number, still = false, live = false): ArenaFrame {
  const halo = colour(ARENA.violet);
  // Power Surge charges the roof: lime, breathing, the one thing lit.
  if (mood === 'surge') halo.set(ARENA.volt).multiplyScalar(still ? 1 : .78 + .22 * Math.cos(now / 1000 * Math.PI * 1.6));
  const frame: ArenaFrame = { halo, boards: live ? .4 : 1, board: 'idle', chase: still ? 0 : DRIFT, word: null, since: Infinity };
  const since = cue ? now - cue.at : Infinity;
  if (!cue || since < 0 || since >= CUES[cue.kind].ms) {
    // The death overs crackle: three lime flickers on the violet every few seconds, while nothing else has the roof.
    if (mood === 'death' && !still && crackle(now % 2600, 3)) halo.set(ARENA.volt);
    return frame;
  }
  const { ms, word, board } = CUES[cue.kind];
  Object.assign(frame, { word: cue.word ?? word, board, boards: 1, since });
  // Every moment lets go over its last half second, back into the mood.
  const hold = 1 - fade(since, ms - 500, ms);
  const lime = colour(ARENA.volt);
  switch (cue.kind) {
    case 'four':
      // Struck lime in an instant and settled back to violet; the boards race.
      halo.lerp(lime, (1 - fade(since, 100, 600)) * hold);
      frame.chase = still ? 0 : .5 * hold;
      break;
    case 'six':
      // The roof crackles lime on violet and the boards chase round the
      // ground. (Six searchlights swept the sky over the far end too, and were
      // taken down: too much going on behind the bowler.)
      if (still || crackle(since, 3)) halo.lerp(lime, hold);
      frame.chase = still ? 0 : .8 * hold;
      break;
    case 'wicket':
      // The lights go down the way the news goes, to the plate's dark, and come back.
      halo.lerp(colour(ARENA.plate), Math.min(fade(since, 0, 300), hold)).multiplyScalar(1 - .6 * Math.min(fade(since, 0, 300), hold));
      frame.chase = 0;
      break;
    case 'milestone':
      // The charge breathes on the roof.
      halo.lerp(lime, (still ? 1 : .6 + .4 * Math.cos(since / 1000 * Math.PI * 2)) * hold);
      frame.chase = still ? 0 : .3 * hold;
      break;
    case 'surge':
      if (still || crackle(since, 3)) halo.lerp(lime, hold);
      frame.chase = still ? 0 : .6 * hold;
      break;
    case 'death':
      if (!still && crackle(since, 3)) halo.lerp(lime, hold);
      frame.chase = still ? 0 : -.4 * hold;
      break;
  }
  return frame;
}

/** What the screen shows between moments. */
export interface Scoreboard { title: string; score: string; detail: string }

/** One canvas painted into a texture, sRGB, kept with its context. */
function painted(width: number, height: number) {
  const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
  const context = canvas.getContext('2d')!;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return { canvas, context, texture };
}

const hex = (c: number) => `#${c.toString(16).padStart(6, '0')}`;
/** The brand's lettering face, and the tracked line under it. */
const SAIRA = (size: number) => `italic 900 ${size}px Saira, "Arial Black", Impact, sans-serif`;
const SUB = (size: number) => `italic 700 ${size}px Saira, "Arial Narrow", Arial, sans-serif`;
/** The rise, 6° up to the right, and the lean, 12°: the two angles every shape is drawn on. */
const RISE = 6 * Math.PI / 180, LEAN = 12 * Math.PI / 180;
/** A figure, or a word with one in it: those get the lime face (the one number that matters). */
const numeric = (word: string) => /^[+\d]/.test(word);

/** The marks off the sheet (B · The mark): the primary for the screen, the one-colour lime for the boards. */
const MARKS = {
  primary: new URL('../assets/super10/mark.png', import.meta.url).href,
  lime: new URL('../assets/super10/mark-lime.png', import.meta.url).href,
};
function picture(src: string, ready: () => void) {
  const image = new Image();
  image.onload = ready; image.src = src;
  return image;
}

/** A slash: a parallelogram leaning 12°, corners sharp. */
function slash(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, fill: string) {
  const run = h * Math.tan(LEAN);
  ctx.fillStyle = fill;
  ctx.beginPath(); ctx.moveTo(x + run, y); ctx.lineTo(x + w + run, y); ctx.lineTo(x + w, y + h); ctx.lineTo(x, y + h); ctx.closePath(); ctx.fill();
}

/** A lightning shard: a long wedge from a blunt tail to a point, leaning with the rise. */
function shard(ctx: CanvasRenderingContext2D, x: number, y: number, length: number, thick: number, fill: string) {
  ctx.fillStyle = fill;
  ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + length, y - thick * .35); ctx.lineTo(x + length * .18, y + thick); ctx.closePath(); ctx.fill();
}

/**
 * The sheet's lettering (D · Type), step by step: Saira Black Italic in
 * capitals; the face white, its lower right cut away in Mist on the diagonal
 * 56% of the way across each letter; an outline in Plate 9% of the cap height
 * with mitred corners; set on a Plate slab pointed at the left and rising 6°,
 * a lime shard over it and a violet one under; a figure's face lime, cut in
 * Volt deep. Drawn centred on (`x`, `y`), `size` the cap height's font size,
 * scaled down to `fit` across. `slab` is the plate's colour: raspberry for a
 * dismissal and nothing else.
 */
function lettering(ctx: CanvasRenderingContext2D, word: string, x: number, y: number, size: number, fit: number, slab: number = ARENA.plate, scale = 1, alpha = 1) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.font = SAIRA(size);
  const width = ctx.measureText(word).width, cap = size * .72;
  const s = Math.min(1, fit / (width + size * .6)) * scale;
  ctx.translate(x, y); ctx.rotate(-RISE); ctx.scale(s, s);
  const half = width / 2, padX = size * .32, padY = cap * .42;
  // The slab, pointed at the left, square at the right.
  ctx.fillStyle = hex(slab);
  ctx.beginPath();
  ctx.moveTo(-half - padX * 1.6, 0); ctx.lineTo(-half - padX * .4, -cap / 2 - padY); ctx.lineTo(half + padX, -cap / 2 - padY);
  ctx.lineTo(half + padX, cap / 2 + padY); ctx.lineTo(-half - padX * .4, cap / 2 + padY); ctx.closePath(); ctx.fill();
  // A lime shard over it, a violet one under.
  shard(ctx, -half - padX * .2, -cap / 2 - padY * .9, width * .55, cap * .16, hex(ARENA.volt));
  shard(ctx, half - width * .5, cap / 2 + padY * .9, width * .55, cap * .14, hex(ARENA.violet));
  ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
  ctx.lineJoin = 'miter'; ctx.lineWidth = cap * .09 * 2; ctx.strokeStyle = hex(ARENA.plate);
  let pen = -half;
  for (const ch of word) {
    const w = ctx.measureText(ch).width;
    if (ch !== ' ') {
      const lime = numeric(word) && /[+\d]/.test(ch);
      ctx.strokeText(ch, pen, 0);
      ctx.fillStyle = hex(lime ? ARENA.volt : ARENA.white); ctx.fillText(ch, pen, 0);
      // The cut: the letter's lower right, on the diagonal, in the shaded colour.
      ctx.save();
      ctx.beginPath(); ctx.moveTo(pen + w * .56, cap / 2 + 2); ctx.lineTo(pen + w * 1.1, cap / 2 + 2); ctx.lineTo(pen + w * 1.1, -cap * .1); ctx.closePath(); ctx.clip();
      ctx.fillStyle = hex(lime ? ARENA.voltDeep : ARENA.mist); ctx.fillText(ch, pen, 0);
      ctx.restore();
    }
    pen += w;
  }
  ctx.restore();
}

/** The tracked line under a word: Saira Bold Italic, tracking 30%. */
function sub(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, size: number, fill: string) {
  ctx.save();
  ctx.font = SUB(size); ctx.fillStyle = fill; ctx.textBaseline = 'middle'; ctx.textAlign = 'center';
  (ctx as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing = `${size * .3}px`;
  ctx.translate(x, y); ctx.rotate(-RISE); ctx.fillText(text, 0, 0);
  ctx.restore();
}

/**
 * One panel of LED board, 640 by 128, in a board state (the sheet's G):
 * idle, the lime mark and violet slashes on ink; four, full lime with ink
 * letters and slashes; six, plate with a lime SIX over MAXIMUM; wicket,
 * raspberry with white letters; and a word on its plate for the rest. The
 * ring repeats it `panels` times; seen from inside, it runs backwards
 * unless the repeat is negative.
 */
function boardPanel(state: BoardState, word: string, panels: number, mark: HTMLImageElement | null) {
  const W = 640, H = 128;
  const { context: ctx, texture } = painted(W, H);
  const write = (text: string, x: number, fill: string, size = 92) => {
    ctx.save(); ctx.font = SAIRA(size); ctx.fillStyle = fill; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
    ctx.translate(x, H / 2 + 4); ctx.fillText(text, 0, 0);
    const w = ctx.measureText(text).width; ctx.restore(); return w;
  };
  const slashes = (from: number, fill: string, n: number, w = 90, h = 16) => { for (let i = 0; i < n; i++) slash(ctx, from + i * (w + 24), H / 2 - h / 2, w, h, fill); };
  if (state === 'idle') {
    ctx.fillStyle = hex(ARENA.ink); ctx.fillRect(0, 0, W, H);
    for (const x of [24, 344]) {
      if (mark?.complete && mark.naturalWidth) ctx.drawImage(mark, x, 26, 150, 76);
      slash(ctx, x + 172, H / 2 - 6, 130, 12, hex(ARENA.violet));
    }
  } else if (state === 'four') {
    ctx.fillStyle = hex(ARENA.volt); ctx.fillRect(0, 0, W, H);
    const w = write(word, 30, hex(ARENA.ink));
    write('+4', 30 + w + 34, hex(ARENA.ink));
    slashes(30 + w + 160, hex(ARENA.plate), 3);
  } else if (state === 'six') {
    ctx.fillStyle = hex(ARENA.plate); ctx.fillRect(0, 0, W, H);
    const w = write(word, 30, hex(ARENA.volt));
    ctx.save(); ctx.font = SUB(30); ctx.fillStyle = '#fff'; ctx.textBaseline = 'middle';
    (ctx as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing = '9px';
    ctx.fillText('MAXIMUM', 30 + w + 30, H / 2 + 4); ctx.restore();
    slashes(470, hex(ARENA.volt), 2, 60, 14); slash(ctx, 610, H / 2 - 7, 60, 14, hex(ARENA.violet));
  } else if (state === 'wicket') {
    ctx.fillStyle = hex(ARENA.wicket); ctx.fillRect(0, 0, W, H);
    const w = write(word, 30, '#fff');
    slashes(30 + w + 60, hex(ARENA.plate), 3);
  } else {
    ctx.fillStyle = hex(ARENA.plate); ctx.fillRect(0, 0, W, H);
    ctx.save(); ctx.font = SAIRA(84);
    const fit = Math.min(1, 470 / ctx.measureText(word).width); ctx.restore();
    ctx.save(); ctx.translate(30, 0); ctx.scale(fit, 1);
    write(word, 0, hex(numeric(word) ? ARENA.volt : ARENA.white), 84); ctx.restore();
    slashes(520, hex(ARENA.violet), 1, 90);
  }
  texture.wrapS = THREE.RepeatWrapping;
  texture.repeat.x = -panels;
  return texture;
}

/** The lamps along the roof's edge: bright cells with dark frames between them. */
function lampTexture() {
  const { context: ctx, texture } = painted(64, 16);
  ctx.fillStyle = '#1d1730'; ctx.fillRect(0, 0, 64, 16);
  for (let x = 0; x < 64; x += 16) {
    const g = ctx.createLinearGradient(0, 2, 0, 14);
    g.addColorStop(0, '#ffffff'); g.addColorStop(1, '#d8d4ff');
    ctx.fillStyle = g; ctx.fillRect(x + 2, 3, 12, 10);
  }
  texture.wrapS = THREE.RepeatWrapping;
  return texture;
}

/** The halo's LED: a row of pixels in a housing, so it reads as lamps rather than paint. */
function haloTexture() {
  const { context: ctx, texture } = painted(64, 32);
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, 64, 32);
  ctx.fillStyle = '#fff';
  for (let x = 0; x < 64; x += 4) for (let y = 4; y < 28; y += 4) ctx.fillRect(x, y, 3, 3);
  texture.wrapS = THREE.RepeatWrapping;
  return texture;
}

/** A soft band of light either side of a line, for the halo's glow. */
function glowTexture() {
  const { context: ctx, texture } = painted(4, 128);
  const g = ctx.createLinearGradient(0, 0, 0, 128);
  g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(.42, 'rgba(255,255,255,.55)');
  g.addColorStop(.5, 'rgba(255,255,255,.8)'); g.addColorStop(.58, 'rgba(255,255,255,.55)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 4, 128);
  return texture;
}

/**
 * The city: towers and blocks in the night's ink against the sky, their
 * windows lit in warm and cool whites, the odd one violet, red lights on the
 * tallest, and the violet haze of the streets behind them. Only what stands
 * higher than the far roof is ever seen, so that is where the windows are.
 */
function cityTexture() {
  const W = 4096, H = 256;
  const { context: ctx, texture } = painted(W, H);
  const random = seeded(71);
  ctx.clearRect(0, 0, W, H);
  const haze = ctx.createLinearGradient(0, H * .3, 0, H * .62);
  haze.addColorStop(0, 'rgba(139,92,246,0)'); haze.addColorStop(1, 'rgba(139,92,246,.2)');
  ctx.fillStyle = haze; ctx.fillRect(0, H * .3, W, H * .32);
  let x = 0;
  while (x < W) {
    const w = 24 + random() * 70, tall = random() < .12;
    const top = H * (tall ? .05 + random() * .2 : .3 + random() * .25);
    ctx.fillStyle = random() < .5 ? '#0e0624' : '#140a30';
    ctx.fillRect(x, top, w, H - top);
    const warm = random() < .5;
    for (let y = top + 5; y < H * .66; y += 7) for (let wx = x + 4; wx < x + w - 4; wx += 6) {
      const r = random();
      if (r < .45) continue;
      ctx.fillStyle = r > .975 ? hex(ARENA.violet) : warm ? 'rgba(255,214,150,.8)' : 'rgba(214,214,255,.78)';
      ctx.fillRect(wx, y, 3, 3);
    }
    if (tall) {
      ctx.fillStyle = '#ff3b3b'; ctx.fillRect(x + w / 2 - 2, top - 5, 4, 4);
      if (random() < .4) { ctx.fillStyle = hex(ARENA.violet); ctx.fillRect(x, top, w, 3); }
    }
    x += w + random() * 6;
  }
  texture.wrapS = THREE.ClampToEdgeWrapping;
  return texture;
}

/**
 * The brand's stings (F · Motion): Lotties at 1024 by 384, thirty frames a
 * second, each a whole board on its own ground — violet for the boundaries,
 * raspberry for a wicket — and each letting its word go before its last
 * frame (`public/lotties/super10-<name>.json`). Played on the screen over
 * the drawn word, which shows until the film has loaded and stands in for it
 * under reduced motion.
 */
export const STINGS = ['four', 'six', 'bowled', 'out', 'duck'] as const;
export type Sting = typeof STINGS[number];
/** The sting a moment plays, if it has one: a wicket's by how he went. */
export function stingOf(kind: ArenaCue, word: string | null): Sting | null {
  if (kind === 'four' || kind === 'six') return kind;
  if (kind !== 'wicket') return null;
  return word === 'BOWLED' ? 'bowled' : word === 'DUCK' ? 'duck' : 'out';
}

/** The screen's slam: from big, overshooting once, settled by eleven frames; then, at the end, the leave. */
const SLAM_MS = 370, LEAVE_MS = 470;
export function slamScale(since: number) {
  if (since >= SLAM_MS) return 1;
  const t = since / SLAM_MS;
  // Out-expo down from 2.2 past 1 to .94, then back up to 1.
  const out = 1 - Math.pow(2, -10 * Math.min(1, t / .75));
  return t < .75 ? 2.2 - (2.2 - .94) * out : .94 + .06 * ((t - .75) / .25);
}

/**
 * The arena's lit pieces, hung in the scene's own frame rather than the
 * mirrored stage, so the screen and the boards' words read the right way
 * round whichever hand is batting; everything else is round, and the mirror
 * would change nothing.
 */
export class Arena {
  readonly textures: THREE.Texture[] = [];
  private halo: THREE.MeshBasicMaterial;
  private haloGlow: THREE.MeshBasicMaterial;
  private ribbon: THREE.MeshBasicMaterial;
  private screen: ReturnType<typeof painted> | null = null;
  private shown = '';
  private board: Scoreboard = { title: 'SUPER10', score: '0/0', detail: '' };
  private moodNow: ArenaMood = 'calm';
  private cued: { kind: ArenaCue; at: number; word?: string } | null = null;
  private boardsMaterial: THREE.MeshStandardMaterial | null = null;
  private panels = { boards: 30, ribbon: 100 };
  private faces = new Map<string, THREE.Texture>();
  private boardUp = '';
  private stumps: THREE.MeshStandardMaterial[] = [];
  private last: ArenaFrame | null = null;
  private marks: { primary: HTMLImageElement; lime: HTMLImageElement };
  private offset = 0;
  /** Reduced motion, as the last frame was drawn under. */
  private still = false;
  /** The sting playing, painted into a canvas of its own and laid over the screen. */
  private playing: { name: Sting; at: number; canvas: HTMLCanvasElement; film: Playing | null } | null = null;
  /** The crowd's clock and its wave: see `crowdLife.ts`. */
  private life: CrowdLife | null = null;
  private waveFrom = -Infinity;

  constructor(scene: THREE.Object3D, readonly hasScreen: boolean, anisotropy: number) {
    const ring = (radius: number, height: number, y: number, material: THREE.Material, top = radius) => {
      const mesh = new THREE.Mesh(new THREE.CylinderGeometry(top, radius, height, 180, 1, true), material);
      mesh.position.set(0, y, CENTRE_Z);
      mesh.name = 'Arena light';
      scene.add(mesh);
      return mesh;
    };
    // Once the pictures and the faces are in, everything painted is painted again.
    const repaint = () => { this.faces.forEach(t => t.dispose()); this.faces.clear(); this.boardUp = ''; this.shown = ''; };
    this.marks = { primary: picture(MARKS.primary, repaint), lime: picture(MARKS.lime, repaint) };
    document.fonts?.load(SAIRA(80)).then(() => document.fonts.load(SUB(40))).then(repaint).catch(() => {});

    const haloMap = haloTexture(); haloMap.repeat.x = -Math.round(2 * Math.PI * HALO.radius / 1.6); haloMap.anisotropy = anisotropy;
    this.halo = new THREE.MeshBasicMaterial({ map: haloMap, color: ARENA.violet, side: THREE.BackSide, fog: false, toneMapped: false });
    ring(HALO.radius, HALO.height, HALO.y, this.halo);
    // Its glow on the night either side of it: added light, so it sits on the roof and the sky alike.
    const band = glowTexture();
    this.haloGlow = new THREE.MeshBasicMaterial({ map: band, color: ARENA.violet, side: THREE.BackSide, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, toneMapped: false, opacity: .35 });
    ring(HALO.radius - .05, 3.4, HALO.y, this.haloGlow);

    const lamps = lampTexture(); lamps.repeat.x = -Math.round(2 * Math.PI * LAMPS.radius / 1.2); lamps.anisotropy = anisotropy;
    // Tipped down at the field: wider at the top than at the foot.
    ring(LAMPS.radius - .2, LAMPS.height, LAMPS.y, new THREE.MeshBasicMaterial({ map: lamps, color: new THREE.Color(ARENA.lamp), side: THREE.BackSide, fog: false, toneMapped: false }), LAMPS.radius + .15);

    // The ribbon: an LED board the length of the upper tier, a panel every two and a half metres.
    this.panels.ribbon = Math.round(2 * Math.PI * RIBBON.radius / (RIBBON.height * 5));
    this.ribbon = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.BackSide, fog: false, toneMapped: false });
    ring(RIBBON.radius, RIBBON.height, RIBBON.y, this.ribbon);

    const city = cityTexture(); city.anisotropy = anisotropy;
    const skyline = new THREE.Mesh(
      new THREE.CylinderGeometry(CITY.radius, CITY.radius, CITY.height, 96, 1, true, -CITY.arc / 2, CITY.arc),
      new THREE.MeshBasicMaterial({ map: city, side: THREE.BackSide, transparent: true, depthWrite: false, fog: false }),
    );
    skyline.position.set(0, CITY.from + CITY.height / 2, CENTRE_Z); skyline.name = 'Skyline';
    scene.add(skyline);


    if (hasScreen) this.buildScreen(scene, anisotropy);
    this.textures.push(haloMap, band, lamps, city);
  }

  /** The screen on its frame, on two legs off the roof, turned to the crease. */
  private buildScreen(scene: THREE.Object3D, anisotropy: number) {
    const { width, height, bottom, z } = SCREEN;
    const middle = bottom + height / 2;
    // The face and its frame turned together to look back down the pitch at
    // the crease, where the camera stands: a plane's front is its +z.
    const held = new THREE.Group();
    held.position.set(0, middle, z); held.lookAt(0, 2.9, -5.15);
    const surround = new THREE.Mesh(new THREE.BoxGeometry(width + .5, height + .5, .5), mat(ARENA.frame));
    surround.position.z = -.3; held.add(surround);
    // Two legs down to the roof.
    const b = new Batch();
    for (const x of [-width / 3, width / 3]) b.box(.45, bottom - EAVES + .4, .45, STADIUM.steel, x, (bottom + EAVES) / 2, z + .5);
    b.build(scene, { casts: false });
    scene.add(held);
    this.screen = painted(1024, 384);
    this.screen.texture.anisotropy = anisotropy;
    const face = new THREE.Mesh(new THREE.PlaneGeometry(width, height), new THREE.MeshBasicMaterial({ map: this.screen.texture, fog: false, toneMapped: false }));
    face.name = 'Big screen';
    held.add(face);
    this.textures.push(this.screen.texture);
    this.paintScreen(null);
  }

  /** The boards along the rope: in the arena they are its LED boards, not the sponsors'. `panels` is how many make a lap. */
  boards(material: THREE.MeshStandardMaterial, panels: number) {
    this.boardsMaterial = material; this.panels.boards = panels;
  }

  /** The batter's wicket, lit raspberry when it is broken, as LED stumps are: each piece given its own material. */
  wire(stumps: THREE.Mesh[]) {
    for (const mesh of stumps) {
      const material = (mesh.material as THREE.MeshStandardMaterial).clone();
      mesh.material = material; this.stumps.push(material);
    }
  }

  /** The stands' life: the clock the crowd moves to, and the flags and banners held up over the seats, hung in the scene's frame so a banner's words read the right way round. */
  crowd(life: CrowdLife, seats: THREE.Matrix4[], scene: THREE.Object3D) {
    this.life = life;
    flags(scene, seats, life);
    this.textures.push(banners(scene, seats, life).texture);
  }
  /** A Mexican wave sent round the stands from `now`. */
  wave(now: number) { this.waveFrom = now; }

  mood(mood: ArenaMood) { this.moodNow = mood; }
  cue(kind: ArenaCue, now: number, word?: string) {
    this.cued = { kind, at: now, word };
    this.stopSting();
    const name = stingOf(kind, word ?? CUES[kind].word);
    if (name && this.screen && !this.still) this.playSting(name, now);
  }
  scoreboard(board: Scoreboard) { this.board = board; }
  /** For the checks: the mood, the moment up, what the boards and the screen show. */
  get state() {
    const f = this.last;
    return { mood: this.moodNow, word: f?.word ?? null, board: f?.board ?? 'idle', boards: f?.boards ?? 1,
      screen: this.hasScreen ? this.shown.split('|').slice(0, 2).join('|') : null, sting: this.playing?.name ?? null,
      wave: +(this.life?.waveOn.value ?? 0).toFixed(2), front: +(this.life?.wave.value ?? 0).toFixed(2),
      halo: `#${this.halo.color.getHexString()}` };
  }

  /** `broken` is how long ago the batter's bails went, or less than nought; `live`, a ball on its way. */
  update(now: number, broken: number, still: boolean, live: boolean) {
    // A new innings starts the clock again from nought: a moment from the last one is let go.
    if (this.cued && now < this.cued.at) { this.cued = null; this.stopSting(); }
    if (now < this.waveFrom) this.waveFrom = -Infinity;
    if (this.life) {
      const wave = waveAt(now - this.waveFrom);
      this.life.time.value = now / 1000; this.life.still.value = still ? 1 : 0;
      this.life.wave.value = wave.at; this.life.waveOn.value = wave.on;
    }
    const f = arenaFrame(this.moodNow, this.cued, now, still, live);
    this.last = f; this.still = still;
    // A moment over, its sting goes with it.
    if (!f.word && this.playing) this.stopSting();
    this.halo.color.copy(f.halo); this.haloGlow.color.copy(f.halo);
    this.offset = (this.offset + f.chase * .016) % 1;
    this.ledBoards(f);
    if (this.screen) this.paintScreen(f);
    // The stumps lit raspberry once the bails go, flashing no more than three times a second.
    const lit = broken >= 0 && broken < 1600 ? (still || crackle(broken, 4) ? 1 : .3) : 0;
    for (const material of this.stumps) { material.emissive.setHex(ARENA.wicket); material.emissiveIntensity = lit * 1.4; }
  }

  /** The two LED boards, the ribbon and the rope's, in the frame's state, at its brightness, run round by its chase. */
  private ledBoards(f: ArenaFrame) {
    const key = `${f.board}|${f.word ?? ''}`;
    if (key !== this.boardUp) {
      this.boardUp = key;
      this.ribbon.map = this.face(f.board, f.word ?? '', this.panels.ribbon);
      this.ribbon.needsUpdate = true;
      if (this.boardsMaterial) {
        const map = this.face(f.board, f.word ?? '', this.panels.boards);
        this.boardsMaterial.map = map; this.boardsMaterial.emissiveMap = map;
      }
    }
    this.ribbon.color.setScalar(f.boards);
    (this.ribbon.map as THREE.Texture).offset.x = this.offset;
    if (this.boardsMaterial) {
      this.boardsMaterial.color.setScalar(f.boards); this.boardsMaterial.emissiveIntensity = f.boards;
      (this.boardsMaterial.map as THREE.Texture).offset.x = this.offset;
    }
  }

  /** A board state's panel for a ring of `panels`, painted once and kept. */
  private face(state: BoardState, word: string, panels: number) {
    const key = `${state}|${state === 'idle' ? '' : word}|${panels}`;
    let texture = this.faces.get(key);
    if (!texture) {
      texture = boardPanel(state, word, panels, this.marks.lime);
      this.faces.set(key, texture); this.textures.push(texture);
    }
    return texture;
  }

  private playSting(name: Sting, now: number) {
    const canvas = document.createElement('canvas'); canvas.width = 1024; canvas.height = 384;
    const context = canvas.getContext('2d');
    if (!context) return;
    this.playing = { name, at: now, canvas, film: paintFilm(context, `super10-${name}` as Film) };
  }
  private stopSting() { this.playing?.film?.destroy(); this.playing = null; }

  /**
   * The screen. Between moments: the mark, and the score in the brand's
   * lettering with who is in under it, painted only when it changes. In a
   * moment: its sting over the ink if there is one, or its word slammed on
   * and let go the way the news went, painted every frame while it moves.
   */
  private paintScreen(f: ArenaFrame | null) {
    const screen = this.screen!;
    const ctx = screen.context, W = 1024, H = 384;
    const word = f?.word ?? null, since = f?.since ?? Infinity;
    const kind = this.cued?.kind;
    const ms = kind ? CUES[kind].ms : 0;
    const moving = word !== null && (this.playing !== null || (!this.still && (since < SLAM_MS || since > ms - LEAVE_MS)));
    const key = word ? `w|${word}|${moving ? since : 'held'}` : `b|${this.board.title}|${this.board.score}|${this.board.detail}`;
    if (key === this.shown) return;
    this.shown = key;
    ctx.fillStyle = hex(ARENA.ink); ctx.fillRect(0, 0, W, H);
    // The floodlights' violet in the screen's corner, and nothing else behind.
    const haze = ctx.createRadialGradient(W * .15, H, 10, W * .15, H, W * .6);
    haze.addColorStop(0, 'rgba(139,92,246,.35)'); haze.addColorStop(1, 'rgba(139,92,246,0)');
    ctx.fillStyle = haze; ctx.fillRect(0, 0, W, H);
    if (word) {
      // Under reduced motion the word stands still: no slam, no leave.
      const leaving = this.still ? 0 : fade(since, ms - LEAVE_MS, ms);
      const slam = this.still ? 1 : slamScale(since);
      // Up and away for good news, down for a wicket.
      const drift = (kind === 'wicket' ? 1 : -1) * leaving * 90;
      const out = kind === 'wicket';
      const big = word.length <= 7;
      // A four's +4 stands in its own corner, the word moved over for it.
      const four = word === 'FOUR';
      lettering(ctx, word, four ? W / 2 - 90 : W / 2, H / 2 + (word === 'SIX' ? -26 : 0) + drift, big ? 190 : 120, four ? W - 380 : W - 120, out ? ARENA.wicket : ARENA.plate, slam, 1 - leaving);
      if (word === 'SIX') sub(ctx, 'MAXIMUM', W / 2, H - 70 + drift, 40, `rgba(255,255,255,${1 - leaving})`);
      if (four) lettering(ctx, '+4', W - 140, H / 2 - 60 + drift, 110, 210, ARENA.plate, this.still ? 1 : slamScale(since - 120), 1 - leaving);
      // The sting over it, its own ground covering the word once its first frame is in.
      if (this.playing) ctx.drawImage(this.playing.canvas, 0, 0, W, H);
    } else {
      const { title, score, detail } = this.board;
      const mark = this.marks.primary;
      // The mark down the left with its clear space; any other game's name in the lettering.
      if (title === 'SUPER10' && mark.complete && mark.naturalWidth) ctx.drawImage(mark, 40, 78, 440, 207);
      else lettering(ctx, title, 260, H / 2, 96, 400);
      lettering(ctx, score, 760, H / 2 - 34, 150, 420);
      sub(ctx, detail, 760, H / 2 + 112, 34, hex(ARENA.mist));
    }
    // The screen's pixels: a fine dark grid over all of it.
    ctx.fillStyle = 'rgba(0,0,0,.22)';
    for (let x = 0; x < W; x += 4) ctx.fillRect(x, 0, 1, H);
    for (let y = 0; y < H; y += 4) ctx.fillRect(0, y, W, 1);
    screen.texture.needsUpdate = true;
  }
}
