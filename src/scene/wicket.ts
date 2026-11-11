import * as THREE from 'three';
import { Batch, soft } from './build';

/**
 * A wicket: three turned stumps with two painted rings each, and two
 * wooden bails on spigots. The same height and the same bail origins as the
 * plain cylinders and blocks before it, so nothing that times or animates the
 * stumps knows the difference.
 *
 * The stumps are one mesh a colour (`Batch`), two for the three of them; the
 * bails stay meshes of their own because each is flung on its own path when
 * the wicket goes. Both are handed back: the bails to be reset and flung, and
 * the stumps because a big moment draws the batter's own wicket back out over
 * the layer it puts up behind him (`GameScene`'s cut-out).
 */
/**
 * The Super10 arena's LED stumps (Figma section 18, node `483:5197`): what
 * `buildWicket` needs to build them, and what it hands back to light them.
 * The timber is turned with the wrap as its map; the crown (the top 55 mm),
 * the two rings and the bails are meshes of their own, so lighting them is a
 * colour on their own materials and nothing else.
 */
export interface LedWicket { wrap: THREE.Texture }
export interface WicketLights { crown: THREE.MeshStandardMaterial; rings: THREE.MeshStandardMaterial; bails: THREE.MeshStandardMaterial }
/** The LED stump's measures: the crown's height, the timber turned in this many even steps so the wrap's v runs straight up it, and how bright the rings stand at rest. */
export const LED = { crown: .055, steps: 24, rings: .6 } as const;

/**
 * Where the three stumps stand across the crease: off, middle, leg on a
 * right-hander's stage (the stage is mirrored for a left-hander).
 */
export const STUMP_XS = [-.145, 0, .145] as const;

/**
 * Each of the wicket's three stumps again on its own, in a group of its own
 * standing on its foot, hidden: the batched wicket is one mesh a colour, so
 * one stump cannot move without the other two, and the batter's wicket is
 * swapped for these only when the ball knocks one over (`stumpsDown.ts`), so
 * they cost nothing the rest of the time.
 */
function loose(parent: THREE.Object3D, z: number, stump: (batch: Batch) => void, finish: (batch: Batch) => void): THREE.Group[] {
  return STUMP_XS.map(x => {
    const group = new THREE.Group();
    group.name = 'Stump knocked loose';
    group.position.set(x, 0, z);
    group.visible = false;
    const batch = new Batch();
    finish(batch); stump(batch);
    batch.build(group);
    parent.add(group);
    return group;
  });
}

export function buildWicket(parent: THREE.Object3D, height: number, z: number, led?: LedWicket, loosen = false): { timber: THREE.Mesh[]; bails: THREE.Mesh[]; lights?: WicketLights; loose?: THREE.Group[] } {
  if (led) return ledWicket(parent, height, z, led, loosen);
  const paint = 0xf8f4e9, ink = 0x294f79, wood = 0xc39660;
  const paintFinish = soft(paint, .72), inkFinish = soft(ink, .76);
  const finish = (batch: Batch) => { batch.finish(paint, paintFinish); batch.finish(ink, inkFinish); };
  const batch = new Batch();
  finish(batch);
  const profile = [
    [0, .023], [.025, .025], [height - .055, .025],
    [height - .046, .024], [height - .042, .021],
    [height - .035, .021], [height - .031, .025],
    [height - .012, .025], [height - .005, .022], [height, .017],
    [height, 0],
  ];
  const stump = (into: Batch, x = 0, at = 0) => {
    into.add(new THREE.LatheGeometry(profile.map(([y, r]) => new THREE.Vector2(r, y)), 20).translate(x, 0, at), paint);
    // Two painted rings under the crown.
    for (const y of [height - .10, height - .135]) {
      into.add(new THREE.CylinderGeometry(.0253, .0253, .013, 20, 1, true).translate(x, y, at), ink);
    }
  };
  for (const x of STUMP_XS) stump(batch, x, z);
  const stumps = batch.build(parent);

  // Spigots sit on the stump crowns; the thicker barrel and carved shoulders
  // make a bail read as timber rather than a rectangular orange block.
  const bailProfile = [
    [-.08, 0], [-.08, .008], [-.059, .008], [-.053, .015],
    [-.045, .018], [-.039, .018], [-.036, .015], [-.032, .018],
    [.032, .018], [.036, .015], [.039, .018], [.045, .018],
    [.053, .015], [.059, .008], [.08, .008], [.08, 0],
  ];
  const geometry = new THREE.LatheGeometry(bailProfile.map(([y, r]) => new THREE.Vector2(r, y)), 16).rotateZ(Math.PI / 2).translate(0, -.012, 0);
  const bails = [-.073, .073].map(x => {
    const bail = new THREE.Mesh(geometry, soft(wood, .7));
    bail.name = 'Turned wooden bail';
    bail.position.set(x, height + .02, z);
    bail.castShadow = true; bail.receiveShadow = true;
    parent.add(bail);
    return bail;
  });
  return { timber: stumps, bails, ...(loosen ? { loose: loose(parent, z, b => stump(b), finish) } : {}) };
}

