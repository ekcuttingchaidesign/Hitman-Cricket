import * as THREE from 'three';
import { Batch, mat } from './build';
import { EAVES, STADIUM, stadium, type StadiumLights } from './stadium';
import { seeded } from './turf';
import type { Milestone } from '../game/milestone';

/**
 * The arena: Super10's ground, played under lights and nowhere else.
 *
 * It is the stadium's bowl (`stadium.ts`) with what makes a ground read as
 * new where a phone looks, which is the far end and the sky over it:
 *
 * - **A ring of fire.** No towers: the light is one ring of lamps round the
 *   edge of the roof, as at the Dubai International Stadium, with a glow on
 *   every few metres of it (`ringLamps`, the stadium's `glows`).
 * - **LED round the bowl.** The roof's fascia is a halo of LED, and the front
 *   of the upper tier a ribbon of it, in the arena's two colours: magenta
 *   and cyan. Both are one ring each with continuous texture, so a chase of
 *   light can run round the whole ground.
 * - **The two sides' supporters.** The stands in the sides' colours, a
 *   section each in turn, rather than the stadium's summer whites.
 * - **A city behind it.** A skyline of lit windows over the far stand, with
 *   the odd tower's red light on top, painted once into a strip.
 * - **The big screen.** Where the commentary box was, over the far end: the
 *   mode, the score and who is in, and the moment in big letters when there
 *   is one. `?screen=0` puts the commentary box back instead, for when
 *   the screen does not earn its place.
 *
 * And it reacts (`arenaFrame`): gold for Power Surge, red for the death
 * overs, a chase of light and the boards' word for a four, searchlights over
 * the far end for a six, everything to red and down for a wicket with the
 * stumps lit, the colours cycling for a milestone. The stadium's crowd,
 * placards and phone torches go on as they always have, over it.
 */

/** The arena's colours, as a designer would pick them; changed here, changed everywhere. */
export const ARENA = {
  /** The halo round the roof, and the screen's first colour. */
  halo: 0xff2fa8,
  /** The ribbon along the upper tier, and the screen's second colour. */
  ribbon: 0x22e1ff,
  /** Power Surge. */
  surge: 0xffc23a,
  /** The death overs: the halo, and the ribbon under it. */
  death: 0xff2a4d,
  deathRibbon: 0xff2fa8,
  /** A wicket. */
  out: 0xff1e1e,
  /** The ring of lamps: a cool white, where the stadium's lamps are warm. */
  lamp: 0xf2f6ff,
  /** The screen's frame, and the bars it stands on. */
  frame: 0x1b2129,
} as const;

