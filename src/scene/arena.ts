import * as THREE from 'three';
import { Batch, mat } from './build';
import { EAVES, STADIUM, stadium, type BigScreen, type StadiumLights } from './stadium';
import { seeded } from './turf';
import type { Milestone } from '../game/milestone';
import { filmFrames, prefetchFilms, type Film, type Frames } from '../ui/Lottie';
import { banners, flags, torches, waveAt, type CrowdLife } from './crowdLife';
import { LED, type WicketLights } from './wicket';
import { GAME } from '../config/gameplay';

/**
 * The arena: Super10's ground, played under lights and nowhere else. The
 * stadium's own night (`stadium.ts`, `LIGHTING.night`): its crowd, its white
 * sightscreen, its sky, so nothing about it reads as a painted set; and over
 * that what a new ground has that an old one does not, taken from real ones:
 *
 * - **A ring of LED floodlights on the roof's edge**, no towers: as at the
 *   Narendra Modi Stadium, whose 580 LEDs stand in a ring at the front of the
 *   canopy, which keeps its shadow off the field. Cool white, where the
 *   stadium's metal-halide towers are warm, with a glow every few metres.
 * - **Floodlights that answer the game**, as Wankhede's DMX-controlled LEDs
 *   do: a strike for a four, a crackle for a six, dimmed for a wicket,
 *   breathing for a milestone (`arenaFrame`'s `lamps`).
 * - **Phone torches in the stands**, a few always and more as the game gets
 *   tight: the death overs, Power Surge, a six (`torches`).
 * - **LED round the bowl**: the front of the upper tier is a ribbon of LED
 *   board, and so is the fence along the rope, both in the Super10 brand
 *   (Figma section 17, node `467:5197`) and showing its board states
 *   (`BOARDS`), the lime mark and violet slashes drifting at the lean when
 *   nothing is happening, dimmed to 40% while the ball is live.
 * - **A city behind it**, against the night's own sky.
 * - **The big screen.** Where the commentary box was, over the far end: the
 *   mark, the score and who is in, in the brand's lettering, and the brand's
 *   stings for the moments. `?screen=0` puts the commentary box back instead.
 *
 * The brand's ground rules hold where the brand is: the grass, the pitch and
 * the kits are never coloured; lime is a budget; nothing flashes more than
 * three times a second; raspberry is for a dismissal and nothing else.
 *
 * A purple LED halo round the roof's fascia, a violet sky, a crowd in two
 * sides' yellow and blue and an ink sightscreen were tried first, and read as
 * a worse night than the stadium's.
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

/** `?screen=0` builds the commentary box in place of the big screen. */
export const screenFrom = (search: string) => new URLSearchParams(search).get('screen') !== '0';

/** Where the lit pieces stand, from the middle of the ground (the stands are centred on it, ten metres up the pitch). */
const CENTRE_Z = 10;
/** The ring of lamps over the roof's front edge. */
const LAMPS = { radius: 35.85, y: EAVES + 1.18, height: .42, every: 3 } as const;
/** The ring at the night's own brightness, so a strike has somewhere to go. */
const LAMP_REST = .82;
/** The front of the upper tier, which the ribbon covers. */
const RIBBON = { radius: 40.62, y: 4.95, height: .5 } as const;
/** The city, well beyond the stands, round the far half of the ground only: nobody looks behind them. */
const CITY = { radius: 120, height: 46, from: -1, arc: 3.3 } as const;
/** The city behind the far half of the ground, as the arena has it and the canopy borrows it: its mesh, to hang in the scene's own frame. */
export function skyline(anisotropy: number) {
  const texture = cityTexture(); texture.anisotropy = anisotropy;
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(CITY.radius, CITY.radius, CITY.height, 96, 1, true, -CITY.arc / 2, CITY.arc),
    new THREE.MeshBasicMaterial({ map: texture, side: THREE.BackSide, transparent: true, depthWrite: false, fog: false }),
  );
  mesh.position.set(0, CITY.from + CITY.height / 2, CENTRE_Z); mesh.name = 'Skyline';
  return { mesh, texture };
}
/**
 * The big screen: over the far end on the roof, tipped to the crease. A
 * phone has it in the band between the score bar and the roof's edge, so it
 * stands clear of the ring of lamps (lower, its foot went behind them) and
 * no taller than that band.
 */
export const SCREEN = { width: 11.5, height: 4.3, bottom: EAVES + 1.85, z: CENTRE_Z + 37.6 } as const;

