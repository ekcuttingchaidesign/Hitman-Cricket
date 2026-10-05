import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/** Merge only explicitly named rigid groups. Animated limbs and grip controls
 * remain independent. Materials and dress roles retain their original identity.
 */
export function compactRigidParts(parent: THREE.Object3D): THREE.Mesh[] {
  const groups = new Map<string, THREE.Mesh[]>();
  for (const child of parent.children) {
    if (!(child instanceof THREE.Mesh) || child.children.length || Array.isArray(child.material)) continue;
    const key = `${child.material.uuid}:${child.castShadow}:${child.receiveShadow}:${child.userData.role ?? ''}`;
    const list = groups.get(key) ?? []; list.push(child); groups.set(key, list);
  }
  const made: THREE.Mesh[] = [];
  for (const list of groups.values()) {
    if (list.length < 2) continue;
    const geometries = list.map(mesh => {
      mesh.updateMatrix();
      const g = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
      return g.applyMatrix4(mesh.matrix);
    });
    const joined = mergeGeometries(geometries);
    const geometry = mergeVertices(joined);
    joined.dispose(); geometries.forEach(g => g.dispose());
    const first = list[0], mesh = new THREE.Mesh(geometry, first.material);
    mesh.name = 'Batched rigid detail'; mesh.userData = { ...first.userData };
    mesh.castShadow = first.castShadow; mesh.receiveShadow = first.receiveShadow;
    list.forEach(part => parent.remove(part)); parent.add(mesh); made.push(mesh);
  }
  return made;
}

/** Repeated root-level limb shapes share a draw. Sources remain as hidden rig
 * controls, so the IK, inspect hooks and fielding routines keep the same joints.
 * Matrices are local to root; its world reflection is never an instance matrix.
 */
export class LimbInstances {
  readonly meshes: THREE.InstancedMesh[] = [];
  private groups: { mesh: THREE.InstancedMesh; sources: THREE.Mesh[] }[] = [];
  constructor(root: THREE.Object3D) {
    const groups = new Map<string, THREE.Mesh[]>();
    for (const child of root.children) {
      if (!(child instanceof THREE.Mesh) || child.children.length || Array.isArray(child.material)) continue;
      const key = `${child.geometry.uuid}:${child.material.uuid}:${child.userData.role ?? ''}`;
      const list = groups.get(key) ?? []; list.push(child); groups.set(key, list);
    }
    for (const sources of groups.values()) {
      if (sources.length < 2) continue;
      const first = sources[0];
      const mesh = new THREE.InstancedMesh(first.geometry, first.material, sources.length);
      mesh.name = 'Instanced articulated limbs'; mesh.userData = { ...first.userData };
      mesh.castShadow = first.castShadow; mesh.receiveShadow = first.receiveShadow;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      // Encloses all local IK poses; root carries running, diving and mirroring.
      mesh.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 1, 0), 3);
      sources.forEach(source => { source.visible = false; });
      root.add(mesh); this.meshes.push(mesh); this.groups.push({ mesh, sources });
    }
    this.update();
  }
  update() {
    for (const { mesh, sources } of this.groups) {
      sources.forEach((source, i) => { source.updateMatrix(); mesh.setMatrixAt(i, source.matrix); });
      mesh.instanceMatrix.needsUpdate = true;
    }
  }
}
