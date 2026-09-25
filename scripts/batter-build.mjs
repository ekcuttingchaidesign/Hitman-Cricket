// Turns the authored batter (a Blender file of a million triangles, four
// scenes and 340 meshes) into the asset the game loads: one scene, the
// skeleton, a few merged meshes, tens of thousands of triangles.
//
//   node scripts/batter-build.mjs <source.glb> public/models/batter.glb [triangles]
//
// What it does, in order: keeps the character scene only; drops the studio
// backdrop, the grille's construction curves and the stitching seams; welds
// and simplifies every mesh towards the triangle budget with skin weights
// kept intact; bakes every rigid part (helmet, grille, gloves, bat) into the
// frame of the bone it hangs from and merges those by bone and material;
// merges the skinned meshes by material onto one skeleton. Colours stay in
// the materials, so the game can swap kits by material name.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { MeshoptSimplifier } from 'meshoptimizer';
import { readFile, writeFile } from 'node:fs/promises';

globalThis.FileReader = class { readAsArrayBuffer(blob) { blob.arrayBuffer().then(b => { this.result = b; this.onloadend?.(); }); } };

const [input, output, budgetArg] = process.argv.slice(2);
const BUDGET = Number(budgetArg ?? 42000);
/** The bones the game will drive. Rigid parts are baked onto the nearest of these. */
const KEEP = new Set(['CTRL_root', 'CTRL_pelvis', 'CTRL_spine', 'CTRL_chest', 'CTRL_neck', 'CTRL_head', 'CTRL_bat',
  'CTRL_clavicleL', 'CTRL_clavicleR', 'DEF_upper_armL', 'DEF_upper_armR', 'DEF_forearmL', 'DEF_forearmR', 'DEF_handL', 'DEF_handR',
  'DEF_thighL', 'DEF_thighR', 'DEF_shinL', 'DEF_shinR', 'DEF_footL', 'DEF_footR']);

await MeshoptSimplifier.ready;
const source = (await readFile(input)).buffer;
const gltf = await new Promise((res, rej) => new GLTFLoader().parse(source, '', res, rej));
const scene = gltf.scenes.find(s => /Character_Studio/.test(s.name)) ?? gltf.scene;
// Four scenes share their nodes, so the loader numbered every name; the
// character's bones want their plain names back.
scene.traverse(o => { o.name = o.name.replace(/_\d+$/, ''); });
scene.updateMatrixWorld(true);

const drop = o => o.isMesh && (/^Grille_source|stitch|STUDIO/i.test(o.name) || /^STUDIO/.test(o.material?.name ?? ''));
const meshes = [], dropped = []; scene.traverse(o => { if (o.isMesh) (drop(o) ? dropped : meshes).push(o); });
for (const mesh of dropped) mesh.parent.remove(mesh);
const tris = g => (g.index ? g.index.count : g.attributes.position.count) / 3;
const before = meshes.reduce((n, m) => n + tris(m.geometry), 0);
console.log(`kept ${meshes.length} meshes, ${Math.round(before)} triangles; budget ${BUDGET}`);

/**
 * Weld, simplify and recompute smooth normals. The body keeps a higher
 * floor and a tighter error bound because it deforms and fills the frame;
 * the gloves and the hardware take the deeper cuts.
 */
function slim(geometry, share, floor, error) {
  let g = geometry.clone();
  g.deleteAttribute('normal'); g.deleteAttribute('uv'); g.deleteAttribute('tangent'); g.deleteAttribute('color');
  g = mergeVertices(g, 1e-5);
  const target = Math.max(floor, Math.round(tris(g) * share)) * 3;
  if (g.index.count > target) {
    const positions = g.attributes.position.array;
    const [indices] = MeshoptSimplifier.simplify(new Uint32Array(g.index.array), positions, 3, target, error, ['LockBorder']);
    g.setIndex(new THREE.BufferAttribute(indices, 1));
    // The simplifier drops triangles, not vertices; rebuild so only the
    // vertices still in use are kept.
    g = mergeVertices(g.toNonIndexed(), 1e-6);
  }
  g.computeVertexNormals();
  return g;
}
const share = Math.min(1, BUDGET / before);
const budgetFor = mesh => mesh.isSkinnedMesh ? [Math.max(share, 0.3), 800, 0.006] : /Glove|Grille|Guard|GUARD/.test(mesh.name) ? [share * 0.6, 48, 0.03] : [share, 48, 0.02];

