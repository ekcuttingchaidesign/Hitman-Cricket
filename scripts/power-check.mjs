/**
 * The flash for a special stroke, in a real browser: the ground greys round
 * the batter and the ball, fire streaks out of him, and both are gone again
 * without the call for the ball being moved aside.
 *
 *   VITE_SHOW_SURVIVE=1 npx vite --port 5201 &
 *   CHROMIUM_PATH=/opt/pw-browsers/chromium node scripts/power-check.mjs
 *   node scripts/power-check.mjs http://…:4173    # a preview build
 *
 * A full meter and a ball that suits the stroke, timed, is more than a
 * headless browser can be relied on for, so the flash is asked for through the
 * debug hook, which runs what the hit does. Which outcomes earn it is
 * `landedSpecial`'s business, held by `tests/special-flash.test.ts`.
 *
 * The grey runs on the game's clock, which moves at most 60ms a frame; the
 * doodle runs on the page's. So the grey is judged from the pixels while the
 * game says it is on, and waited out by asking the game, not a stopwatch. The
 * doodle comes down after a second of the page's time, which software
 * rendering can spend on one screenshot, so the page's timers are slowed while
 * it is photographed — `__timerScale`, as in nearing-check — and it is put up
 * again at the page's own pace to see it go.
 */

import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

const base = (process.argv[2] ?? 'http://127.0.0.1:5201').replace(/\/$/, '');
const executablePath = process.env.CHROMIUM_PATH || undefined;

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
  ['phone', { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }],
  ['desktop', { viewport: { width: 1280, height: 720 } }],
]) {
  console.log(name);
  const page = await browser.newPage(options);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error' && !message.text().startsWith('Failed to load resource')) errors.push(message.text()); });
  // A first visit, as milestone-check is and for its reason: a returning
  // visitor's page in a headless browser never starts a CSS animation.
  await page.addInitScript(() => {
    try { localStorage.setItem('hitman-unveiled', 'ground-2026'); } catch { /* Then they stand in the way. */ }
    const later = window.setTimeout;
    window.__timerScale = 1;
    window.setTimeout = (fn, ms, ...rest) => later(fn, (ms ?? 0) * window.__timerScale, ...rest);
  });
  await page.route('**/api/board**', route => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({ rows: [], cutoff: null, size: 50 }),
  }));
  await page.goto(`${base}/?debug=1&seed=222`, { waitUntil: 'load' });
  await page.waitForTimeout(1500);
  const anyway = page.getByRole('button', { name: /PLAY ANYWAY/i });
  if (await anyway.count()) { await anyway.first().click(); await page.waitForTimeout(800); }
  await page.locator('#start').click({ force: true });
  for (let i = 0; i < 30; i++) {
    const mode = page.locator('#mode-classic'), done = page.locator('#whatsnew-done');
    if (await mode.isVisible().catch(() => false)) {
      await page.waitForTimeout(500);
      await mode.click({ force: true, timeout: 15_000 }).catch(() => {});
      await page.waitForTimeout(800);
      if (!(await mode.isVisible().catch(() => false))) break;
      continue;
    }
    if (await done.isVisible().catch(() => false)) await done.click({ force: true, timeout: 15_000 }).catch(() => {});
    await page.waitForTimeout(500);
  }
  await page.addStyleTag({ content: '[class*=debug]{display:none!important}' });
  const snap = () => page.evaluate(() => window.__cricket.snapshot());
  let seen = '';
  for (let i = 0; i < 60 && seen !== 'READY'; i++) { await page.waitForTimeout(250); seen = (await snap()).phase; }
  check(seen === 'READY', 'an innings is under way', seen);

  const { width, height } = options.viewport;
  const grass = { x: Math.round(width * .04), y: Math.round(height * .62), w: Math.round(width * .18), h: Math.round(height * .1) };
  const before = await saturation(page, await page.screenshot(), grass);
  check((await snap()).muted === 0, 'the ground in colour to begin with');

  await page.evaluate(() => { window.__timerScale = 40; window.__cricket.power(); });
  await page.waitForTimeout(300);
  const up = await page.evaluate(() => {
    const doodle = document.querySelector('.milestone.is-power');
    // Judged at 400ms on its own clock, set by hand: see milestone-check.
    for (const animation of doodle?.getAnimations({ subtree: true }) ?? []) { animation.pause(); animation.currentTime = 400; }
    return {
      doodle: !!doodle, marks: document.querySelectorAll('.is-power .cy-mark').length,
      fire: document.querySelectorAll('.is-power .cy-fire').length, embers: document.querySelectorAll('.is-power .cy-ember').length,
      drawn: [...document.querySelectorAll('.is-power .cy-paint')].filter(p => parseFloat(getComputedStyle(p).strokeDashoffset) < .5).length,
      aside: !!document.querySelector('#viewport.milestone-on'),
      muted: window.__cricket.snapshot().muted,
    };
  });
  check(up.doodle, 'the flash goes up');
  check(up.marks >= 8 && up.drawn >= 7, 'fire lines streaking out of him, drawn on', JSON.stringify(up));
  check(up.fire >= 4 && up.embers >= 8, 'with flames and embers', JSON.stringify(up));
  check(!up.aside, 'and the call for the ball left where it is');
  check(up.muted > .5, 'the ground going grey', up.muted);
  const during = await page.screenshot({ path: `test-results/power-${name}.png` });
  const grey = await saturation(page, during, grass);
  check(grey < before * .5, `the grass greys (saturation ${before.toFixed(2)} to ${grey.toFixed(2)})`);
  let muted = 1;
  for (let i = 0; i < 120 && muted > 0; i++) { await page.waitForTimeout(250); muted = (await snap()).muted; }
  check(muted === 0, 'and the grey goes by itself');
  // Again at the page's own pace, to see the fire go without being asked.
  await page.evaluate(() => { window.__timerScale = 1; window.__cricket.power(); });
  await page.waitForTimeout(2500);
  check(await page.locator('.is-power').count() === 0, 'and so does the fire');
  muted = 1;
  for (let i = 0; i < 120 && muted > 0; i++) { await page.waitForTimeout(250); muted = (await snap()).muted; }
  const after = await saturation(page, await page.screenshot(), grass);
  check(after > before * .8, `with the colour back (saturation ${after.toFixed(2)})`);
  check(errors.length === 0, 'with nothing in the console', errors.join('\n        '));
  await page.close();
}

await browser.close();
console.log(failures ? `\n${failures} failed` : '\nall passed');
if (failures) process.exitCode = 1;
