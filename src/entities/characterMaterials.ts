import * as THREE from 'three';

// Shared, colour-neutral surface detail. No canvas, image requests or per-frame work.
function detailTexture(wood = false) {
  const size = 64, pixels = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const i = (y * size + x) * 4;
    const nx = wood ? Math.sin(x * Math.PI / 4 + .3 * Math.sin(y * Math.PI / 32)) * .28
      : Math.sin(x * Math.PI / 4) * (.35 + .15 * Math.cos(y * Math.PI / 4));
    const ny = wood ? .02 * Math.cos(y * Math.PI / 32) : Math.sin(y * Math.PI / 4) * .35;
    const nz = Math.sqrt(1 - nx * nx - ny * ny);
    pixels[i] = Math.round((nx + 1) * 127.5); pixels[i + 1] = Math.round((ny + 1) * 127.5);
    pixels[i + 2] = Math.round((nz + 1) * 127.5); pixels[i + 3] = 255;
  }
  const texture = new THREE.DataTexture(pixels, size, size);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.LinearFilter; texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true; texture.repeat.set(wood ? 1 : 12, wood ? 1 : 12);
  texture.needsUpdate = true;
  return texture;
}
const weave = detailTexture(), grain = detailTexture(true);
export function clothMaterial<T extends THREE.MeshStandardMaterial>(material: T): T {
  material.normalMap = weave; material.normalScale.set(.075, .075); return material;
}
export function willowMaterial<T extends THREE.MeshStandardMaterial>(material: T): T {
  material.normalMap = grain; material.normalScale.set(.2, .2); return material;
}