// Rigid parts, baked onto the bone the game drives, then merged per bone and material.
const rigid = new Map(); // bone -> material -> geometries
const skinned = new Map(); // material -> geometries
let skeleton = null;
const inverse = new THREE.Matrix4();
const isDigit = mesh => /Back_number|Back number/.test(mesh.name);
for (const mesh of meshes) {
  if (isDigit(mesh)) continue; // the shirt number is skinned onto the jersey below, not baked to a bone
  const g = slim(mesh.geometry, ...budgetFor(mesh));
  if (mesh.isSkinnedMesh) {
    skeleton ??= mesh.skeleton;
    if (mesh.skeleton !== skeleton) {
      // A second skin over the same bones: remap its indices by bone name.
      const map = mesh.skeleton.bones.map(b => skeleton.bones.findIndex(k => k.name === b.name));
      const idx = g.attributes.skinIndex; for (let i = 0; i < idx.count * 4; i++) idx.array[i] = map[idx.array[i]];
    }
    const pile = skinned.get(mesh.material) ?? []; pile.push(g); skinned.set(mesh.material, pile);
    continue;
  }
  let bone = mesh.parent; while (bone && !(bone.isBone && KEEP.has(bone.name))) bone = bone.parent;
  if (!bone) { console.log('  no bone for', mesh.name); continue; }
  inverse.copy(bone.matrixWorld).invert();
  g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inverse, mesh.matrixWorld));
  const byMaterial = rigid.get(bone) ?? new Map(); rigid.set(bone, byMaterial);
  const pile = byMaterial.get(mesh.material) ?? []; pile.push(g); byMaterial.set(mesh.material, pile);
}

