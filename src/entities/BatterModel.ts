import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { solveJoint } from './rig';

/**
 * The modelled batter, driven by the code-built one.
 *
 * The game's batter is a solver: every frame it works out where the hips,
 * chest, head, both feet, both knees, both elbows and the bat are, from the
 * keyed poses of whichever stroke is being played. That solver stays the
 * authority on gameplay — where the blade is when the ball arrives is what
 * the whole timing model is built on. This class takes those solved joints
 * and poses a skinned character to match, so the figure on screen is the
 * modelled one while everything the tests and the rules measure is
 * untouched.
 *
 * The model has its own proportions (the cover's: big helmet, short limbs),
 * so it is scaled to the game's leg length and its arms are allowed to
 * stretch a little at full reach rather than let the gloves come off the
 * handle. The hands are glued to the bat the way they are in the model's
 * rest pose, which is a perfect grip, and the arms are solved back from
 * there.
 */

/** What the solver hands over each frame, all in the batter root's space. */
export interface BatterJoints {
  hip: THREE.Vector3; hipQuaternion: THREE.Quaternion;
  torsoQuaternion: THREE.Quaternion;
  headQuaternion: THREE.Quaternion;
  bat: THREE.Vector3; batQuaternion: THREE.Quaternion;
  /** Index 0 is the top hand and the front leg: the left ones, for a right-hander. */
  elbows: THREE.Vector3[];
  knees: THREE.Vector3[];
  feet: THREE.Vector3[];
}

interface Rest { world: THREE.Quaternion; local: THREE.Quaternion; position: THREE.Vector3; scale: THREE.Vector3 }
interface Limb { upper: THREE.Bone; lower: THREE.Bone; end: THREE.Bone; upperLength: number; lowerLength: number; restNormal: THREE.Vector3; restUpper: THREE.Vector3; restLower: THREE.Vector3; normal: THREE.Vector3 }

const Y = new THREE.Vector3(0, 1, 0);
/** How far the arms may stretch past the model's own reach before the gloves leave the handle. */
const MAX_STRETCH = 1.35;

export class BatterModel {
  readonly root = new THREE.Group();
  /** Model units to game metres. */
  readonly scale: number;
  private bones = new Map<string, THREE.Bone>();
  private rest = new Map<THREE.Object3D, Rest>();
  private arms: Limb[] = [];
  private legs: Limb[] = [];
  /** Each hand's place on the bat, from the model's own grip. */
  private handOnBat: THREE.Matrix4[] = [];
  /** The model's bat frame expressed in the game's: blade down -Y, face +Z, origin between the hands. */
  private batFrame = new THREE.Matrix4();
  private materials = new Map<string, THREE.MeshStandardMaterial>();
  /** The loaded scene; every bone is measured relative to it, never to the world. */
  private scene: THREE.Group;
  private sceneInverse = new THREE.Matrix4();
  private q = new THREE.Quaternion(); private q2 = new THREE.Quaternion(); private m = new THREE.Matrix4();
  private v = new THREE.Vector3();

  static load(url: string) {
    return new GLTFLoader().loadAsync(url).then(gltf => new BatterModel(gltf.scene));
  }

