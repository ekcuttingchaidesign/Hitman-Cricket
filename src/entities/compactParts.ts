import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/** Merge only explicitly named rigid groups. Animated limbs and grip controls
 * remain independent, as does any part marked `userData.moving`. Materials and dress roles retain their original identity.
 */
export function compactRigidParts(parent: THREE.Object3D): THREE.Mesh[] {
  const groups = new Map<string, THREE.Mesh[]>();
  for (const child of parent.children) {
    if (!(child instanceof THREE.Mesh) || child.children.length || Array.isArray(child.material) || child.userData.moving) continue;
    const key = `${child.material.uuid}:${child.castShadow}:${child.receiveShadow}:${child.userData.role ?? ''}`;
    const list = groups.get(key) ?? []; list.push(child); groups.set(key, list);
  }
  const made: THREE.Mesh[] = [];
  for (const list of groups.values()) {
    if (list.length < 2) continue;
    // Indexed shapes join as they are. A group that mixes in an unindexed one
    // (the rounded boxes) is joined unrolled and left that way: welding the
    // corners back together saved a few vertices and was most of what building
    // a figure cost.
    const indexed = list.every(mesh => mesh.geometry.index);
    const geometries = list.map(mesh => {
      mesh.updateMatrix();
      const g = indexed || !mesh.geometry.index ? mesh.geometry.clone() : mesh.geometry.toNonIndexed();
      return g.applyMatrix4(mesh.matrix);
    });
    const geometry = mergeGeometries(geometries);
    geometries.forEach(g => g.dispose());
    const first = list[0], mesh = new THREE.Mesh(geometry, first.material);
    mesh.name = 'Batched rigid detail'; mesh.userData = { ...first.userData };
    mesh.castShadow = first.castShadow; mesh.receiveShadow = first.receiveShadow;
    list.forEach(part => parent.remove(part)); parent.add(mesh); made.push(mesh);
  }
  return made;
}
