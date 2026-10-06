/**
 * The ground itself, in a real browser: that it draws, that its shaders
 * compile, and what it costs.
 *
 *   VITE_SHOW_SURVIVE=1 npx vite --port 5201 &
 *   CHROMIUM_PATH=/opt/pw-browsers/chromium node scripts/scene-check.mjs
 *   node scripts/scene-check.mjs http://…:4173    # a preview build
 *
 * The sky, the painted outfield and the painted pitch are canvases and a
 * shader, so neither the unit tests nor the type checker ever runs a line of
 * them. A shader that fails to compile is a console error and a black dome,
 * not an exception, which is why the console is watched as well as the page.
 *
 * Both grounds are walked, and the stadium by night as well as by day: the stadium every innings is played in,
 * and the bowl before it, which `?ground=bowl` still builds.
 *
 * The number that matters is draw calls a frame. The ground used to cost over a
 * thousand, most of them scenery built one box at a time; painting the wear
 * and the mowing into textures brought it down, and this is here so the next
 * change that bolts on a hundred little meshes is caught before it ships. The
 * frames are counted at the crease, with the whole ground in view, which is
 * where a player spends the innings — reached through the cover and the mode
 * picker as they reach it.
 *
 * Screenshots land in test-results/, for a person to look at: a check can tell
 * the sky drew, but not that it looks like a sky.
 */

import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

const base = (process.argv[2] ?? 'http://127.0.0.1:5201').replace(/\/$/, '');
const executablePath = process.env.CHROMIUM_PATH || undefined;
/**
 * Draw calls a frame, shadow pass included, on the ground every innings is
 * played on. The ground came in at about 850 with its painted textures and
 * about 825 once the perimeter boards were one ring; the stadium, its stands
 * merged into one mesh a colour and left out of the shadow pass, came in at
 * 647 by day and 678 by night, when the floodlights behind the batter's end
 * cast the fielders' shadows the sun had not. The figures' fixed parts
 * merged into one mesh a material, and the batter's limbs drawn as one
 * shirt and one pair of trousers rather than tubes and joint balls, brought
 * that to 494 by day and 518 by night. Lower this whenever a change brings it
 * down, so the saving stays banked.
 */
const BUDGET = 530;
/**
 * The bowl, the ground before it, is kept and can still be asked for with
 * `?ground=bowl`, so it is still drawn here and held to the budget it shipped
 * under: built a box at a time, it costs about 800, and about 650 with the
 * figures' parts merged.
 */
const GROUNDS = [
  ['stadium', 'day', '&lights=day', BUDGET],
  // The Blast's night: the same stadium, the moon and two clouds of glow added.
  ['stadium', 'night', '&lights=night', BUDGET],
  ['bowl', 'day', '&ground=bowl&lights=day', 660],
];

let failures = 0;
const check = (ok, what, detail) => {
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${what}${ok || detail === undefined ? '' : `\n        ${detail}`}`);
  if (!ok) failures++;
};

await mkdir('test-results', { recursive: true });
const browser = await chromium.launch({ executablePath });

for (const [ground, time, query, budget] of GROUNDS) for (const [name, options] of [
  ['desktop', { viewport: { width: 1280, height: 720 } }],
  ['phone', { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }],
]) {
  console.log(`${ground} · ${time} · ${name}`);
  const page = await browser.newPage(options);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  // A resource that fails to load is the network's business, and the analytics
  // script cannot reach its server from every machine this runs on.
  page.on('console', message => { if (message.type() === 'error' && !message.text().startsWith('Failed to load resource')) errors.push(message.text()); });
  await page.addInitScript(() => {
    // A returning player, so the private-window notice does not stand in the way.
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
  // Nothing here needs the board, and a dev server has none to give.
  await page.route('**/api/board**', route => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({ rows: [], cutoff: null, size: 50 }),
  }));

  await page.goto(`${base}/?debug=1&seed=222${query}`, { waitUntil: 'load' });
  await page.waitForTimeout(1500);
  const anyway = page.getByRole('button', { name: /PLAY ANYWAY/i });
  if (await anyway.count()) { await anyway.first().click(); await page.waitForTimeout(800); }
  await page.locator('#start').click({ force: true });
  // Wait on the screens rather than a sleep, and give each click fifteen
  // seconds, as milestone-check does: with the ground drawn in software a
  // forced click can take five to land, and one cut off at three never does,
  // so the stories stayed up and Select Mode never came.
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

  let phase = '';
  for (let i = 0; i < 40 && !/BALL|RUNUP|READY/.test(phase); i++) {
    await page.waitForTimeout(250);
    phase = await page.evaluate(() => window.__cricket?.snapshot().phase ?? '');
  }
  check(/BALL|RUNUP|READY/.test(phase), 'an innings is under way', phase);

  const draws = await page.evaluate(async () => {
    const frames = 30, start = window.__draws;
    await new Promise(done => { let n = 0; const tick = () => (++n >= frames ? done() : requestAnimationFrame(tick)); requestAnimationFrame(tick); });
    return Math.round((window.__draws - start) / frames);
  });
  const built = await page.evaluate(() => window.__cricket?.ground());
  check(built === ground, `on the ${ground} ground`, built);
  // The Blast's strip is the dry one: the greener Test strip is never laid
  // here, and never painted unless a Test is played.
  check(await page.evaluate(() => window.__cricket?.greenTop()) === false, 'on the Blast\'s dry strip');
  const lit = await page.evaluate(() => window.__cricket?.lights());
  check(lit === time, `by ${time}`, lit);
  check(draws > 0, 'the ground is being drawn', draws);
  check(draws <= budget, `in ${draws} draw calls a frame, within ${budget}`);
  check(errors.length === 0, 'with nothing in the console', errors.join('\n        '));
  await page.screenshot({ path: `test-results/scene-${ground}-${time}-${name}.png` });
  await page.close();
}

await browser.close();
console.log(failures ? `\n${failures} failed` : '\nall passed');
if (failures) process.exitCode = 1;