  constructor(scene: THREE.Group) {
    this.scene = scene;
    scene.updateMatrixWorld(true);
    scene.traverse(o => {
      if ((o as THREE.Bone).isBone) this.bones.set(o.name, o as THREE.Bone);
      if (o instanceof THREE.Mesh) {
        o.castShadow = o.receiveShadow = true; o.frustumCulled = false;
        const material = o.material as THREE.MeshStandardMaterial;
        if (material.name) this.materials.set(material.name, material);
      }
      this.rest.set(o, { world: o.getWorldQuaternion(new THREE.Quaternion()), local: o.quaternion.clone(), position: o.position.clone(), scale: o.scale.clone() });
    });
    const bone = (name: string) => { const b = this.bones.get(name); if (!b) throw new Error(`batter model has no bone ${name}`); return b; };
    const at = (o: THREE.Object3D) => o.getWorldPosition(new THREE.Vector3());

    // Scale to the game's leg, which is what the feet are planted by.
    const legLength = at(bone('DEF_thighL')).distanceTo(at(bone('DEF_shinL'))) + at(bone('DEF_shinL')).distanceTo(at(bone('DEF_footL')));
    this.scale = (0.43 + 0.44) / legLength;

    const limb = (upper: string, lower: string, end: string): Limb => {
      const u = bone(upper), l = bone(lower), e = bone(end);
      const pu = at(u), pl = at(l), pe = at(e);
      const restUpper = pl.clone().sub(pu).normalize(), restLower = pe.clone().sub(pl).normalize();
      const restNormal = new THREE.Vector3().crossVectors(restUpper, restLower).normalize();
      return { upper: u, lower: l, end: e, upperLength: pu.distanceTo(pl), lowerLength: pl.distanceTo(pe), restUpper, restLower, restNormal, normal: restNormal.clone() };
    };
    this.arms = [limb('DEF_upper_armL', 'DEF_forearmL', 'DEF_handL'), limb('DEF_upper_armR', 'DEF_forearmR', 'DEF_handR')];
    this.legs = [limb('DEF_thighL', 'DEF_shinL', 'DEF_footL'), limb('DEF_thighR', 'DEF_shinR', 'DEF_footR')];

    // The bat: find which way its blade runs and which way its face looks
    // from the geometry hanging off the bat bone, then build the frame that
    // turns the game's bat transform into the model's.
    const bat = bone('CTRL_bat');
    const box = new THREE.Box3(); const local = new THREE.Matrix4().copy(bat.matrixWorld).invert();
    let centroid = new THREE.Vector3(), weight = 0;
    bat.traverse(o => { if (o instanceof THREE.Mesh) {
      const g = o.geometry.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(local, o.matrixWorld));
      g.computeBoundingBox(); box.union(g.boundingBox!);
      const p = g.attributes.position; for (let i = 0; i < p.count; i++) { centroid.add(new THREE.Vector3().fromBufferAttribute(p, i)); weight++; }
      g.dispose();
    } });
    centroid.divideScalar(Math.max(1, weight));
    const size = box.getSize(new THREE.Vector3()), mid = box.getCenter(new THREE.Vector3());
    const axes = [new THREE.Vector3(1, 0, 0), Y, new THREE.Vector3(0, 0, 1)];
    const longest = [size.x, size.y, size.z].indexOf(Math.max(size.x, size.y, size.z));
    const thinnest = [size.x, size.y, size.z].indexOf(Math.min(size.x, size.y, size.z));
    const handsMid = at(bone('DEF_handL')).add(at(bone('DEF_handR'))).multiplyScalar(0.5).applyMatrix4(local);
    // The hands hold the handle, so the blade runs from them towards the far
    // end of the bat, whichever way the bone happens to point.
    const blade = axes[longest].clone().multiplyScalar(Math.sign(mid.getComponent(longest) - handsMid.getComponent(longest)) || 1);
    // The spine bulges on the back, so the vertices lean away from the face.
    const face = axes[thinnest].clone().multiplyScalar(-(Math.sign(centroid.getComponent(thinnest) - mid.getComponent(thinnest)) || 1));
    const gy = blade.clone().negate(), gz = face, gx = new THREE.Vector3().crossVectors(gy, gz).normalize();
    const gameToModel = new THREE.Matrix4().makeBasis(gx, gy, gz);
    // modelBat = gameBat · gameToModel⁻¹ · translate(-handsMid)
    this.batFrame.copy(gameToModel).invert().multiply(new THREE.Matrix4().makeTranslation(-handsMid.x, -handsMid.y, -handsMid.z));
    for (const name of ['DEF_handL', 'DEF_handR']) this.handOnBat.push(new THREE.Matrix4().multiplyMatrices(local, bone(name).matrixWorld));
    // Only now, with every rest measurement taken in the model's own units.
    this.root.scale.setScalar(this.scale);
    this.root.add(scene);
  }

  /** The kit's colours, by material: the model carries its own, these override them. */
  dress(colors: { shirt: number; trousers: number; pads: number }) {
    for (const [name, material] of this.materials) {
      if (/Midnight navy woven/.test(name)) material.color.setHex(colors.shirt);
      else if (/Warm white cloth/.test(name)) material.color.setHex(colors.trousers);
      else if (/Warm white moulded/.test(name)) material.color.setHex(colors.pads);
    }
  }

  /** A bone's transform relative to the model's scene root, whatever the world is doing. */
  private rel(o: THREE.Object3D) { return this.m.multiplyMatrices(this.sceneInverse, o.matrixWorld); }
  private relQuaternion(o: THREE.Object3D, into: THREE.Quaternion) { this.rel(o).decompose(new THREE.Vector3(), into, new THREE.Vector3()); return into; }
  private relPosition(o: THREE.Object3D, into: THREE.Vector3) { return into.setFromMatrixPosition(this.rel(o)); }
  /**
   * Set a bone's orientation so that its rest direction turns to `dir` and
   * its rest bend plane turns to `normal`, given as world directions in the
   * model's own space.
   */
  private aim(bone: THREE.Bone, dir: THREE.Vector3, normal: THREE.Vector3, restDir: THREE.Vector3, restNormal: THREE.Vector3) {
    const rest = this.rest.get(bone)!;
    const target = new THREE.Matrix4().makeBasis(dir, normal, new THREE.Vector3().crossVectors(dir, normal).normalize());
    const from = new THREE.Matrix4().makeBasis(restDir, restNormal, new THREE.Vector3().crossVectors(restDir, restNormal).normalize());
    const align = this.q.setFromRotationMatrix(target.multiply(from.transpose()));
    const world = align.multiply(rest.world);
    this.relQuaternion(bone.parent!, this.q2).invert();
    bone.quaternion.copy(this.q2.multiply(world));
    bone.updateMatrixWorld(true);
  }

  /** A bone whose world orientation should be the game's, with the rest pose as its zero. */
  private orient(bone: THREE.Bone, game: THREE.Quaternion) {
    const rest = this.rest.get(bone)!;
    const world = this.q.copy(game).multiply(rest.world);
    this.relQuaternion(bone.parent!, this.q2).invert();
    bone.quaternion.copy(this.q2.multiply(world));
    bone.updateMatrixWorld(true);
  }

  /** Solve a limb from where its top now is to `end`, bending towards `pole`, stretching if it must. */
  private reach(limb: Limb, end: THREE.Vector3, pole: THREE.Vector3, endQuaternion?: THREE.Quaternion) {
    const top = this.relPosition(limb.upper, this.v).clone();
    const distance = top.distanceTo(end);
    const stretch = THREE.MathUtils.clamp(distance / (limb.upperLength + limb.lowerLength), 1, MAX_STRETCH);
    const joint = solveJoint(top, end, limb.upperLength * stretch, limb.lowerLength * stretch, pole);
    const upper = new THREE.Vector3().subVectors(joint, top).normalize();
    const lower = new THREE.Vector3().subVectors(end, joint).normalize();
    const normal = new THREE.Vector3().crossVectors(upper, lower);
    if (normal.lengthSq() > 1e-6) limb.normal.copy(normal.normalize());
    else { limb.normal.addScaledVector(upper, -limb.normal.dot(upper)).normalize(); }
    // Uniform stretch on the upper bone, inherited by the lower, undone at the end.
    limb.upper.scale.setScalar(stretch); limb.end.scale.setScalar(1 / stretch);
    this.aim(limb.upper, upper, limb.normal, limb.restUpper, limb.restNormal);
    this.aim(limb.lower, lower, limb.normal, limb.restLower, limb.restNormal);
    if (endQuaternion) {
      this.relQuaternion(limb.end.parent!, this.q2).invert();
      limb.end.quaternion.copy(this.q2.multiply(endQuaternion));
    } else limb.end.quaternion.copy(this.rest.get(limb.end)!.local);
    limb.end.updateMatrixWorld(true);
  }

  pose(j: BatterJoints) {
    // Everything below is measured against the scene root, so its matrix and
    // every bone's must be current before the first read.
    this.scene.updateWorldMatrix(true, true);
    this.sceneInverse.copy(this.scene.matrixWorld).invert();
    const s = 1 / this.scale;
    const toModel = (p: THREE.Vector3) => p.clone().multiplyScalar(s);
    const pelvis = this.bones.get('CTRL_pelvis')!, spine = this.bones.get('CTRL_spine')!, chest = this.bones.get('CTRL_chest')!, head = this.bones.get('CTRL_head')!, bat = this.bones.get('CTRL_bat')!;
    pelvis.position.copy(toModel(j.hip));
    this.orient(pelvis, j.hipQuaternion);
    this.orient(spine, j.torsoQuaternion);
    this.orient(chest, j.torsoQuaternion);
    this.orient(head, j.headQuaternion);
    // The bat goes where the game's bat is; the hands ride on it.
    const batMatrix = new THREE.Matrix4().compose(toModel(j.bat), j.batQuaternion, new THREE.Vector3(1, 1, 1)).multiply(this.batFrame);
    batMatrix.decompose(bat.position, bat.quaternion, this.v); bat.updateMatrixWorld(true);
    for (let i = 0; i < 2; i++) {
      const hand = new THREE.Matrix4().multiplyMatrices(batMatrix, this.handOnBat[i]);
      const handPosition = new THREE.Vector3().setFromMatrixPosition(hand);
      const handQuaternion = new THREE.Quaternion().setFromRotationMatrix(hand);
      this.reach(this.arms[i], handPosition, toModel(j.elbows[i]), handQuaternion);
      this.reach(this.legs[i], toModel(j.feet[i]), toModel(j.knees[i]));
    }
  }
}