/** Builds the arena's stands onto `world`; the rest of it is `Arena`, which `GameScene` hangs in its own frame. */
export function arenaStands(world: THREE.Object3D, screen = true): StadiumLights {
  const lights = stadium(world, { towers: false, roofLamps: false, commentary: !screen, lively: true });
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
  /** How bright the ring of floodlights burns: one is the night's own, more a strike, less a dip. */
  lamps: number;
  /** The share of the crowd with a phone torch up, nought to one. */
  torches: number;
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
/** The floodlights at their strike: a flash is the lamps at this or over, coming up from under it. */
export const FLASH = 1.5;
/** Phone torches up in the stands: a few always, more as the game gets tight, most for a six or a milestone. */
export const TORCHES = { calm: .03, surge: .08, death: .14, moment: .22 } as const;

/**
 * The arena at `now`, in its mood and with the moment last cued: a function
 * of the clock and nothing else, so any moment can be asked for on its own
 * and the tests can hold each to the sheet. `live` is a ball on its way, when
 * the idle boards stand at 40%; `still` is reduced motion: the boards and
 * the words change, the lights dip and come back, and nothing flickers, runs
 * or strikes.
 */
export function arenaFrame(mood: ArenaMood, cue: { kind: ArenaCue; at: number; word?: string } | null, now: number, still = false, live = false): ArenaFrame {
  const frame: ArenaFrame = { lamps: 1, torches: TORCHES[mood], boards: live ? .4 : 1, board: 'idle', chase: still ? 0 : DRIFT, word: null, since: Infinity };
  const since = cue ? now - cue.at : Infinity;
  if (!cue || since < 0 || since >= CUES[cue.kind].ms) return frame;
  const { ms, word, board } = CUES[cue.kind];
  Object.assign(frame, { word: cue.word ?? word, board, boards: 1, since });
  // Every moment lets go over its last half second, back into the mood.
  const hold = 1 - fade(since, ms - 500, ms);
  const cheering = Math.max(frame.torches, TORCHES.moment * hold);
  switch (cue.kind) {
    case 'four':
      // The floodlights struck once and settled; the boards race.
      if (!still) frame.lamps = 1 + (FLASH - 1 + .1) * (1 - fade(since, 80, 600));
      frame.chase = still ? 0 : .5 * hold;
      break;
    case 'six':
      // The floodlights crackle, the boards chase round the ground, and the phones go up.
      if (!still && crackle(since, 3)) frame.lamps = FLASH + .1;
      frame.chase = still ? 0 : .8 * hold;
      frame.torches = cheering;
      break;
    case 'wicket':
      // The lights go down the way the news goes, and come back.
      frame.lamps = 1 - .55 * Math.min(fade(since, 0, 300), hold);
      frame.chase = 0;
      break;
    case 'milestone':
      // The floodlights breathe, short of a flash, and the phones go up.
      frame.lamps = 1 + .3 * (still ? 0 : .5 - .5 * Math.cos(since / 1000 * Math.PI * 2)) * hold;
      frame.chase = still ? 0 : .3 * hold;
      frame.torches = cheering;
      break;
    case 'surge':
      frame.chase = still ? 0 : .6 * hold;
      break;
    case 'death':
      frame.chase = still ? 0 : -.4 * hold;
      break;
  }
  return frame;
}

/**
 * The LED stumps' light (Figma section 18, B · The light, ball by ball), for
 * how long ago the batter's bails went: at rest the rings lime at 60% and the
 * crown and bails dark; as a bail lifts one white flash for two frames, then
 * crown, rings and bails at full raspberry, a dip to 30% once at 280 ms, full
 * again and held while the batter walks, and back to rest over the last 0.6
 * of three seconds. Under reduced motion: no flash and no dip, the raspberry
 * held and let go. Nothing changes while the ball is live, so a delivery
 * always comes out of the same dark.
 */
export interface StumpGlow { colour: number; level: number }
export function stumpLight(broken: number, still = false): { crown: StumpGlow; rings: StumpGlow; bails: StumpGlow } {
  const rest = { crown: { colour: ARENA.wicket, level: 0 }, rings: { colour: ARENA.volt, level: LED.rings }, bails: { colour: ARENA.wicket, level: 0 } };
  if (broken < 0 || broken >= 3000) return rest;
  const all = (colour: number, level: number) => ({ crown: { colour, level }, rings: { colour, level }, bails: { colour, level } });
  if (!still && broken < 66) return all(ARENA.white, 1);
  if (broken < 2400) return all(ARENA.wicket, !still && broken >= 280 && broken < 400 ? .3 : 1);
  // Back to rest: the raspberry going out, the rings' lime coming back.
  const t = (broken - 2400) / 600;
  return { crown: { colour: ARENA.wicket, level: 1 - t }, rings: t < .5 ? { colour: ARENA.wicket, level: 1 - t * 2 } : { colour: ARENA.volt, level: LED.rings * (t - .5) * 2 }, bails: { colour: ARENA.wicket, level: 1 - t } };
}

/**
 * The stumps' wrap (C · The wrap and the build): one map for all six, a
 * millimetre to the pixel at twice over — the 157 mm round by the timber's
 * height under the crown. Plate violet; at the foot the base cut in violet,
 * 90 mm up the leg side and falling away across at the rise, edged in lime;
 * and SUPER10 reading up from 120 mm, once to the keeper (u .25) and once to
 * the bowler (u .75), in Saira Black Italic with the 10 in volt.
 */
export function stumpWrap(height: number) {
  const mm = 2, round = 157, tall = Math.round((height - LED.crown) * 1000);
  const W = round * mm, H = tall * mm;
  const { context: ctx, texture } = painted(W, H);
  ctx.fillStyle = hex(ARENA.plate); ctx.fillRect(0, 0, W, H);
  const y = (fromFoot: number) => (tall - fromFoot) * mm;
  for (let px = 0; px < W; px++) {
    // How far round towards the leg side this column of the wrap is: its x on the stump, off side +1, leg side -1.
    const across = Math.sin(Math.PI / 2 + px / W * Math.PI * 2);
    const cut = 90 - 5.3 * (1 + across) / 2;
    ctx.fillStyle = hex(ARENA.violet); ctx.fillRect(px, y(cut), 1, cut * mm);
    ctx.fillStyle = hex(ARENA.volt); ctx.fillRect(px, y(cut + 3.5), 1, 3.5 * mm);
  }
  const mark = () => {
    for (const u of [.25, .75]) {
      ctx.save();
      ctx.translate(u * W, y(120)); ctx.rotate(-Math.PI / 2);
      ctx.font = `italic 900 ${42 * mm}px Saira, "Arial Black", Impact, sans-serif`;
      ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
      ctx.fillStyle = '#fff'; ctx.fillText('SUPER', 0, 0);
      ctx.fillStyle = hex(ARENA.volt); ctx.fillText('10', ctx.measureText('SUPER').width, 0);
      ctx.restore();
    }
  };
  mark();
  // Painted again over the plate once the face has loaded.
  document.fonts?.load(`italic 900 ${42 * mm}px Saira`).then(() => { mark(); texture.needsUpdate = true; }).catch(() => {});
  texture.wrapS = THREE.RepeatWrapping;
  return texture;
}

/** What the screen shows between moments. */
export interface Scoreboard { title: string; score: string; detail: string }

/** One canvas painted into a texture, sRGB, kept with its context. */
function painted(width: number, height: number) {
  const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
  // In memory rather than on the GPU, for the upload to WebGL: see the canopy's `bigScreen`.
  const context = canvas.getContext('2d', { willReadFrequently: true })!;
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
/** The game's own title, for the screen outside Super10 (`plain`). */
const LOGO = new URL('../assets/title.webp', import.meta.url).href;
/** The game's faces, as its screens set them: Jaro for the figures, Satoshi for the words. */
const JARO = (size: number) => `${size}px Jaro, "Arial Narrow", Impact, sans-serif`;
const SATOSHI = (size: number) => `800 ${size}px Satoshi, "Segoe UI", Arial, sans-serif`;
function picture(src: string, ready: () => void) {
  // The tests have no browser, and paint the boards without the marks.
  if (typeof Image === 'undefined') return null;
  const image = new Image();
  image.onload = ready; image.src = src;
  return image;
}

/** How wide the screen is drawn, whatever its canvas: everything on it is laid out on this. */
const SCREEN_WIDTH = 1024;
/**
 * The screen's frame while it moves: fifteen a second. The stings are made at
 * thirty, and every other frame of theirs is drawn (`STING_STEP`): the screen
 * is a small thing far off in a phone's picture, and each frame of it is a
 * film drawn, the screen painted over it and the lot sent to the GPU.
 */
const STING_FRAME_MS = 1000 / 15;
/** The stings' own frame, a thirtieth of a second, and how many of them go by between two drawn. */
const FILM_FRAME_MS = 1000 / 30, STING_STEP = 2;
const grids = new Map<string, HTMLCanvasElement>();
/**
 * A screen's pixels, a fine dark grid a line every four, drawn once a size
 * and laid over the screen whole: drawn line by line it was four hundred
 * rectangles every time the screen was painted, every frame of a sting.
 */
function pixels(W: number, H: number, alpha: number) {
  const key = `${W}x${H}@${alpha}`;
  let grid = grids.get(key);
  if (!grid) {
    grid = document.createElement('canvas'); grid.width = W; grid.height = H;
    const ctx = grid.getContext('2d')!;
    ctx.fillStyle = `rgba(0,0,0,${alpha})`;
    for (let x = 0; x < W; x += 4) ctx.fillRect(x, 0, 1, H);
    for (let y = 0; y < H; y += 4) ctx.fillRect(0, y, W, 1);
    grids.set(key, grid);
  }
  return grid;
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
  ctx.fillStyle = '#1b2028'; ctx.fillRect(0, 0, 64, 16);
  for (let x = 0; x < 64; x += 16) {
    const g = ctx.createLinearGradient(0, 2, 0, 14);
    g.addColorStop(0, '#ffffff'); g.addColorStop(1, '#e2eaff');
    ctx.fillStyle = g; ctx.fillRect(x + 2, 3, 12, 10);
  }
  texture.wrapS = THREE.RepeatWrapping;
  return texture;
}

/**
 * The city: towers and blocks a shade darker than the night sky behind them,
 * their windows lit in warm and cool whites, red lights on the tallest, and
 * the sodium glow of the streets low down. Only what stands higher than the
 * far roof is ever seen, so that is where the windows are.
 */
function cityTexture() {
  const W = 4096, H = 256;
  const { context: ctx, texture } = painted(W, H);
  const random = seeded(71);
  ctx.clearRect(0, 0, W, H);
  const haze = ctx.createLinearGradient(0, H * .3, 0, H * .62);
  haze.addColorStop(0, 'rgba(255,190,120,0)'); haze.addColorStop(1, 'rgba(255,190,120,.12)');
  ctx.fillStyle = haze; ctx.fillRect(0, H * .3, W, H * .32);
  let x = 0;
  while (x < W) {
    const w = 24 + random() * 70, tall = random() < .12;
    const top = H * (tall ? .05 + random() * .2 : .3 + random() * .25);
    ctx.fillStyle = random() < .5 ? '#0a1224' : '#0f182c';
    ctx.fillRect(x, top, w, H - top);
    const warm = random() < .5;
    for (let y = top + 5; y < H * .66; y += 7) for (let wx = x + 4; wx < x + w - 4; wx += 6) {
      const r = random();
      if (r < .45) continue;
      ctx.fillStyle = warm ? 'rgba(255,214,150,.8)' : 'rgba(214,226,255,.78)';
      ctx.fillRect(wx, y, 3, 3);
    }
    if (tall) {
      ctx.fillStyle = '#ff3b3b'; ctx.fillRect(x + w / 2 - 2, top - 5, 4, 4);
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

/** A ring of LED board the brand's states go on: how many panels make its lap, and, where it has a face of its own between moments (the rope's sponsors), that face, to go back to. */
interface LedBoard {
  material: THREE.MeshBasicMaterial | THREE.MeshStandardMaterial;
  panels: number;
  own: { map: THREE.Texture | null; emissiveMap: THREE.Texture | null; color: THREE.Color } | null;
}

/**
 * The brand's screen and LED boards, which any ground can carry: the
 * arena's ribbon, its rope and its screen, and the canopy's screen and the
 * boards along its rope. A moment cued (`cue`) puts its word on every board
 * and its sting on the screen for as long as the sheet gives it (`CUES`),
 * then lets go. Between moments a board that is the brand's shows the
 * brand's idle (the arena's), and one with a face of its own keeps it (the
 * sponsors along the canopy's rope), at the level the night lights it
 * (`lit`); the screen shows the mark and the score. Every frame is `arenaFrame`'s, and `update` hands
 * it on for a ground with more to light by it. Hung in the scene's own frame
 * rather than the mirrored stage, so the words read the right way round
 * whichever hand is batting.
 */
export class Showboards {
  readonly textures: THREE.Texture[] = [];
  private shown = '';
  private board: Scoreboard = { title: 'SUPER10', score: '0/0', detail: '' };
  private moodNow: ArenaMood = 'calm';
  private cued: { kind: ArenaCue; at: number; word?: string } | null = null;
  private boards: LedBoard[] = [];
  private faces = new Map<string, THREE.Texture>();
  private boardUp = '';
  private last: ArenaFrame | null = null;
  private marks: { primary: HTMLImageElement | null; lime: HTMLImageElement | null; logo: HTMLImageElement | null };
  /** The screen in the game's own colours rather than the brand's: see `branded`. */
  private plain = false;
  private offset = 0;
  /** What a board's own face is lit at between moments: see `lit`. */
  private level = 1;
  /** Reduced motion, as the last frame was drawn under. */
  private still = false;
  /** The sting playing, drawn a frame at a time into its canvas (`films`) and laid over the screen; `frame` is the one drawn, -1 before any. */
  private playing: { name: Sting; frame: number } | null = null;
  /** Each sting built and held still in a canvas of its own (`warm`), drawn at the frame the moment has reached. */
  private films = new Map<Sting, { canvas: HTMLCanvasElement; frames: Frames | null }>();

  constructor(private screen: BigScreen | null) {
    // Once the pictures and the faces are in, everything painted is painted again.
    const repaint = () => { this.faces.forEach(t => t.dispose()); this.faces.clear(); this.boardUp = ''; this.shown = ''; };
    this.marks = { primary: picture(MARKS.primary, repaint), lime: picture(MARKS.lime, repaint), logo: picture(LOGO, repaint) };
    if (typeof document !== 'undefined') {
      document.fonts?.load(SAIRA(80)).then(() => document.fonts.load(SUB(40))).then(repaint).catch(() => {});
      document.fonts?.load(JARO(80)).then(() => document.fonts.load(SATOSHI(30))).then(repaint).catch(() => {});
    }
    if (screen) this.paintScreen(null);
  }

  /**
   * A ring of LED board for the brand's states, `panels` to its lap. With
   * `own`, what it shows between moments is the face it has now, as the
   * boards along the rope keep their sponsors, and the brand's only in a
   * moment; without, the brand's idle.
   */
  ring(material: LedBoard['material'], panels: number, own = false) {
    const standard = material instanceof THREE.MeshStandardMaterial;
    this.boards.push({ material, panels, own: own ? { map: material.map, emissiveMap: standard ? material.emissiveMap : null, color: material.color.clone() } : null });
    this.boardUp = '';
  }
  /** The level a board's own face is lit at: the night's for the boards along the rope (`LIGHTING`'s `boards`), which the brand's face hands back to. */
  lit(level: number) { this.level = level; }

  mood(mood: ArenaMood) { this.moodNow = mood; }
  cue(kind: ArenaCue, now: number, word?: string) {
    this.cued = { kind, at: now, word };
    this.stopSting();
    const name = stingOf(kind, word ?? CUES[kind].word);
    if (name && this.screen && !this.still) this.playSting(name);
  }
  scoreboard(board: Scoreboard) { this.board = board; }
  /**
   * Whether the screen is the brand's, as it is for a Super10 innings and on
   * the arena, or the game's own: a Test at the canopy has the game's title
   * and the score in its faces on its navy, never the Super10 mark.
   */
  branded(on: boolean) {
    if (this.plain === !on) return;
    this.plain = !on; this.shown = '';
    if (this.screen) this.paintScreen(this.last);
  }
  /** Whether there is a screen for the moments to play on, which the call over the field then leaves them to. */
  get hasScreen() { return this.screen !== null; }
  /** For the checks: the mood, the moment up, what the boards and the screen show. */
  get state() {
    const f = this.last;
    return { mood: this.moodNow, word: f?.word ?? null, board: f?.board ?? 'idle', boards: f?.boards ?? 1,
      screen: this.screen ? this.shown.split('|').slice(0, 2).join('|') : null, sting: this.playing?.name ?? null };
  }

  /** The boards and the screen at `now`, and the frame they were drawn from, for a ground with more to light by it. `live` is a ball on its way. */
  update(now: number, still: boolean, live: boolean): ArenaFrame {
    // A new innings starts the clock again from nought: a moment from the last one is let go.
    if (this.cued && now < this.cued.at) { this.cued = null; this.stopSting(); }
    const f = arenaFrame(this.moodNow, this.cued, now, still, live);
    this.last = f; this.still = still;
    // A moment over, its sting goes with it.
    if (!f.word && this.playing) this.stopSting();
    this.offset = (this.offset + f.chase * .016) % 1;
    this.ledBoards(f);
    if (this.screen) this.paintScreen(f);
    return f;
  }

  /** The moment let go and every board back to what it shows between them: for a ground going out of sight under another's, which shares the rope's boards with it. */
  rest() {
    this.cued = null; this.stopSting(); this.last = null;
    this.ledBoards(arenaFrame(this.moodNow, null, 0));
    if (this.screen) this.paintScreen(null);
  }

  /** Every ring of board in the frame's state, at its brightness, run round by its chase; a board with a face of its own keeps it between moments. */
  private ledBoards(f: ArenaFrame) {
    const key = `${f.board}|${f.word ?? ''}`;
    const changed = key !== this.boardUp;
    this.boardUp = key;
    for (const { material, panels, own } of this.boards) {
      const standard = material instanceof THREE.MeshStandardMaterial;
      if (own && f.board === 'idle') {
        if (changed) {
          material.map = own.map; material.color.copy(own.color);
          if (standard) { material.emissiveMap = own.emissiveMap; material.emissiveIntensity = this.level; }
          material.needsUpdate = true;
        }
        continue;
      }
      if (changed) {
        const map = this.face(f.board, f.word ?? '', panels);
        material.map = map;
        if (standard) material.emissiveMap = map;
        material.needsUpdate = true;
      }
      material.color.setScalar(f.boards);
      if (standard) material.emissiveIntensity = f.boards;
      (material.map as THREE.Texture).offset.x = this.offset;
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

  private playSting(name: Sting) {
    this.film(name);
    this.playing = { name, frame: -1 };
  }
  /** A sting's canvas and its film, built the first time it is asked for: by `warm`, before the first moment. */
  private film(name: Sting) {
    let film = this.films.get(name);
    if (film) return film;
    // The film at the screen's own resolution: no bigger than the picture it is laid into.
    const width = this.screen?.context.canvas.width ?? SCREEN_WIDTH;
    const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = Math.round(width * 384 / 1024);
    film = { canvas, frames: null };
    this.films.set(name, film);
    // In memory, as the screen it is laid into is: drawn from the GPU onto it, every frame of the film was read back.
    const context = canvas.getContext('2d', { willReadFrequently: true });
    const held = film;
    if (context) void filmFrames(context, `super10-${name}` as Film).then(frames => { held.frames = frames; });
    return film;
  }
  /**
   * Everything a moment needs, made before the first one: the stings fetched,
   * and every ring's face for a four, a six and each wicket painted. Done at
   * the moment, the first FOUR of an innings fetched and unpacked its film and
   * painted the boards' face while the ball was in the air. Hands back the
   * faces, for the scene to send to the GPU.
   */
  warm(): THREE.Texture[] {
    if (this.screen && typeof document !== 'undefined') {
      prefetchFilms(STINGS.map(name => `super10-${name}` as Film));
      // One film built at a time, a moment apart, so no one frame of the walk out pays for all five.
      STINGS.forEach((name, i) => setTimeout(() => this.film(name), 300 * i));
    }
    const faces: THREE.Texture[] = [];
    for (const { panels } of this.boards) {
      faces.push(this.face('four', CUES.four.word, panels), this.face('six', CUES.six.word, panels));
      for (const word of ['OUT', 'BOWLED', 'DUCK']) faces.push(this.face('wicket', word, panels));
    }
    return faces;
  }
  private stopSting() { this.playing = null; }

  /**
   * The screen. Between moments: the mark, and the score in the brand's lettering with who is in
   * under it, painted only when it changes. In a moment: its sting over the
   * ink if there is one, or its word slammed on and let go the way the news
   * went, painted every frame while it moves.
   */
  private paintScreen(f: ArenaFrame | null) {
    const screen = this.screen!;
    const ctx = screen.context;
    // Drawn as if 1024 wide, onto a canvas of whatever size the ground gave it.
    const S = ctx.canvas.width / SCREEN_WIDTH, W = SCREEN_WIDTH, H = ctx.canvas.height / S;
    const word = f?.word ?? null, since = f?.since ?? Infinity;
    const kind = this.cued?.kind;
    const ms = kind ? CUES[kind].ms : 0;
    const moving = word !== null && (this.playing !== null || (!this.still && (since < SLAM_MS || since > ms - LEAVE_MS)));
    // A moving screen is painted once a frame of the stings' own thirty a second, not at every refresh.
    const key = word ? `w|${word}|${moving ? Math.floor(since / STING_FRAME_MS) : 'held'}` : `${this.plain ? 'p' : 'b'}|${this.board.title}|${this.board.score}|${this.board.detail}`;
    if (key === this.shown) return;
    this.shown = key;
    ctx.setTransform(S, 0, 0, S, 0, 0);
    if (this.plain && !word) { this.paintPlain(ctx, W, H); this.grid(ctx, .18); screen.texture.needsUpdate = true; return; }
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
      // The sting over it at the frame the moment has reached, its own ground covering the word once its film is built.
      const playing = this.playing, film = playing && this.films.get(playing.name);
      if (playing && film?.frames) {
        const frame = Math.min(film.frames.total - 1, Math.floor(since / FILM_FRAME_MS / STING_STEP) * STING_STEP);
        if (frame !== playing.frame) { film.frames.show(frame); playing.frame = frame; }
        ctx.drawImage(film.canvas, 0, 0, W, H);
      }
    } else {
      const { title, score, detail } = this.board;
      const mark = this.marks.primary;
      // The mark down the left with its clear space; any other game's name in the lettering.
      if (title === 'SUPER10' && mark?.complete && mark.naturalWidth) ctx.drawImage(mark, 40, 78, 440, 207);
      else lettering(ctx, title, 260, H / 2, 96, 400);
      lettering(ctx, score, 760, H / 2 - 34, 150, 420);
      sub(ctx, detail, 760, H / 2 + 112, 34, hex(ARENA.mist));
    }
    this.grid(ctx, .22);
    screen.texture.needsUpdate = true;
  }
  /**
   * The screen's pixels: a fine dark grid over all of it, in the canvas's own
   * pixels. Only on a screen drawn full size: on the canopy's, half that, a
   * line every few pixels beat against the phone's own and ran in bands
   * across it, and at its size on a phone no grid can be seen anyway.
   */
  private grid(ctx: CanvasRenderingContext2D, alpha: number) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (ctx.canvas.width >= SCREEN_WIDTH) ctx.drawImage(pixels(ctx.canvas.width, ctx.canvas.height, alpha), 0, 0);
  }
  /**
   * The game's own screen: its title down the left, and on the right the
   * game being played in its gold, the score in Jaro and the overs under it,
   * on the navy of its screens with the orange warming one corner.
   */
  private paintPlain(ctx: CanvasRenderingContext2D, W: number, H: number) {
    const ground = ctx.createLinearGradient(0, 0, 0, H);
    ground.addColorStop(0, '#1d3d58'); ground.addColorStop(1, '#0c1c2a');
    ctx.fillStyle = ground; ctx.fillRect(0, 0, W, H);
    const glow = ctx.createRadialGradient(W * .22, H * 1.05, 10, W * .22, H * 1.05, W * .5);
    glow.addColorStop(0, 'rgba(237,112,68,.35)'); glow.addColorStop(1, 'rgba(237,112,68,0)');
    ctx.fillStyle = glow; ctx.fillRect(0, 0, W, H);
    const logo = this.marks.logo;
    if (logo?.complete && logo.naturalWidth) {
      const w = 470, h = w * logo.naturalHeight / logo.naturalWidth;
      ctx.drawImage(logo, 28, (H - h) / 2, w, h);
    }
    ctx.fillStyle = 'rgba(255,255,255,.16)'; ctx.fillRect(536, H * .2, 3, H * .6);
    const { title, score, detail } = this.board;
    const x = 790;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const spaced = ctx as CanvasRenderingContext2D & { letterSpacing?: string };
    spaced.letterSpacing = '4px';
    ctx.font = SATOSHI(34); ctx.fillStyle = '#f5b83d';
    ctx.fillText(title, x, H * .22, 440);
    spaced.letterSpacing = '0px';
    ctx.font = JARO(150); ctx.fillStyle = '#ffffff';
    ctx.fillText(score, x, H * .52, 440);
    spaced.letterSpacing = '3px';
    ctx.font = SATOSHI(32); ctx.fillStyle = 'rgba(255,255,255,.72)';
    ctx.fillText(detail, x, H * .82, 440);
    spaced.letterSpacing = '0px';
  }
}

/**
 * The Super10 LED stumps (Figma section 18): their wrap, which the batter's
 * and the far wicket are built with (`buildWicket`'s `led`), and the batter's
 * light run when his bails go (`stumpLight`). Any ground can carry them:
 * `GameScene` puts them up for a Super10 innings, wherever it is played, and
 * on the arena.
 */
export class LedStumps {
  /** The stumps' wrap, for the wicket to be built with: see `stumpWrap`. */
  readonly wrap: THREE.Texture;
  private lights: WicketLights | null = null;
  private from = -Infinity;
  constructor(anisotropy: number) {
    this.wrap = stumpWrap(GAME.stumpHeight); this.wrap.anisotropy = anisotropy;
  }
  /** The batter's LED wicket, its crown, rings and bails to light when it is broken; the far wicket stays at rest. */
  wire(lights: WicketLights) { this.lights = lights; }
  /** The light run from `now` with no bail gone: for looking at it (`__cricket.arenaCue('stumps')`). */
  light(now: number) { this.from = now; }
  /**
   * The wrap read the right way round on a mirrored stage: the ground is
   * mirrored for a right-hander, which would print SUPER10 backwards, so the
   * wrap is turned over with it. Its marks stand at u .25 and .75 and the
   * base cut at the leg side's u .5, so turned over they are where they were.
   */
  mirror(mirrored: boolean) { this.wrap.repeat.x = mirrored ? -1 : 1; this.wrap.offset.x = mirrored ? 1 : 0; }
  /** Strike, dip, hold, as the sheet has them. `broken` is how long ago the batter's bails went, or less than nought. */
  update(now: number, broken: number, still: boolean) {
    if (!this.lights) return;
    if (now < this.from) this.from = -Infinity;
    const glow = stumpLight(broken >= 0 ? broken : Number.isFinite(this.from) ? now - this.from : -1, still);
    for (const part of ['crown', 'rings', 'bails'] as const) {
      const material = this.lights[part];
      material.emissive.setHex(glow[part].colour); material.emissiveIntensity = glow[part].level * 1.4;
    }
  }
}

/**
 * The arena's own lit pieces, hung in the scene's own frame rather than the
 * mirrored stage, over the boards and the screen (`Showboards`, its `show`,
 * which the cues reach it through): the ring of lamps that answers the
 * game, the phone torches and the crowd's wave. Its stumps are the LED
 * stumps (`LedStumps`), which the scene keeps.
 */
export class Arena {
  readonly textures: THREE.Texture[] = [];
  /** The ribbon, the boards along the rope and the screen, cued by `GameScene` as any ground's are. */
  readonly show: Showboards;
  private lamps: THREE.MeshBasicMaterial;
  /** The ring's glows, which the scene hangs (`glows` in `night.ts`): they burn with the lamps. */
  private glow: THREE.PointsMaterial | null = null;
  private torches: { material: THREE.PointsMaterial; share: { value: number } } | null = null;
  private last: ArenaFrame | null = null;
  /** The crowd's clock and its wave: see `crowdLife.ts`. */
  private life: CrowdLife | null = null;
  private waveFrom = -Infinity;

  constructor(scene: THREE.Object3D, hasScreen: boolean, anisotropy: number) {
    const ring = (radius: number, height: number, y: number, material: THREE.Material, top = radius) => {
      const mesh = new THREE.Mesh(new THREE.CylinderGeometry(top, radius, height, 180, 1, true), material);
      mesh.position.set(0, y, CENTRE_Z);
      mesh.name = 'Arena light';
      scene.add(mesh);
      return mesh;
    };
    const lamps = lampTexture(); lamps.repeat.x = -Math.round(2 * Math.PI * LAMPS.radius / 1.2); lamps.anisotropy = anisotropy;
    // Tipped down at the field: wider at the top than at the foot.
    this.lamps = new THREE.MeshBasicMaterial({ map: lamps, color: new THREE.Color(ARENA.lamp).multiplyScalar(LAMP_REST), side: THREE.BackSide, fog: false, toneMapped: false });
    ring(LAMPS.radius - .2, LAMPS.height, LAMPS.y, this.lamps, LAMPS.radius + .15);

    // The ribbon: an LED board the length of the upper tier, a panel every two and a half metres.
    const ribbon = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.BackSide, fog: false, toneMapped: false });
    ring(RIBBON.radius, RIBBON.height, RIBBON.y, ribbon);

    const city = skyline(anisotropy);
    scene.add(city.mesh);

    this.show = new Showboards(hasScreen ? this.buildScreen(scene, anisotropy) : null);
    this.show.ring(ribbon, Math.round(2 * Math.PI * RIBBON.radius / (RIBBON.height * 5)));
    this.textures.push(lamps, city.texture);
  }

  /** The screen on its frame, on two legs off the roof, turned to the crease. */
  private buildScreen(scene: THREE.Object3D, anisotropy: number): BigScreen {
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
    const screen = painted(1024, 384);
    screen.texture.anisotropy = anisotropy;
    // Painted afresh through every moment: no mipmaps to rebuild each time.
    screen.texture.generateMipmaps = false; screen.texture.minFilter = THREE.LinearFilter;
    const face = new THREE.Mesh(new THREE.PlaneGeometry(width, height), new THREE.MeshBasicMaterial({ map: screen.texture, fog: false, toneMapped: false }));
    face.name = 'Big screen';
    held.add(face);
    this.textures.push(screen.texture);
    return { context: screen.context, texture: screen.texture };
  }

  /** The boards along the rope: in the arena they are its LED boards, not the sponsors'. `panels` is how many make a lap. */
  boards(material: THREE.MeshStandardMaterial, panels: number) { this.show.ring(material, panels); }

  /** The ring's glows, to burn with the lamps. */
  glows(material: THREE.PointsMaterial) { this.glow = material; this.glowSize = material.size; }
  private glowSize = 1;

  /** The stands' life: the clock the crowd moves to, and the flags and banners held up over the seats, hung in the scene's frame so a banner's words read the right way round. */
  crowd(life: CrowdLife, seats: THREE.Matrix4[], scene: THREE.Object3D) {
    this.life = life;
    flags(scene, seats, life);
    this.textures.push(banners(scene, seats, life).texture);
    const lit = torches(scene, seats, life);
    this.torches = lit; this.textures.push(lit.texture);
  }
  /** A Mexican wave sent round the stands from `now`. */
  wave(now: number) { this.waveFrom = now; }

  /** For the checks: the boards' and the screen's state, with the wave, the lamps and the torches. */
  get state() {
    const f = this.last;
    return { ...this.show.state, wave: +(this.life?.waveOn.value ?? 0).toFixed(2), front: +(this.life?.wave.value ?? 0).toFixed(2),
      lamps: +(f?.lamps ?? 1).toFixed(2), torches: +(f?.torches ?? 0).toFixed(2) };
  }

  /** The lamps, the torches and the wave at `now`, by the frame the boards were drawn from (`Showboards.update`). */
  update(now: number, f: ArenaFrame, still: boolean) {
    if (now < this.waveFrom) this.waveFrom = -Infinity;
    if (this.life) {
      const wave = waveAt(now - this.waveFrom);
      this.life.time.value = now / 1000; this.life.still.value = still ? 1 : 0;
      this.life.wave.value = wave.at; this.life.waveOn.value = wave.on;
    }
    this.last = f;
    // The floodlights: the ring's colour and its glows, which stand bigger as they burn brighter.
    this.lamps.color.setHex(ARENA.lamp).multiplyScalar(LAMP_REST * f.lamps);
    if (this.glow) { this.glow.opacity = Math.min(1, f.lamps); this.glow.size = this.glowSize * Math.max(.6, f.lamps); }
    if (this.torches) this.torches.share.value = f.torches;
  }
}
