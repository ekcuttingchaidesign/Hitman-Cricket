import * as THREE from 'three';
import { seeded } from './turf';

/** Repeating relief only. The production grass colour canvas is untouched.
 * One 256px normal tile, with mipmaps softening blades towards the boundary.
 */
export function grassDetail(diameter: number, anisotropy: number) {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 256;
  const ctx = canvas.getContext('2d')!, random = seeded(4105);
  ctx.fillStyle = '#808080'; ctx.fillRect(0, 0, 256, 256);
  ctx.lineCap = 'round';
  for (let i = 0; i < 1800; i++) {
    const x = random() * 256, y = random() * 256;
    const dx = (random() - .5) * 3, dy = 2 + random() * 5;
    const value = Math.round(102 + random() * 52);
    ctx.strokeStyle = `rgb(${value},${value},${value})`;
    ctx.lineWidth = .6 + random() * .7;
    // Wrap the blades that cross the tile edge, avoiding a visible grid seam.
    for (const ox of [-256, 0, 256]) for (const oy of [-256, 0, 256]) {
      ctx.beginPath(); ctx.moveTo(x + ox, y + oy);
      ctx.lineTo(x + dx + ox, y + dy + oy); ctx.stroke();
    }
  }
  // Bake the height derivatives once. A normal map takes one texture sample
  // per fragment, rather than recalculating bump derivatives every frame.
  const height = ctx.getImageData(0, 0, 256, 256).data;
  const normals = ctx.createImageData(256, 256);
  const at = (x: number, y: number) => height[(((y + 256) % 256) * 256 + (x + 256) % 256) * 4] / 255;
  for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) {
    const nx = (at(x - 1, y) - at(x + 1, y)) * 2;
    const ny = (at(x, y - 1) - at(x, y + 1)) * 2;
    const length = Math.hypot(nx, ny, 1), i = (y * 256 + x) * 4;
    normals.data[i] = Math.round((nx / length * .5 + .5) * 255);
    normals.data[i + 1] = Math.round((ny / length * .5 + .5) * 255);
    normals.data[i + 2] = Math.round((1 / length * .5 + .5) * 255);
    normals.data[i + 3] = 255;
  }
  ctx.putImageData(normals, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.setScalar(diameter / 4);
  texture.anisotropy = anisotropy;
  // Normal data stays linear, unlike the original sRGB colour map.
  texture.colorSpace = THREE.NoColorSpace;
  return texture;
}
