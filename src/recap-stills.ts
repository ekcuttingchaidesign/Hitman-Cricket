/**
 * Stills of the game's own batter for the year recap's comic pages
 * (`recap-stills.html`): any kit, bat and guard, any stroke at any moment of
 * its clock, from any angle, rendered on a transparent background at the size
 * a comic panel wants. The page shows one; `scripts/recap-stills.mjs` asks it
 * for many through `__stills.render` and writes them out as PNGs.
 *
 * The stage is mirrored as the game's is, so he is right-handed, and the bat's
 * stickers are turned to read the right way round. Nothing is scored, sent or
 * counted. A dev page.
 */
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { Bowler } from './entities/Bowler';
import { Batter, CHARGE_MEETS_AT, HOOK_MEETS_AT, LATE_CUT_MEETS_AT, ON_DRIVE_MEETS_AT, PULL_MEETS_AT } from './entities/Batter';
import { GLOVES, SUPER10_GLOVES } from './entities/gloves';
import { batSheet } from './entities/batSkins';
import { GAME } from './config/gameplay';
import { ALL_BATS, ALL_OUTFITS } from './game/dressing';
import { SUPER10_KITS } from './game/super10-kits';
import type { ShotType } from './game/types';
import type { AfterBall, Celebration } from './entities/Batter';

/** What one still is of. */
export interface StillAsk {
  /** The batter (the default), or the bowler: `bowler` with `follow` his follow-through's progress, or `run` a moment of his run-up in ms. */
  who?: 'batter' | 'bowler'; follow?: number; run?: number;
  kit?: string; bat?: string; guard?: string;
  /** A stroke (`LOFTED`, `PULL`, `COVER`…, as `rig-sheet` names them), `GUARD` for his stance, an after-ball action (`after:admire`) or a milestone's celebration (`celebrate:hundred`). */
  shot?: string;
  /** `bat` draws the bat alone, as he holds it in the pose asked for; the still is framed on it. */
  only?: 'bat';
  /** Milliseconds into the stroke, or into the after-ball action. */
  age?: number;
  /** The camera round him in degrees, 0 in front of his chest, and up from level; `dist` is a multiple of the distance that just fits him. */
  az?: number; el?: number; dist?: number; fov?: number;
  width?: number; height?: number;
  /** Cut down to the figure and this many pixels round it (the default); `trim: false` keeps the whole frame. */
  trim?: boolean; margin?: number;
  /**
   * `chrome` renders him as a polished metal figurine: every material turned
   * to metal in its own colour (the kit's as anodised metal, the pads and
   * trousers silver), lit by a studio's reflections. `rough` is how blurred
   * the reflections are, 0 a mirror. `studio` is the game's own batter shot as
   * a poster wants him: matte, a warm key from in front that throws his own
   * shadows across him, a cool rim down either edge (`rimColor`, the second
   * rim's colour, the kit's glow by default) and a film's tone curve.
   * Unset, he is drawn as in the game.
   */
  finish?: 'chrome' | 'studio'; rough?: number; rimColor?: string;
}

