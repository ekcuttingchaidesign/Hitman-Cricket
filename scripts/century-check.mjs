/**
 * The hundred, in a real browser: the batter's celebration, the ground going
 * grey round him, the doodles drawn over it, and the game carrying on after.
 *
 *   VITE_SHOW_SURVIVE=1 npx vite --port 5201 &
 *   CHROMIUM_PATH=/opt/pw-browsers/chromium node scripts/century-check.mjs
 *   node scripts/century-check.mjs http://…:4173    # a preview build
 *
 * Getting to a real hundred headless is thirty balls of perfect timing, so the
 * moment is asked for through the debug hook, which runs the same method the
 * hundredth run does. Whether a ball is the one that gets there is
 * `reachedCentury`'s business, and `tests/milestone.test.ts` holds it.
 *
 * What only a browser can say: that the grey is really there, measured off the
 * pixels of the grass rather than taken on trust from a uniform; that the
 * doodles go up and come down again by themselves; that the draw calls do not
 * move, because the grey is inside shaders that were already running; and that
 * the next ball is bowled once it is over, without anybody touching anything.
 *
 * Screenshots in test-results/, for a person: a check can say the grass went
 * grey, not that the moment looks like one.
 */

import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

const base = (process.argv[2] ?? 'http://127.0.0.1:5201').replace(/\/$/, '');
const executablePath = process.env.CHROMIUM_PATH || undefined;
/** The same budget `scene-check.mjs` holds the ground to. */
const BUDGET = 870;

let failures = 0;
const check = (ok, what, detail) => {
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${what}${ok || detail === undefined ? '' : `\n        ${detail}`}`);
  if (!ok) failures++;
};

await mkdir('test-results', { recursive: true });
const browser = await chromium.launch({ executablePath });

/** How colourful a patch of a screenshot is: mean HSV saturation, 0 to 1. */
async function saturation(page, png, box) {
  return page.evaluate(async ({ data, box }) => {
    const image = new Image(); image.src = data; await image.decode();
    const canvas = document.createElement('canvas'); canvas.width = box.w; canvas.height = box.h;
    const ctx = canvas.getContext('2d'); ctx.drawImage(image, box.x, box.y, box.w, box.h, 0, 0, box.w, box.h);
    const { data: px } = ctx.getImageData(0, 0, box.w, box.h);
    let total = 0;
    for (let i = 0; i < px.length; i += 4) {
      const max = Math.max(px[i], px[i + 1], px[i + 2]), min = Math.min(px[i], px[i + 1], px[i + 2]);
      total += max ? (max - min) / max : 0;
    }
    return total / (px.length / 4);
  }, { data: `data:image/png;base64,${png.toString('base64')}`, box });
}

for (const [name, options] of [
  ['desktop', { viewport: { width: 1280, height: 720 } }],
  ['phone', { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }],
]) {
  console.log(name);
  const page = await browser.newPage(options);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error' && !message.text().startsWith('Failed to load resource')) errors.push(message.text()); });
  await page.addInitScript(() => {
    const day = new Date(Date.now() - 172_800_000).toISOString().slice(0, 10);
    try { localStorage.setItem('hitman-seen', day); } catch { /* Then the notice stands. */ }
    window.__draws = 0;
    for (const proto of [WebGL2RenderingContext.prototype, WebGLRenderingContext.prototype]) {
      for (const fn of ['drawElements', 'drawArrays', 'drawElementsInstanced', 'drawArraysInstanced']) {
        const original = proto[fn];
        if (original) proto[fn] = function (...args) { window.__draws++; return original.apply(this, args); };
      }
    }
  });
  await page.route('**/api/board**', route => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({ rows: [], cutoff: null, size: 50 }),
  }));

  // In through the cover and the picker, the way a player gets to the crease.
  await page.goto(`${base}/?debug=1&seed=222`, { waitUntil: 'load' });
  await page.waitForTimeout(1500);
  const anyway = page.getByRole('button', { name: /PLAY ANYWAY/i });
  if (await anyway.count()) { await anyway.first().click(); await page.waitForTimeout(800); }
  await page.locator('#start').click({ force: true });
  for (let i = 0; i < 30; i++) {
    const mode = page.locator('#mode-classic'), done = page.locator('#whatsnew-done');
    if (await mode.isVisible().catch(() => false)) {
      await page.waitForTimeout(500);
      await mode.click({ force: true, timeout: 3000 }).catch(() => {});
      await page.waitForTimeout(800);
      if (!(await mode.isVisible().catch(() => false))) break;
      continue;
    }
    if (await done.isVisible().catch(() => false)) await done.click({ force: true, timeout: 3000 }).catch(() => {});
    await page.waitForTimeout(500);
  }
  // Hide the debug readout so it is not in the pictures or the samples.
  await page.addStyleTag({ content: '[class*=debug]{display:none!important}' });
  const phase = () => page.evaluate(() => window.__cricket.snapshot().phase);
  let seen = '';
  for (let i = 0; i < 60 && seen !== 'READY'; i++) { await page.waitForTimeout(250); seen = await phase(); }
  check(seen === 'READY', 'an innings is under way', seen);

  // A strip of outfield either side of the pitch, below the boards.
  const { width, height } = options.viewport;
  const grass = { x: Math.round(width * .04), y: Math.round(height * .62), w: Math.round(width * .18), h: Math.round(height * .1) };
  const before = await saturation(page, await page.screenshot(), grass);

  // Then a ball, left alone, and the moment it is dead — which is when the
  // hundredth run sets it off, and the only phase it is ever set off in.
  for (let i = 0; i < 80 && seen !== 'RESULT'; i++) { await page.waitForTimeout(100); seen = await phase(); }
  check(seen === 'RESULT', 'a ball is bowled and is dead', seen);
  await page.evaluate(() => window.__cricket.century());
  await page.waitForTimeout(650);
  check(await page.locator('.century').count() === 1, 'the doodles go up');
  check(await page.locator('.century .cy-mark').count() >= 15, 'with the marks drawn round him', await page.locator('.century .cy-mark').count());
  check(await page.locator('#viewport.century-on').count() === 1, 'and the call for the ball steps aside');
  const during = await page.screenshot({ path: `test-results/century-${name}.png` });
  const grey = await saturation(page, during, grass);
  check(grey < before * .45, `the grass goes grey (saturation ${before.toFixed(2)} to ${grey.toFixed(2)})`);
  const draws = await page.evaluate(async () => {
    const frames = 20, start = window.__draws;
    await new Promise(done => { let n = 0; const tick = () => (++n >= frames ? done() : requestAnimationFrame(tick)); requestAnimationFrame(tick); });
    return Math.round((window.__draws - start) / frames);
  });
  check(draws <= BUDGET, `in ${draws} draw calls a frame, within ${BUDGET}`);

  await page.waitForTimeout(1600);
  check(await page.locator('.century').count() === 0, 'the doodles come down by themselves');
  const after = await saturation(page, await page.screenshot(), grass);
  check(after > before * .8, `and the colour comes back (saturation ${after.toFixed(2)})`);
  let next = await phase();
  for (let i = 0; i < 20 && !['BOWLER_RUNUP', 'BALL_IN_FLIGHT'].includes(next); i++) { await page.waitForTimeout(250); next = await phase(); }
  check(['BOWLER_RUNUP', 'BALL_IN_FLIGHT'].includes(next), 'and the next ball comes on its own', next);
  check(errors.length === 0, 'with nothing in the console', errors.join('\n        '));
  await page.close();
}

await browser.close();
console.log(failures ? `\n${failures} failed` : '\nall passed');
if (failures) process.exitCode = 1;
