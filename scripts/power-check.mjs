/**
 * The flash for a special stroke, in a real browser: the ground greys round
 * the batter and the ball, focus lines run out from him and off the screen,
 * the turf bursts either side of his boots, and all of it is gone again
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
      doodle: !!doodle,
      rays: document.querySelectorAll('.is-power .pw-ray').length,
      // A length of line part way along its path: out from him, not yet off the screen.
      travelling: [...document.querySelectorAll('.is-power .pw-ray')].filter(ray => {
        const offset = parseFloat(getComputedStyle(ray).strokeDashoffset);
        return offset < 0 && offset > -.95;
      }).length,
      bursts: document.querySelectorAll('.is-power .pw-burst').length,
      thrown: document.querySelectorAll('.is-power .pw-thrown').length,
      arcs: document.querySelectorAll('.is-power .pw-arc').length,
      aside: !!document.querySelector('#viewport.milestone-on'),
      muted: window.__cricket.snapshot().muted,
    };
  });
  check(up.doodle, 'the flash goes up');
  check(up.rays >= 8 && up.rays <= 14 && up.travelling >= 4, 'a dozen focus lines, not a storm, travelling out from him', JSON.stringify(up));
  check(up.bursts === 2 && up.arcs >= 4 && up.thrown >= 16, 'a burst either side of his boots, with dirt and sparks thrown', JSON.stringify(up));
  check(!up.aside, 'and the call for the ball left where it is');
  check(up.muted > .5, 'the ground going grey', up.muted);
  const during = await page.screenshot({ path: `test-results/power-${name}.png` });
  const grey = await saturation(page, during, grass);
  check(grey < before * .5, `the grass greys (saturation ${before.toFixed(2)} to ${grey.toFixed(2)})`);
  let muted = 1;
  for (let i = 0; i < 120 && muted > 0; i++) { await page.waitForTimeout(250); muted = (await snap()).muted; }
  check(muted === 0, 'and the grey goes by itself');
  // Again at the page's own pace, to see it go without being asked.
  await page.evaluate(() => { window.__timerScale = 1; window.__cricket.power(); });
  await page.waitForTimeout(2500);
  check(await page.locator('.is-power').count() === 0, 'and so do the lines and the bursts');
  muted = 1;
  for (let i = 0; i < 120 && muted > 0; i++) { await page.waitForTimeout(250); muted = (await snap()).muted; }
  const after = await saturation(page, await page.screenshot(), grass);
  check(after > before * .8, `with the colour back (saturation ${after.toFixed(2)})`);
  check(errors.length === 0, 'with nothing in the console', errors.join('\n        '));
  await page.close();
}

// ── A real one ───────────────────────────────────────────────────────────
// The fire behind the ball only burns behind a ball struck with a special
// stroke, so this plays some: the meter filled through the debug hook before
// each ball, the stroke the cue names played on time on a clock wound by hand,
// as end-card-check winds it, until one lands.
{
  console.log('a real special stroke');
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    const day = new Date(Date.now() - 172_800_000).toISOString().slice(0, 10);
    try {
      localStorage.setItem('hitman-seen', day);
      localStorage.setItem('hitman-whatsnew', 'rivals-launch:9');
      localStorage.setItem('hitman-unveiled', 'ground-2026');
    } catch { /* Then the notices stand. */ }
  });
  await page.route('**/api/board**', route => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({ rows: [], cutoff: null, size: 50 }),
  }));
  const snap = () => page.evaluate(() => window.__cricket.snapshot());
  const advance = ms => page.clock.runFor(Math.max(16, Math.round(ms)));
  await page.clock.install();
  await page.goto(`${base}/?debug=1&seed=222`, { waitUntil: 'load' });
  await advance(2500);
  await page.waitForTimeout(800);
  await page.locator('#start').click({ force: true, timeout: 15_000 });
  await advance(600);
  await page.locator('#mode-classic').click({ force: true, timeout: 15_000 });
  await advance(600);
  await page.addStyleTag({ content: '[class*=debug]{display:none!important}' });
  const KEYS = { CHARGE: ['w'], SWEEP: ['a'], SCOOP: ['s', 'a'], REVERSE: ['s', 'd'] };
  let landed = null;
  for (let ball = 0; ball < 10 && !landed; ball++) {
    // Full before the ball is chosen, which is when the cue is settled.
    for (let i = 0; i < 60 && !['READY', 'RESULT'].includes((await snap()).phase); i++) await advance(200);
    await page.evaluate(() => window.__cricket.fillConfidence());
    let seen = await snap();
    for (let i = 0; i < 80 && seen.phase !== 'BALL_IN_FLIGHT'; i++) { await advance(100); seen = await snap(); }
    if (seen.phase !== 'BALL_IN_FLIGHT') break;
    if (!seen.primed) { await advance(3000); continue; }
    await advance(seen.contactAt - seen.elapsed - 60);
    const keys = KEYS[seen.primed];
    for (const key of keys) await page.keyboard.down(key);
    for (const key of keys) await page.keyboard.up(key);
    // Wound on in small steps to the moment the ball is in the air, burning.
    for (let i = 0; i < 40; i++) {
      await advance(60);
      const now = await snap();
      if (now.burning > 0) { landed = { ...now, primed: seen.primed }; break; }
      if (now.phase === 'RESULT' || now.phase === 'READY') break;
    }
  }
  check(!!landed, 'a special stroke lands, and the ball burns behind it', JSON.stringify(landed));
  if (landed) {
    check(landed.special, `a ${landed.primed.toLowerCase()} that found the bat`, JSON.stringify(landed));
    await advance(40);
    await page.screenshot({ path: 'test-results/power-trail.png' });
    check((await snap()).burning >= 10, 'a tail of it, not a spark');
  }
  // And an ordinary ball after it: no fire.
  let next = await snap();
  for (let i = 0; i < 80 && next.phase !== 'BALL_IN_FLIGHT'; i++) { await advance(100); next = await snap(); }
  check(next.burning === 0, 'the next ball goes back to the ordinary trail', JSON.stringify(next));
  check(errors.length === 0, 'with nothing in the console', errors.join('\n        '));
  await page.close();
}

await browser.close();
console.log(failures ? `\n${failures} failed` : '\nall passed');
if (failures) process.exitCode = 1;