/**
 * The arena's LED wicket: the same height, thickness, spacing and bail
 * origins as the painted one, so nothing that times or animates the stumps
 * knows the difference. Each stump is turned from a quarter round, so the
 * wrap's u .25 faces the keeper and the camera and u .75 the bowler, with the
 * seam down the side; its timber is plate violet, satin, printed with the
 * wrap. Over it the frosted crown, and the two rings where the painted ones
 * are, each its own material for the arena to light (`stumpLight`).
 */
function ledWicket(parent: THREE.Object3D, height: number, z: number, led: LedWicket, loosen: boolean) {
  const batch = new Batch();
  const timber = new THREE.MeshStandardMaterial({ color: 0xffffff, map: led.wrap, roughness: .55, metalness: 0 });
  const crown = new THREE.MeshStandardMaterial({ color: 0xe4e1f2, roughness: .35, emissive: 0x000000 });
  const rings = new THREE.MeshStandardMaterial({ color: 0x2a0e5c, roughness: .4, emissive: 0xc6ff1a, emissiveIntensity: LED.rings });
  const TIMBER = 0x2a0e5c, CROWN = 0xe4e1f2, RING = 0xc6ff1a;
  const finish = (into: Batch) => { into.finish(TIMBER, timber); into.finish(CROWN, crown); into.finish(RING, rings); };
  finish(batch);
  const top = height - LED.crown;
  // Straight timber in even steps, so v is the height up it, a hair narrower at the foot.
  const body = Array.from({ length: LED.steps + 1 }, (_, i) => new THREE.Vector2(i === 0 ? .023 : .025, i / LED.steps * top));
  const cap = [[top, .025], [height - .046, .024], [height - .042, .021], [height - .035, .021], [height - .031, .025],
    [height - .012, .025], [height - .005, .022], [height, .017], [height, 0]].map(([y, r]) => new THREE.Vector2(r, y));
  const stump = (into: Batch, x = 0, at = 0) => {
    into.add(new THREE.LatheGeometry(body, 20, Math.PI / 2).translate(x, 0, at), TIMBER);
    into.add(new THREE.LatheGeometry(cap, 20, Math.PI / 2).translate(x, 0, at), CROWN);
    for (const y of [height - .10, height - .135]) into.add(new THREE.CylinderGeometry(.0256, .0256, .013, 20, 1, true).translate(x, y, at), RING);
  };
  for (const x of STUMP_XS) stump(batch, x, z);
  const stumps = batch.build(parent);
  // The bails: frosted, a lime core, lit with the stumps.
  const bailFinish = new THREE.MeshStandardMaterial({ color: 0xe4e1f2, roughness: .35, emissive: 0xc6ff1a, emissiveIntensity: .25 });
  const bailProfile = [
    [-.08, 0], [-.08, .008], [-.059, .008], [-.053, .015],
    [-.045, .018], [-.039, .018], [-.036, .015], [-.032, .018],
    [.032, .018], [.036, .015], [.039, .018], [.045, .018],
    [.053, .015], [.059, .008], [.08, .008], [.08, 0],
  ];
  const geometry = new THREE.LatheGeometry(bailProfile.map(([y, r]) => new THREE.Vector2(r, y)), 16).rotateZ(Math.PI / 2).translate(0, -.012, 0);
  const bails = [-.073, .073].map(x => {
    const bail = new THREE.Mesh(geometry, bailFinish);
    bail.name = 'LED bail';
    bail.position.set(x, height + .02, z);
    bail.castShadow = true; bail.receiveShadow = true;
    parent.add(bail);
    return bail;
  });
  return { timber: stumps, bails, lights: { crown, rings, bails: bailFinish }, ...(loosen ? { loose: loose(parent, z, b => stump(b), finish) } : {}) };
}