/** The two sides in the stands, a section each in turn: a blue side and a yellow one, with the odd shirt from the arena's shop. */
export const ARENA_CROWD: readonly (readonly number[])[] = [
  [0x1f4fd6, 0x163a9e, 0x1f4fd6, 0xf2ede1, 0x2a62ff, 0x111418, 0x1f4fd6, 0xff2fa8, 0x163a9e],
  [0xffd23f, 0xf2b91c, 0xffd23f, 0x111418, 0xffe36e, 0xf2ede1, 0xffd23f, 0x22e1ff, 0xf2b91c],
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
/** The searchlights: how many, how long, and how far round either side of straight they stand. */
const BEAMS = { count: 6, length: 70, spread: .7 } as const;

/** Builds the arena's stands onto `world`; the rest of it is `Arena`, which `GameScene` hangs in its own frame. */
export function arenaStands(world: THREE.Object3D, screen = true): StadiumLights {
  const lights = stadium(world, { crowd: ARENA_CROWD, towers: false, roofLamps: false, commentary: !screen });
  // The ring of fire's glow: one every few degrees, round the whole roof.
  for (let degrees = 0; degrees < 360; degrees += LAMPS.every) {
    const a = THREE.MathUtils.degToRad(degrees);
    lights.roof.push(new THREE.Vector3(Math.sin(a) * (LAMPS.radius - .3), LAMPS.y, CENTRE_Z + Math.cos(a) * (LAMPS.radius - .3)));
  }
  return lights;
}

export type ArenaMood = 'calm' | 'surge' | 'death';
export type ArenaCue = 'four' | 'six' | 'wicket' | 'milestone' | 'surge' | 'death';

/** The mood's colours, and how fast and how deep they breathe (a pulse a second; nought is still). */
const MOODS: Record<ArenaMood, { halo: number; ribbon: number; pulse: number; depth: number }> = {
  calm: { halo: ARENA.halo, ribbon: ARENA.ribbon, pulse: 0, depth: 0 },
  surge: { halo: ARENA.surge, ribbon: ARENA.surge, pulse: 1.2, depth: .35 },
  death: { halo: ARENA.death, ribbon: ARENA.deathRibbon, pulse: .55, depth: .3 },
};

/** How long each moment holds the arena, and what the boards and the screen say. */
export const CUES: Record<ArenaCue, { ms: number; word: string; colour: number }> = {
  four: { ms: 1800, word: 'FOUR', colour: ARENA.ribbon },
  six: { ms: 2800, word: 'SIX', colour: ARENA.halo },
  wicket: { ms: 2000, word: 'WICKET', colour: ARENA.out },
  milestone: { ms: 3600, word: 'FIFTY', colour: ARENA.surge },
  surge: { ms: 2600, word: 'POWER SURGE', colour: ARENA.surge },
  death: { ms: 2600, word: 'DEATH OVERS', colour: ARENA.death },
};

/** What a milestone puts on the boards and the screen. */
export const MILESTONE_WORDS: Record<Milestone, string> = {
  fifty: 'FIFTY', century: 'HUNDRED', 'six-sixes': 'SIX SIXES', raise: '150', double: 'DOUBLE', triple: 'TRIPLE', four: '400',
};

/** What the arena shows at a moment: see `arenaFrame`. */
export interface ArenaFrame {
  halo: THREE.Color;
  ribbon: THREE.Color;
  /** How fast the light runs round the ground, in laps of its pattern a second; less than nought runs it the other way. */
  chase: number;
  /** The searchlights over the far end, nought to one. */
  beams: number;
  /** What the boards and the screen say, or nothing. */
  word: string | null;
  /** The colour behind it. */
  wordColour: number;
}

const white = new THREE.Color(1, 1, 1);
const fade = (t: number, from: number, to: number) => THREE.MathUtils.clamp((t - from) / (to - from), 0, 1);

/**
 * The arena at `now`, in its mood and with the moment last cued: a function
 * of the clock and nothing else, so any moment can be asked for on its own
 * and the tests can hold each to what it is. `still` is reduced motion: the
 * colours change and nothing flashes, runs or sweeps.
 */
export function arenaFrame(mood: ArenaMood, cue: { kind: ArenaCue; at: number; word?: string } | null, now: number, still = false): ArenaFrame {
  const m = MOODS[mood];
  const breathe = still || !m.pulse ? 1 : 1 - m.depth * (.5 + .5 * Math.cos(now / 1000 * m.pulse * Math.PI * 2));
  const halo = new THREE.Color(m.halo).multiplyScalar(breathe), ribbon = new THREE.Color(m.ribbon).multiplyScalar(breathe);
  const frame: ArenaFrame = { halo, ribbon, chase: 0, beams: 0, word: null, wordColour: 0 };
  const since = cue ? now - cue.at : Infinity;
  if (!cue || since < 0 || since >= CUES[cue.kind].ms) return frame;
  const { ms, word, colour } = CUES[cue.kind];
  frame.word = cue.word ?? word; frame.wordColour = colour;
  // Every moment lets go over its last half second, back into the mood.
  const hold = 1 - fade(since, ms - 500, ms);
  const blink = (hz: number, until: number) => still || since > until ? 1 : (Math.floor(since / 1000 * hz * 2) % 2 ? .25 : 1);
  switch (cue.kind) {
    case 'four': {
      // A white flash round the roof, and the ribbon's colour run round the ground.
      const flash = Math.max(0, 1 - since / 600);
      halo.lerp(white, flash * hold);
      ribbon.lerp(new THREE.Color(ARENA.ribbon), hold);
      frame.chase = still ? 0 : 1.6 * hold;
      break;
    }
    case 'six': {
      // The roof strobes white and magenta, the ribbon goes gold and runs, and the searchlights come up.
      const strobe = new THREE.Color(ARENA.halo).lerp(white, still ? .4 : blink(6, 1200) === 1 ? .7 : 0);
      halo.lerp(strobe, hold);
      ribbon.lerp(new THREE.Color(ARENA.surge), hold);
      frame.chase = still ? 0 : 2.6 * hold;
      frame.beams = still ? 0 : fade(since, 0, 250) * hold;
      break;
    }
    case 'wicket': {
      // Everything to red, then down nearly to dark, then the red let go.
      const red = new THREE.Color(ARENA.out);
      const level = since < 300 ? 1 : since < 1100 ? .15 : .15 + .85 * fade(since, 1100, 1500);
      halo.lerp(red, hold).multiplyScalar(level); ribbon.lerp(red, hold).multiplyScalar(level);
      break;
    }
    case 'milestone': {
      // The colours turn round the wheel, and the searchlights with them.
      const hue = still ? 0.12 : (since / 1600) % 1;
      halo.lerp(new THREE.Color().setHSL(hue, 1, .55), hold);
      ribbon.lerp(new THREE.Color().setHSL((hue + .5) % 1, 1, .55), hold);
      frame.chase = still ? 0 : 1 * hold;
      frame.beams = still ? 0 : fade(since, 0, 400) * hold;
      break;
    }
    case 'surge': {
      // Gold runs round the ground, fast, and settles into the mood (which is the surge's own gold).
      const gold = new THREE.Color(ARENA.surge);
      halo.lerp(gold, hold).multiplyScalar(blink(4, 900)); ribbon.lerp(gold, hold);
      frame.chase = still ? 0 : 3 * hold;
      break;
    }
    case 'death': {
      // Red runs the other way round.
      const red = new THREE.Color(ARENA.death);
      halo.lerp(red, hold); ribbon.lerp(new THREE.Color(ARENA.deathRibbon), hold);
      frame.chase = still ? 0 : -1.4 * hold;
      break;
    }
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

const hex = (colour: number) => `#${colour.toString(16).padStart(6, '0')}`;
const DISPLAY = (size: number) => `${size}px Jaro, "Arial Narrow", Impact, sans-serif`;

/**
 * An LED strip: a row of pixels in a housing, each tile of it brighter at
 * one end than the other, so that run round the ring the light is seen to
 * chase, and stood still it reads as a strip of lamps rather than paint.
 */
function stripTexture(chevrons: boolean) {
  const { context: ctx, texture } = painted(256, 32);
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, 256, 32);
  for (let x = 0; x < 256; x += 4) {
    const level = .62 + .38 * (x / 256);
    for (let y = 4; y < 28; y += 4) {
      // The ribbon carries the game's chevrons, in light, on a dimmer strip.
      const lit = !chevrons || Math.abs(((x + Math.abs(y - 16) * 1.4) % 64) - 32) < 9;
      const v = Math.round(255 * level * (lit ? 1 : .28));
      ctx.fillStyle = `rgb(${v},${v},${v})`; ctx.fillRect(x, y, 3, 3);
    }
  }
  texture.wrapS = THREE.RepeatWrapping;
  return texture;
}

/** The lamps along the roof's edge: bright cells with dark frames between them. */
function lampTexture() {
  const { context: ctx, texture } = painted(64, 16);
  ctx.fillStyle = '#20262e'; ctx.fillRect(0, 0, 64, 16);
  for (let x = 0; x < 64; x += 16) {
    const g = ctx.createLinearGradient(0, 2, 0, 14);
    g.addColorStop(0, '#ffffff'); g.addColorStop(1, '#c9d6ff');
    ctx.fillStyle = g; ctx.fillRect(x + 2, 3, 12, 10);
  }
  texture.wrapS = THREE.RepeatWrapping;
  return texture;
}

/** A soft band of light either side of a line, for the halo's glow and the searchlights. */
function glowTexture(vertical: 'band' | 'beam') {
  const { context: ctx, texture } = painted(4, 128);
  const g = ctx.createLinearGradient(0, 0, 0, 128);
  if (vertical === 'band') {
    g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(.42, 'rgba(255,255,255,.55)');
    g.addColorStop(.5, 'rgba(255,255,255,.8)'); g.addColorStop(.58, 'rgba(255,255,255,.55)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  } else {
    // The top of the canvas is the far end of the beam.
    g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(.6, 'rgba(255,255,255,.18)'); g.addColorStop(1, 'rgba(255,255,255,.7)');
  }
  ctx.fillStyle = g; ctx.fillRect(0, 0, 4, 128);
  return texture;
}

/**
 * The city: towers and blocks in a dark navy against the sky, their windows
 * lit in warm and cool whites, a few in the arena's colours, red lights on
 * the tallest, and the glow of the streets behind them. Only what stands
 * higher than the far roof is ever seen, so that is where the windows are.
 */
function cityTexture() {
  const W = 4096, H = 256;
  const { context: ctx, texture } = painted(W, H);
  const random = seeded(71);
  ctx.clearRect(0, 0, W, H);
  const haze = ctx.createLinearGradient(0, H * .3, 0, H * .62);
  haze.addColorStop(0, 'rgba(255,90,190,0)'); haze.addColorStop(1, 'rgba(255,120,200,.16)');
  ctx.fillStyle = haze; ctx.fillRect(0, H * .3, W, H * .32);
  let x = 0;
  while (x < W) {
    const w = 24 + random() * 70, tall = random() < .12;
    const top = H * (tall ? .05 + random() * .2 : .3 + random() * .25);
    ctx.fillStyle = random() < .5 ? '#0a1226' : '#0d1730';
    ctx.fillRect(x, top, w, H - top);
    // Windows, in rows, some dark.
    const warm = random() < .5;
    for (let y = top + 5; y < H * .66; y += 7) for (let wx = x + 4; wx < x + w - 4; wx += 6) {
      const r = random();
      if (r < .45) continue;
      ctx.fillStyle = r > .985 ? hex(ARENA.halo) : r > .97 ? hex(ARENA.ribbon) : warm ? 'rgba(255,214,150,.85)' : 'rgba(200,222,255,.8)';
      ctx.fillRect(wx, y, 3, 3);
    }
    if (tall) {
      ctx.fillStyle = '#ff3b3b'; ctx.fillRect(x + w / 2 - 2, top - 5, 4, 4);
      // The odd tower lit along its crown in the arena's colour.
      if (random() < .5) { ctx.fillStyle = hex(random() < .5 ? ARENA.halo : ARENA.ribbon); ctx.fillRect(x, top, w, 3); }
    }
    x += w + random() * 6;
  }
  texture.wrapS = THREE.ClampToEdgeWrapping;
  return texture;
}

/** A word on the boards, one panel of it, which the ring repeats `panels` times. */
function boardWordTexture(word: string, colour: number, panels: number) {
  const { context: ctx, texture } = painted(640, 128);
  const g = ctx.createLinearGradient(0, 0, 640, 0);
  g.addColorStop(0, '#05070d'); g.addColorStop(.5, hex(colour)); g.addColorStop(1, '#05070d');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 640, 128);
  ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = DISPLAY(104);
  const scale = Math.min(1, 560 / ctx.measureText(word).width);
  ctx.save(); ctx.translate(320, 68); ctx.scale(scale, 1); ctx.fillText(word, 0, 0); ctx.restore();
  texture.wrapS = THREE.RepeatWrapping;
  // Negative, as the sponsors' are: the ring is seen from inside.
  texture.repeat.x = -panels;
  return texture;
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
  private haloMap: THREE.Texture;
  private ribbonMap: THREE.Texture;
  private beams: THREE.InstancedMesh;
  private beamMaterial: THREE.MeshBasicMaterial;
  private screen: ReturnType<typeof painted> | null = null;
  private shown = '';
  private board: Scoreboard = { title: 'SUPER10', score: '0/0', detail: '' };
  private moodNow: ArenaMood = 'calm';
  private cued: { kind: ArenaCue; at: number; word?: string } | null = null;
  private boardsMaterial: THREE.MeshStandardMaterial | null = null;
  private sponsors: THREE.Texture | null = null;
  private words = new Map<string, THREE.Texture>();
  private wordUp: string | null = null;
  private panels = 30;
  private stumps: THREE.MeshStandardMaterial[] = [];
  private last: ArenaFrame | null = null;
  private dummy = new THREE.Object3D();

  constructor(scene: THREE.Object3D, readonly hasScreen: boolean, anisotropy: number) {
    const ring = (radius: number, height: number, y: number, material: THREE.Material, top = radius) => {
      const mesh = new THREE.Mesh(new THREE.CylinderGeometry(top, radius, height, 180, 1, true), material);
      mesh.position.set(0, y, CENTRE_Z);
      mesh.name = 'Arena light';
      scene.add(mesh);
      return mesh;
    };
    const led = (map: THREE.Texture, colour: number) => new THREE.MeshBasicMaterial({ map, color: colour, side: THREE.BackSide, fog: false, toneMapped: false });

    this.haloMap = stripTexture(false); this.haloMap.repeat.x = -24; this.haloMap.anisotropy = anisotropy;
    this.halo = led(this.haloMap, ARENA.halo);
    ring(HALO.radius, HALO.height, HALO.y, this.halo);
    // Its glow on the night either side of it: added light, so it sits on the roof and the sky alike.
    const band = glowTexture('band');
    this.haloGlow = new THREE.MeshBasicMaterial({ map: band, color: ARENA.halo, side: THREE.BackSide, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, toneMapped: false, opacity: .55 });
    ring(HALO.radius - .05, 3.4, HALO.y, this.haloGlow);

    const lamps = lampTexture(); lamps.repeat.x = -Math.round(2 * Math.PI * LAMPS.radius / 1.2); lamps.anisotropy = anisotropy;
    // Tipped down at the field: wider at the top than at the foot.
    ring(LAMPS.radius - .2, LAMPS.height, LAMPS.y, new THREE.MeshBasicMaterial({ map: lamps, color: new THREE.Color(ARENA.lamp), side: THREE.BackSide, fog: false, toneMapped: false }), LAMPS.radius + .15);

    this.ribbonMap = stripTexture(true); this.ribbonMap.repeat.x = -40; this.ribbonMap.anisotropy = anisotropy;
    this.ribbon = led(this.ribbonMap, ARENA.ribbon);
    ring(RIBBON.radius, RIBBON.height, RIBBON.y, this.ribbon);

    const city = cityTexture(); city.anisotropy = anisotropy;
    const skyline = new THREE.Mesh(
      new THREE.CylinderGeometry(CITY.radius, CITY.radius, CITY.height, 96, 1, true, -CITY.arc / 2, CITY.arc),
      new THREE.MeshBasicMaterial({ map: city, side: THREE.BackSide, transparent: true, depthWrite: false, fog: false }),
    );
    skyline.position.set(0, CITY.from + CITY.height / 2, CENTRE_Z); skyline.name = 'Skyline';
    scene.add(skyline);

    // The searchlights: one instanced cone, up only for a six or a milestone.
    const beam = glowTexture('beam');
    this.beamMaterial = new THREE.MeshBasicMaterial({ map: beam, color: 0xffffff, side: THREE.DoubleSide, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, toneMapped: false });
    this.beams = new THREE.InstancedMesh(new THREE.CylinderGeometry(3.4, .35, BEAMS.length, 16, 1, true).translate(0, BEAMS.length / 2, 0), this.beamMaterial, BEAMS.count);
    this.beams.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.beams.frustumCulled = false; this.beams.visible = false;
    this.beams.name = 'Searchlights';
    scene.add(this.beams);

    if (hasScreen) this.buildScreen(scene, anisotropy);
    this.textures.push(this.haloMap, band, lamps, this.ribbonMap, city, beam);
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
    // Jaro may not have loaded by the first frame; drawn again once it has.
    Promise.all([document.fonts?.load(DISPLAY(80)), document.fonts?.load('700 50px Satoshi')]).then(() => { this.shown = ''; }).catch(() => {});
  }

  /**
   * The boards along the rope, for their words: the sponsors' texture is
   * kept to go back to. `panels` is how many boards make a lap.
   */
  boards(material: THREE.MeshStandardMaterial, panels: number) {
    this.boardsMaterial = material; this.sponsors = material.map; this.panels = panels;
  }

  /** The batter's wicket, lit red when it is broken, as LED stumps are: each piece given its own material. */
  wire(stumps: THREE.Mesh[]) {
    for (const mesh of stumps) {
      const material = (mesh.material as THREE.MeshStandardMaterial).clone();
      mesh.material = material; this.stumps.push(material);
    }
  }

  mood(mood: ArenaMood) { this.moodNow = mood; }
  cue(kind: ArenaCue, now: number, word?: string) { this.cued = { kind, at: now, word }; }
  scoreboard(board: Scoreboard) { this.board = board; }
  /** For the checks: the mood, the moment up, and what the screen says. */
  get state() {
    const f = this.last;
    return { mood: this.moodNow, word: f?.word ?? null, beams: +(f?.beams ?? 0).toFixed(2), screen: this.hasScreen ? this.shown : null,
      halo: `#${this.halo.color.getHexString()}`, ribbon: `#${this.ribbon.color.getHexString()}` };
  }

  /** `broken` is how long ago the batter's bails went, or less than nought. */
  update(now: number, broken: number, still: boolean) {
    // A new innings starts the clock again from nought: a moment from the last one is let go.
    if (this.cued && now < this.cued.at) this.cued = null;
    const f = arenaFrame(this.moodNow, this.cued, now, still);
    this.last = f;
    this.halo.color.copy(f.halo); this.haloGlow.color.copy(f.halo); this.ribbon.color.copy(f.ribbon);
    // The light runs round: the halo with the chase, the ribbon a little behind it.
    this.haloMap.offset.x = (this.haloMap.offset.x + f.chase * .016) % 1;
    this.ribbonMap.offset.x = (this.ribbonMap.offset.x + f.chase * .011) % 1;
    this.searchlights(f.beams, now, this.cued?.kind === 'milestone');
    this.boardWord(f, now);
    if (this.screen) this.paintScreen(f);
    // The stumps, lit red and flashing for a second and a half once the bails go.
    const lit = broken >= 0 && broken < 1600 ? (still ? 1 : Math.floor(broken / 125) % 2 ? .35 : 1) : 0;
    for (const material of this.stumps) { material.emissive.setHex(ARENA.out); material.emissiveIntensity = lit * 1.6; }
  }

  private searchlights(level: number, now: number, colourful: boolean) {
    this.beams.visible = level > 0;
    if (!level) return;
    this.beamMaterial.opacity = level;
    if (colourful) this.beamMaterial.color.setHSL((now / 1600) % 1, 1, .7); else this.beamMaterial.color.set(0xffffff);
    const t = now / 1000;
    for (let i = 0; i < BEAMS.count; i++) {
      // From the roof's edge over the far end, spread either side of straight.
      const a = (i / (BEAMS.count - 1) - .5) * BEAMS.spread;
      this.dummy.position.set(Math.sin(a) * LAMPS.radius, LAMPS.y, CENTRE_Z + Math.cos(a) * LAMPS.radius);
      // Each leans out and sweeps across, every other one the other way, so they cross.
      const sweep = (i % 2 ? -1 : 1) * Math.sin(t * 1.3 + i * .9) * .6;
      const lean = .32 + .1 * Math.sin(t * .9 + i);
      this.dummy.rotation.set(0, 0, 0);
      this.dummy.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0),
        new THREE.Vector3(Math.sin(a + sweep) * Math.sin(lean), Math.cos(lean), Math.cos(a + sweep) * Math.sin(lean) * .4 - .3 * Math.sin(lean)).normalize());
      this.dummy.updateMatrix();
      this.beams.setMatrixAt(i, this.dummy.matrix);
    }
    this.beams.instanceMatrix.needsUpdate = true;
  }

  /** The boards' word for the moment, scrolling round, then the sponsors back. */
  private boardWord(f: ArenaFrame, now: number) {
    const material = this.boardsMaterial;
    if (!material || !this.sponsors) return;
    const word = f.word;
    if (word !== this.wordUp) {
      this.wordUp = word;
      let map = this.sponsors;
      if (word) {
        const key = `${word}|${f.wordColour}`;
        map = this.words.get(key) ?? boardWordTexture(word, f.wordColour, this.panels);
        if (!this.words.has(key)) { this.words.set(key, map); this.textures.push(map); }
      }
      material.map = map; material.emissiveMap = map;
      material.emissiveIntensity = word ? 1.4 : 1;
    }
    if (word && material.map) material.map.offset.x = (now / 1000 * .02) % 1;
  }

  /** The screen: the moment's word on its colour, or the mode, the score and who is in. Painted only when it changes. */
  private paintScreen(f: ArenaFrame | null) {
    const screen = this.screen!;
    const word = f?.word ?? null;
    const key = word ? `w|${word}|${f!.wordColour}` : `b|${this.board.title}|${this.board.score}|${this.board.detail}`;
    if (key === this.shown) return;
    this.shown = key;
    const ctx = screen.context, W = 1024, H = 384;
    ctx.fillStyle = '#05070d'; ctx.fillRect(0, 0, W, H);
    ctx.textBaseline = 'middle';
    if (word) {
      const g = ctx.createLinearGradient(0, 0, W, H);
      g.addColorStop(0, hex(f!.wordColour)); g.addColorStop(1, '#0a0d18');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#fff'; ctx.textAlign = 'center';
      ctx.font = DISPLAY(word.length > 6 ? 150 : 240);
      const scale = Math.min(1, (W - 80) / ctx.measureText(word).width);
      ctx.save(); ctx.translate(W / 2, H / 2 + 10); ctx.scale(scale, 1); ctx.fillText(word, 0, 0); ctx.restore();
    } else {
      const { title, score, detail } = this.board;
      // The mode in the arena's colours down the left, the score big on the right.
      const g = ctx.createLinearGradient(40, 0, 470, 0);
      g.addColorStop(0, hex(ARENA.halo)); g.addColorStop(1, hex(ARENA.ribbon));
      ctx.fillStyle = g; ctx.textAlign = 'left';
      ctx.font = DISPLAY(118);
      const fit = Math.min(1, 440 / ctx.measureText(title).width);
      ctx.save(); ctx.translate(48, H / 2 - 8); ctx.scale(fit, 1); ctx.fillText(title, 0, 0); ctx.restore();
      ctx.fillStyle = 'rgba(255,255,255,.18)'; ctx.fillRect(512, 60, 4, H - 120);
      ctx.fillStyle = '#fff'; ctx.textAlign = 'center';
      ctx.font = DISPLAY(190); ctx.fillText(score, 770, H / 2 - 30);
      // The small line in the game's UI face, where Jaro's V reads as a U.
      ctx.fillStyle = '#9fb3d9'; ctx.font = '700 50px Satoshi, "Helvetica Neue", Arial, sans-serif'; ctx.fillText(detail, 770, H / 2 + 112);
    }
    // The screen's pixels: a fine dark grid over all of it.
    ctx.fillStyle = 'rgba(0,0,0,.28)';
    for (let x = 0; x < W; x += 4) ctx.fillRect(x, 0, 1, H);
    for (let y = 0; y < H; y += 4) ctx.fillRect(0, y, W, 1);
    screen.texture.needsUpdate = true;
  }
}
