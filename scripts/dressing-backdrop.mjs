/**
 * The Dressing Room's backdrop: `src/assets/dressing/room.svg` baked into the
 * picture the stage stands in front of, `room.webp`.
 *
 *   CHROMIUM_PATH=/opt/pw-browsers/chromium node scripts/dressing-backdrop.mjs
 *
 * The drawing is a corridor of lockers in one dark brown. Baked here, it is
 * lifted to read on a phone, softened so the batter in front of it stays the
 * one thing in focus, and darkened by depth: the further down the corridor,
 * the darker, until the far wall and the door are gone into the dark the
 * stage was painted on. Doing that once, here, rather than on the player's
 * phone keeps it the same on every browser — a canvas's filters are not to be
 * relied on everywhere — and costs the room one picture.
 *
 * Change the drawing or these figures and run it again.
 */

import { chromium } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';

const executablePath = process.env.CHROMIUM_PATH || undefined;
const svg = new URL('../src/assets/dressing/room.svg', import.meta.url);
const out = new URL('../src/assets/dressing/room.webp', import.meta.url);

/** Twice the 390 by 844 it is drawn on: a phone's pixels. */
const SCALE = 2;
/** Lifted and softened, as chosen against the room. */
const LOOK = 'brightness(1.6) saturate(1.15) blur(1.6px)';
/**
 * The fade by depth. In a corridor drawn in perspective, how far down it a
 * point is goes with how many times the far wall's size it lies from the
 * vanishing point, across or up: the far wall is 160 by 131 about (195, 352).
 * Dark to `from` of those, clear by `to`.
 */
const FADE = { at: [195, 352], wall: [80, 65.5], from: 0.9, to: 2.6, colour: [12, 10, 10] };

const browser = await chromium.launch({ executablePath });
const page = await browser.newPage();
const data = 'data:image/svg+xml;base64,' + (await readFile(svg)).toString('base64');
const webp = await page.evaluate(async ([data, SCALE, LOOK, FADE]) => {
  const img = new Image(); img.src = data; await img.decode();
  const c = document.createElement('canvas'); c.width = 390 * SCALE; c.height = 844 * SCALE;
  const g = c.getContext('2d');
  g.filter = LOOK; g.drawImage(img, 0, 0, c.width, c.height); g.filter = 'none';
  // The fade is worked out small and laid over smoothed, which is all a gradient this soft needs.
  const mw = 96, mh = Math.round(mw * c.height / c.width), m = document.createElement('canvas'); m.width = mw; m.height = mh;
  const mg = m.getContext('2d'), pixels = mg.createImageData(mw, mh);
  for (let y = 0; y < mh; y++) for (let x = 0; x < mw; x++) {
    const sx = (x + .5) / mw * 390, sy = (y + .5) / mh * 844;
    const depth = Math.max(Math.abs(sx - FADE.at[0]) / FADE.wall[0], Math.abs(sy - FADE.at[1]) / FADE.wall[1]);
    const t = Math.min(1, Math.max(0, (depth - FADE.from) / (FADE.to - FADE.from))), dark = 1 - t * t * (3 - 2 * t);
    const i = (y * mw + x) * 4;
    pixels.data.set([...FADE.colour, Math.round(dark * 255)], i);
  }
  mg.putImageData(pixels, 0, 0);
  g.imageSmoothingQuality = 'high'; g.drawImage(m, 0, 0, c.width, c.height);
  return c.toDataURL('image/webp', 0.9);
}, [data, SCALE, LOOK, FADE]);
await writeFile(out, Buffer.from(webp.split(',')[1], 'base64'));
await browser.close();
console.log(`wrote ${out.pathname}`);