type Spec = { shot: ShotType; x: number; y: number; z?: number; charging?: boolean; lofted?: boolean; sweeping?: boolean; levelled?: boolean; version?: 1 | 2 | 3; spinCut?: boolean; helicopter?: boolean };
const STROKE: Record<string, Spec> = {
  STRAIGHT: { shot: 'STRAIGHT', x: 0, y: .54 },
  LOFTED: { shot: 'STRAIGHT', x: 0, y: .54, lofted: true },
  LOFTED_V2: { shot: 'STRAIGHT', x: 0, y: .54, lofted: true, version: 2 },
  COVER: { shot: 'COVER_LONG_OFF', x: .16, y: .48 },
  ON_LOFT: { shot: 'LONG_ON', x: -.2, y: .54, lofted: true, z: ON_DRIVE_MEETS_AT },
  PULL: { shot: 'LEG', x: -.30, y: 1.12, z: PULL_MEETS_AT },
  HOOK: { shot: 'HOOK', x: .42, y: 1.134, z: HOOK_MEETS_AT },
  CUT: { shot: 'SQUARE_CUT', x: .40, y: .92 },
  LATE_CUT: { shot: 'LATE_CUT', x: .30, y: .56, z: LATE_CUT_MEETS_AT },
  SLOG_SWEEP: { shot: 'LEG', x: 0, y: .48, sweeping: true },
  SCOOP: { shot: 'SCOOP', x: -.07, y: .54 },
  REVERSE_SCOOP: { shot: 'REVERSE_SCOOP', x: .28, y: .54 },
  CHARGE: { shot: 'STRAIGHT', x: 0, y: .54, charging: true, z: CHARGE_MEETS_AT },
  HELICOPTER: { shot: 'STRAIGHT', x: 0, y: .12, helicopter: true },
  DEFEND: { shot: 'DEFEND', x: 0, y: .54 },
};
export const STILL_STROKES = Object.keys(STROKE);

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
renderer.setClearColor(0x000000, 0);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.setPixelRatio(1);
const scene = new THREE.Scene();
// Even, bright light with a clear lit side and a rim, so a comic's ink and flat colour read off it.
const sky = new THREE.HemisphereLight(0xffffff, 0x8a8f9a, 2.2); scene.add(sky);
const key = new THREE.DirectionalLight(0xfff2e0, 2.4); scene.add(key, key.target);
const rim = new THREE.DirectionalLight(0xd8e6ff, 1.6); scene.add(rim, rim.target);
// The studio finish's second rim, down his other edge, and the key's shadows: both off for every other finish.
const rim2 = new THREE.DirectionalLight(0xffffff, 0); scene.add(rim2, rim2.target);
key.shadow.mapSize.set(2048, 2048); key.shadow.bias = -.0006; key.shadow.normalBias = .02; key.shadow.radius = 5;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const world = new THREE.Group(); world.scale.x = -1; scene.add(world);
const batter = new Batter(); world.add(batter.root); batter.mirrorStickers(true);
const bowler = new Bowler(); world.add(bowler.root); bowler.root.visible = false;
const camera = new THREE.PerspectiveCamera(28, 2 / 3, .02, 80);
const studio = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), .04).texture;

/** The materials as the game drew them, so a chrome still can be undone for the next. */
const asDrawn = new Map<THREE.MeshStandardMaterial, { metalness: number; roughness: number; envMapIntensity: number }>();
function finishOf(root: THREE.Object3D, finish: StillAsk['finish'], rough: number, rimColor: string) {
  const chrome = finish === 'chrome', lit = finish === 'studio';
  root.traverse(o => {
    if (!(o instanceof THREE.Mesh)) return;
    o.castShadow = o.receiveShadow = lit;
    for (const m of [o.material].flat()) {
      if (!(m instanceof THREE.MeshStandardMaterial)) continue;
      if (!asDrawn.has(m)) asDrawn.set(m, { metalness: m.metalness, roughness: m.roughness, envMapIntensity: m.envMapIntensity });
      const was = asDrawn.get(m)!;
      if (chrome) { m.metalness = 1; m.roughness = rough; m.envMapIntensity = 1.35; }
      else if (lit) { m.metalness = 0; m.roughness = Math.min(was.roughness, .58); m.envMapIntensity = .3; }
      else Object.assign(m, was);
    }
  });
  scene.environment = chrome || lit ? studio : null;
  renderer.toneMapping = chrome ? THREE.ACESFilmicToneMapping : lit ? THREE.NeutralToneMapping : THREE.NoToneMapping;
  renderer.toneMappingExposure = lit ? .92 : 1;
  renderer.shadowMap.enabled = lit; key.castShadow = lit;
  sky.intensity = lit ? .5 : 2.2;
  key.intensity = lit ? 2.5 : 2.4; key.color.set(lit ? 0xffe9c9 : 0xfff2e0);
  rim.intensity = lit ? 3.2 : 1.6; rim.color.set(lit ? 0xbfd8ff : 0xd8e6ff);
  rim2.intensity = lit ? 3 : 0; rim2.color.set(rimColor);
}