// The shirt number is authored a few centimetres off the back. Sit it on
// the jersey: as far back as the shirt reaches at that height, and a hair more.
{
  const digits = meshes.filter(isDigit);
  const jersey0 = meshes.find(m => m.isSkinnedMesh && /Midnight navy/.test(m.material?.name ?? ''));
  for (const number of digits) { const jersey = jersey0;
  if (number && jersey) {
    const g = number.geometry.clone().applyMatrix4(number.matrixWorld); g.computeBoundingBox();
    const box = g.boundingBox, p = jersey.geometry.attributes.position; let back = Infinity;
    const v = new THREE.Vector3(), jerseyWorld = jersey.matrixWorld;
    for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i).applyMatrix4(jerseyWorld); if (v.y > box.min.y && v.y < box.max.y && Math.abs(v.x - (box.min.x + box.max.x) / 2) < 0.12) back = Math.min(back, v.z); }
    if (Number.isFinite(back)) {
      // The digits are a flat decal on a curved back, so they sit a
      // centimetre behind the shirt's deepest point: clear of it at the spine
      // and only a little further off where the back curves away. Moved as a
      // node in its parent's space, so any scale or turn on the node itself
      // is honoured.
      const shift = back - 0.012 - (box.min.z + box.max.z) / 2;
      const inv = new THREE.Matrix4().copy(number.parent.matrixWorld).invert();
      const at = number.getWorldPosition(new THREE.Vector3());
      number.position.copy(at.clone().add(new THREE.Vector3(0, 0, shift)).applyMatrix4(inv));
      number.updateMatrixWorld(true);
      const after = number.geometry.clone().applyMatrix4(number.matrixWorld); after.computeBoundingBox();
      console.log(`shirt number moved ${shift.toFixed(3)} onto the back (${number.name}): z ${after.boundingBox.min.z.toFixed(3)}..${after.boundingBox.max.z.toFixed(3)} against ${back.toFixed(3)}`);
    }
  } }
}
// The digits ride on the chest bone, but the shirt's back is a blend of
// pelvis, spine and chest, so on any lean the two part company. Give the
// digits the skin weights of the nearest shirt vertices and merge them into
// the shirt's own skinned pile, so they move with the cloth they are on.
const digitsSkinned = [];
{
  const jersey = meshes.find(m => m.isSkinnedMesh && /Midnight navy/.test(m.material?.name ?? ''));
  if (jersey) {
    const jp = jersey.geometry.attributes.position, ji = jersey.geometry.attributes.skinIndex, jw = jersey.geometry.attributes.skinWeight;
    const jv = new THREE.Vector3(), v = new THREE.Vector3();
    for (const number of meshes.filter(isDigit)) {
      let g = mergeVertices(number.geometry.clone().applyMatrix4(number.matrixWorld), 1e-6);
      g.deleteAttribute('uv'); g.deleteAttribute('normal'); g.computeVertexNormals();
      const n = g.attributes.position.count, index = new Uint16Array(n * 4), weight = new Float32Array(n * 4);
      // A flat decal on a curved back stands off it at the sides, and from
      // side-on that shows as a stroke floating beside the torso. So each
      // digit vertex keeps its place across the back but takes its depth
      // from the nearest shirt vertex behind it, a few millimetres proud.
      const toJersey = new THREE.Matrix4().copy(jersey.matrixWorld).invert(), fromJersey = jersey.matrixWorld.clone();
      const centreZ = (() => { let lo = Infinity, hi = -Infinity; for (let k = 0; k < jp.count; k++) { const z = jp.getZ(k); lo = Math.min(lo, z); hi = Math.max(hi, z); } return (lo + hi) / 2; })();
      for (let i = 0; i < n; i++) {
        v.fromBufferAttribute(g.attributes.position, i).applyMatrix4(toJersey);
        let best = -1, bestD = Infinity;
        for (let k = 0; k < jp.count; k++) {
          if (jp.getZ(k) > centreZ) continue; // the back half only
          const dx = jp.getX(k) - v.x, dy = jp.getY(k) - v.y, d = dx * dx + dy * dy; if (d < bestD) { bestD = d; best = k; }
        }
        v.z = jp.getZ(best) - 0.006;
        g.attributes.position.setXYZ(i, ...v.applyMatrix4(fromJersey).toArray());
        for (let c = 0; c < 4; c++) { index[i * 4 + c] = ji.getComponent(best, c); weight[i * 4 + c] = jw.getComponent(best, c); }
      }
      g.computeVertexNormals();
      g.setAttribute('skinIndex', new THREE.BufferAttribute(index, 4)); g.setAttribute('skinWeight', new THREE.BufferAttribute(weight, 4));
      digitsSkinned.push([number, g]);
    }
  }
}
for (const [number, g] of digitsSkinned) { meshes.splice(meshes.indexOf(number), 1); const pile = skinned.get(number.material) ?? []; pile.push(g); skinned.set(number.material, pile); number.parent.remove(number); console.log(`skinned ${number.name} onto the shirt`); }
// Take every mesh out, then put the merged ones back.
for (const mesh of meshes) mesh.parent.remove(mesh);
let after = 0, count = 0;
for (const [bone, byMaterial] of rigid) for (const [material, pile] of byMaterial) {
  const merged = mergeGeometries(pile); after += tris(merged); count++;
  const mesh = new THREE.Mesh(merged, material); mesh.name = `${bone.name} | ${material.name}`; mesh.castShadow = mesh.receiveShadow = true;
  bone.add(mesh);
}
const armature = scene.getObjectByProperty('isBone', true).parent;
for (const [material, pile] of skinned) {
  const merged = mergeGeometries(pile); after += tris(merged); count++;
  const mesh = new THREE.SkinnedMesh(merged, material); mesh.name = `Skin | ${material.name}`; mesh.castShadow = mesh.receiveShadow = true;
  mesh.frustumCulled = false;
  armature.add(mesh); mesh.bind(skeleton, new THREE.Matrix4());
}
gltf.animations.length = 0;
console.log(`built ${count} meshes, ${Math.round(after)} triangles`);
for (const [bone, byMaterial] of rigid) console.log(`  ${bone.name}: ${[...byMaterial.keys()].map(m => m.name.split('|')[0].trim()).join(', ')}`);
console.log(`  skinned: ${[...skinned.keys()].map(m => m.name).join('; ')}`);

const glb = await new Promise((res, rej) => new GLTFExporter().parse(scene, res, rej, { binary: true, animations: [] }));
await writeFile(output, Buffer.from(glb));
console.log(`wrote ${output}: ${(glb.byteLength / 1024).toFixed(0)} kB`);
