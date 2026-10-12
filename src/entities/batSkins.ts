import * as THREE from 'three';
import { SKIN } from './batGeometry';
import type { BatId } from '../game/dressing';

/**
 * The sticker sheets, one a bat, drawn on the Figma template (Skin templates →
 * Bat) at 1 px = 0.5 mm and laid out as `SKIN` describes. Plain has none.
 */
const SHEETS: Partial<Record<BatId, string>> = {
  boom: new URL('../assets/bats/boom.webp', import.meta.url).href,
  rage: new URL('../assets/bats/rage.webp', import.meta.url).href,
  venom: new URL('../assets/bats/venom.webp', import.meta.url).href,
  lonewolf: new URL('../assets/bats/lonewolf.webp', import.meta.url).href,
  meg: new URL('../assets/bats/meg.webp', import.meta.url).href,
  roar: new URL('../assets/bats/roar.webp', import.meta.url).href,
  reign: new URL('../assets/bats/reign.webp', import.meta.url).href,
  icecold: new URL('../assets/bats/icecold.webp', import.meta.url).href,
  savage: new URL('../assets/bats/savage.webp', import.meta.url).href,
  inferno: new URL('../assets/bats/inferno.webp', import.meta.url).href,
  hitman: new URL('../assets/bats/hitman.webp', import.meta.url).href,
};

/** The colour of the bare willow under and between the stickers. */
const WILLOW = '#e0b77a';
const held = new Map<BatId, Promise<THREE.Texture | null>>();

/**
 * A bat's sheet as a texture on the blade's second set of coordinates
 * (`uv1`), the stickers laid over willow so the blade needs no colour of its
 * own. Loaded once and shared; null for Plain, or if the picture will not load,
 * when the bat goes out bare rather than not at all.
 */
export function batSheet(id: BatId): Promise<THREE.Texture | null> {
  const url = SHEETS[id];
  if (!url) return Promise.resolve(null);
  let sheet = held.get(id);
  if (!sheet) {
    sheet = new Promise(resolve => {
      const image = new Image();
      image.onload = () => {
        const canvas = document.createElement('canvas'); canvas.width = SKIN.width; canvas.height = SKIN.height;
        const g = canvas.getContext('2d');
        if (!g) { resolve(null); return; }
        g.fillStyle = WILLOW; g.fillRect(0, 0, canvas.width, canvas.height); g.drawImage(image, 0, 0, canvas.width, canvas.height);
        const texture = new THREE.CanvasTexture(canvas);
        texture.channel = 1; texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = 8;
        resolve(texture);
      };
      image.onerror = () => resolve(null);
      image.src = url;
    });
    held.set(id, sheet);
  }
  return sheet;
}