async function dress(kitId: string, batId: string, guardId: string) {
  const team = SUPER10_KITS.find(k => k.id === kitId);
  if (team) {
    batter.wear({ shirt: team.shirt, helmet: team.helmet, trousers: team.trousers, trim: team.trim, number: team.number });
    batter.wearGloves(SUPER10_GLOVES[team.guard]);
    batter.printKit(team.print, '10');
  } else {
    const outfit = ALL_OUTFITS.find(o => o.id === kitId) ?? ALL_OUTFITS[0];
    batter.wear(outfit);
    batter.printKit('print' in outfit ? outfit.print ?? null : null, null);
    batter.wearGloves(GLOVES.find(g => g.id === guardId) ?? GLOVES[0]);
  }
  const bat = ALL_BATS.find(b => b.id === batId) ?? ALL_BATS[0];
  batter.holdBat(bat.grip, await batSheet(bat.id));
}

function pose(shot: string, age: number) {
  batter.reset(); batter.prepare(1); batter.update(0);
  if (shot.startsWith('after:')) {
    batter.afterBall(shot.slice(6) as AfterBall, 0); batter.update(age);
  } else if (shot.startsWith('celebrate:')) {
    batter.celebrate(0, shot.slice(10) as Celebration); batter.update(age);
  } else if (shot !== 'GUARD') {
    const s = STROKE[shot] ?? STROKE.LOFTED;
    batter.swing(s.shot, 0, s.x, s.y, GAME.contactZ + (s.z ?? 0), s.charging ?? false, s.lofted ?? false, s.sweeping ?? false, s.levelled ?? false,
      (s.version ?? 2) as 1 | 2 | 3, s.spinCut ?? false, false, s.helicopter ?? false);
    batter.update(age);
  }
  batter.drape();
  batter.root.updateMatrixWorld(true);
}

/** Renders one still and hands it back as a PNG data URL. */
async function render(ask: StillAsk = {}): Promise<string> {
  const w = ask.width ?? 1024, h = ask.height ?? 1536;
  const bowling = ask.who === 'bowler';
  batter.root.visible = !bowling; bowler.root.visible = bowling;
  if (bowling) {
    bowler.reset();
    if (ask.run !== undefined) bowler.runup(ask.run); else bowler.followThrough(ask.follow ?? .6);
    bowler.figure.drape(); bowler.root.updateMatrixWorld(true);
  } else {
    await dress(ask.kit ?? 'home', ask.bat ?? 'boom', ask.guard ?? 'sterling');
    pose(ask.shot ?? 'LOFTED', ask.age ?? 520);
  }
  // The bat alone: everything of him out of sight but the bat and what it is hung from.
  const alone = !bowling && ask.only === 'bat';
  const hidden: THREE.Object3D[] = [];
  if (alone) {
    const kept = new Set<THREE.Object3D>(); batter.bat.traverse(o => kept.add(o));
    batter.root.traverse(o => { if (o instanceof THREE.Mesh && !kept.has(o) && o.visible) { o.visible = false; hidden.push(o); } });
  }
  const subject = bowling ? bowler.root : alone ? batter.bat : batter.root;
  const glow = ALL_OUTFITS.find(o => o.id === ask.kit)?.glow ?? '#ffb08f';
  finishOf(bowling ? bowler.root : batter.root, ask.finish, ask.rough ?? .18, ask.rimColor ?? glow);
  renderer.setSize(w, h, false);
  camera.aspect = w / h; camera.fov = ask.fov ?? 28; camera.updateProjectionMatrix();
  // Fit him, bat and all: the bounding sphere at the distance that holds it in the narrower of the two angles.
  const box = new THREE.Box3().setFromObject(subject), sphere = box.getBoundingSphere(new THREE.Sphere());
  const half = THREE.MathUtils.degToRad(camera.fov / 2), halfW = Math.atan(Math.tan(half) * camera.aspect);
  const fit = sphere.radius / Math.sin(Math.min(half, halfW)) * (ask.dist ?? 1.02);
  // His chest faces off down the stage's x; azimuth turns round him from there.
  const az = THREE.MathUtils.degToRad(ask.az ?? 35), el = THREE.MathUtils.degToRad(ask.el ?? 4);
  const dir = new THREE.Vector3(-Math.cos(el) * Math.cos(az), Math.sin(el), Math.cos(el) * Math.sin(az));
  camera.position.copy(sphere.center).addScaledVector(dir, fit);
  camera.lookAt(sphere.center);
  key.position.copy(sphere.center).add(new THREE.Vector3(-3, 5, 3).applyAxisAngle(new THREE.Vector3(0, 1, 0), az - Math.PI / 4)); key.target.position.copy(sphere.center);
  rim.position.copy(sphere.center).addScaledVector(dir, -4).setY(sphere.center.y + 2); rim.target.position.copy(sphere.center);
  if (ask.finish === 'studio') {
    // The rims come from behind him either side of the lens, so each lights one edge; the key's shadow box holds him whole.
    const side = new THREE.Vector3().crossVectors(dir, new THREE.Vector3(0, 1, 0)).normalize();
    rim.position.copy(sphere.center).addScaledVector(dir, -3).addScaledVector(side, 3.4).setY(sphere.center.y + 1.4);
    rim2.position.copy(sphere.center).addScaledVector(dir, -3).addScaledVector(side, -3.4).setY(sphere.center.y + .6); rim2.target.position.copy(sphere.center);
    const cam = key.shadow.camera, r = sphere.radius * 1.15;
    cam.left = -r; cam.right = r; cam.top = r; cam.bottom = -r; cam.near = .1; cam.far = 20; cam.updateProjectionMatrix();
  }
  renderer.render(scene, camera);
  for (const o of hidden) o.visible = true;
  return ask.trim === false ? renderer.domElement.toDataURL('image/png') : trimmed(renderer.domElement, ask.margin ?? 24);
}

