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
export function buildWicket(parent: THREE.Object3D, height: number, z: number): { timber: THREE.Mesh[]; bails: THREE.Mesh[] } {
  const paint = 0xf8f4e9, ink = 0x294f79, wood = 0xc39660;
  const batch = new Batch();
  batch.finish(paint, soft(paint, .72));
  batch.finish(ink, soft(ink, .76));
  const profile = [
    [0, .023], [.025, .025], [height - .055, .025],
    [height - .046, .024], [height - .042, .021],
    [height - .035, .021], [height - .031, .025],
    [height - .012, .025], [height - .005, .022], [height, .017],
    [height, 0],
  ];
  for (const x of [-.145, 0, .145]) {
    batch.add(new THREE.LatheGeometry(profile.map(([y, r]) => new THREE.Vector2(r, y)), 20).translate(x, 0, z), paint);
    // Two painted rings under the crown.
    for (const y of [height - .10, height - .135]) {
      batch.add(new THREE.CylinderGeometry(.0253, .0253, .013, 20, 1, true).translate(x, y, z), ink);
    }
  }
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
  return { timber: stumps, bails };
}