/** The render cut down to him and a margin, so every still is framed on the figure alone. */
function trimmed(source: HTMLCanvasElement, margin: number): string {
  const c = document.createElement('canvas'); c.width = source.width; c.height = source.height;
  const ctx = c.getContext('2d')!; ctx.drawImage(source, 0, 0);
  const { data, width, height } = ctx.getImageData(0, 0, c.width, c.height);
  let x0 = width, y0 = height, x1 = -1, y1 = -1;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    if (data[(y * width + x) * 4 + 3] > 8) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  }
  if (x1 < 0) return c.toDataURL('image/png');
  x0 = Math.max(0, x0 - margin); y0 = Math.max(0, y0 - margin); x1 = Math.min(width - 1, x1 + margin); y1 = Math.min(height - 1, y1 + margin);
  const out = document.createElement('canvas'); out.width = x1 - x0 + 1; out.height = y1 - y0 + 1;
  out.getContext('2d')!.drawImage(c, x0, y0, out.width, out.height, 0, 0, out.width, out.height);
  return out.toDataURL('image/png');
}

// The page: one still from the link (`?kit=papaya&bat=rage&shot=PULL&age=600&az=35`), on a checker so the transparency shows.
const params = new URLSearchParams(location.search);
const num = (k: string) => params.has(k) ? Number(params.get(k)) : undefined;
const img = document.createElement('img'); img.id = 'still'; document.body.append(img);
void render({
  kit: params.get('kit') ?? undefined, bat: params.get('bat') ?? undefined, guard: params.get('guard') ?? undefined,
  shot: params.get('shot') ?? undefined, age: num('age'), az: num('az'), el: num('el'), dist: num('dist'), fov: num('fov'),
  width: num('w'), height: num('h'),
}).then(url => { img.src = url; document.title = 'ready'; });

(window as unknown as { __stills: object }).__stills = {
  render,
  strokes: STILL_STROKES,
  kits: [...ALL_OUTFITS.map(o => o.id), ...SUPER10_KITS.map(k => k.id)],
  bats: ALL_BATS.map(b => b.id),
  guards: GLOVES.map(g => g.id),
};
