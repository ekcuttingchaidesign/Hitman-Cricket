/**
 * The camera row, Pro Cam and the broadcast camera, in a browser (`src/game/camera.ts`).
 *
 *  - Under `?cam=broadcast` a real swipe goes the way it went on the picture:
 *    down the screen is the straight drive, out to the left the cut (the
 *    batter's off side, seen from the bowler's end), and the side labels say
 *    so.
 *  - The pause sheet's Camera row, Classic, Close, Pro Cam and Dynamic, turns it at
 *    once and keeps it across a reload; under Pro Cam, his own eyes, only the
 *    gloves and bat are drawn; under Close he is whole; under both the swipes
 *    are Classic's.
 *  - Super10's field map is turned half round under it, the batter's point
 *    at its middle.
 *
 *    VITE_SHOW_SURVIVE=1 npx vite --port 5201 &
 *    CHROMIUM_PATH=/opt/pw-browsers/chromium node scripts/camera-check.mjs http://localhost:5201
 */
import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

const base = process.argv[2] || 'http://localhost:5201';
const executablePath = process.env.CHROMIUM_PATH || undefined;
const shots = 'test-results/camera';
await mkdir(shots, { recursive: true });
let failed = 0;
const check = (ok, what, detail = '') => { console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${what}${ok || !detail ? '' : ` — ${detail}`}`); if (!ok) failed++; };
const browser = await chromium.launch({ executablePath, args: ['--autoplay-policy=no-user-gesture-required'] });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
await context.addInitScript(() => {
  try {
    localStorage.setItem('hitman-shots-intro', 'done'); localStorage.setItem('hitman-whatsnew', 'rivals:9,diwali:9');
    localStorage.setItem('hitman-field-intro', '1'); localStorage.setItem('hitman-keeper-intro', '1');
  } catch { /* Then they show. */ }
});
await context.route('**/api/board**', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ rows: [], cutoff: null, size: 50 }) }));
const page = await context.newPage();
const errors = [];
page.on('pageerror', error => errors.push(error.message));
const snap = () => page.evaluate(() => window.__cricket.snapshot());
const text = id => page.evaluate(id => document.getElementById(id)?.textContent ?? '', id);

/** Out to an innings of `mode` from a link. */
async function walkOut(query, mode = 'classic') {
  await page.goto(`${base}/?debug=1&seed=222&${query}`, { waitUntil: 'load' });
  await page.waitForTimeout(1200);
  const anyway = page.getByRole('button', { name: /PLAY ANYWAY/i });
  if (await anyway.count()) { await anyway.first().click(); await page.waitForTimeout(600); }
  await page.locator('#start').click({ force: true });
  for (let i = 0; i < 60; i++) {
    const card = page.locator(`#mode-${mode}`);
    if (await card.isVisible().catch(() => false)) { await page.waitForTimeout(400); await card.click({ force: true }).catch(() => {}); await page.waitForTimeout(800); continue; }
    const phase = await page.evaluate(() => window.__cricket?.snapshot().phase);
    if (phase === 'READY' || phase === 'BOWLER_RUNUP' || phase === 'BALL_IN_FLIGHT') { await page.addStyleTag({ content: '[class*=debug]{display:none!important}' }); return; }
    await page.waitForTimeout(400);
  }
}

/** A thumb across the middle of the picture, `dx` and `dy` pixels, as touch events the browser turns into pointer events. */
async function swipe(dx, dy) {
  const cdp = await context.newCDPSession(page);
  const at = (x, y) => [{ x, y, id: 1, radiusX: 4, radiusY: 4, force: 1 }];
  const x = 195, y = 470;
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: at(x, y) });
  for (const step of [1, 2, 3, 4]) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: at(x + dx * step / 4, y + dy * step / 4) });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
}

/** The next ball swiped at, and the stroke the game played. */
async function strokeFor(dx, dy) {
  for (let i = 0; i < 600; i++) { const s = await snap(); if (s.phase === 'BALL_IN_FLIGHT') break; await page.waitForTimeout(25); }
  await swipe(dx, dy);
  await page.waitForTimeout(300);
  return (await snap()).shot;
}

console.log('broadcast, from the link');
await walkOut('cam=broadcast&lights=day&ground=stadium');
check((await snap()).camera === 'broadcast', 'the broadcast camera is up');
check(await text('side-left') === 'OFF SIDE' && await text('side-right') === 'LEG SIDE', "the labels have a right-hander's off side on the left", `${await text('side-left')} / ${await text('side-right')}`);
check(await strokeFor(0, 80) === 'STRAIGHT', 'a swipe down the screen is the straight drive');
await page.screenshot({ path: `${shots}/broadcast.png` });
check(await strokeFor(-80, 0) === 'SQUARE_CUT', 'a swipe out to the left is the cut');

console.log('the Camera row');
await page.locator('#pause').click({ force: true });
await page.waitForTimeout(400);
const row = await page.evaluate(() => [...document.querySelectorAll('#camera-row .camera-pick')].map(b => `${b.textContent}:${b.getAttribute('aria-checked')}`));
check(row.join(',') === 'Classic:false,Close:false,Pro Cam:false,Dynamic:false', 'the row offers Classic, Close, Pro Cam and Dynamic, and Broadcast only from the link', row.join(','));
check(await page.evaluate(() => document.getElementById('pause-sheet').getBoundingClientRect().bottom <= innerHeight), 'all of the sheet on a phone screen');
check(await page.evaluate(() => [...document.querySelectorAll('#camera-row .camera-pick img')].every(img => img.complete && img.naturalWidth > 0)), "each camera's picture on its key");
await page.locator('#camera-pro').click();
check((await snap()).camera === 'pro', 'Pro Cam turns it at once');
check(await text('side-left') === 'LEG SIDE', "and the labels are the classic way round: it is behind him too", await text('side-left'));
await page.screenshot({ path: `${shots}/pause.png` });
await page.goto(`${base}/?debug=1&seed=222`, { waitUntil: 'load' });
await page.waitForTimeout(800);
check((await snap()).camera === 'pro', 'kept across a reload');
await walkOut('lights=day&ground=stadium');
check((await snap()).firstPerson === true, "he is drawn from his own eyes: only the gloves and bat");
check(await strokeFor(0, -80) === 'STRAIGHT', 'and under it a swipe up the screen is the straight drive, as under Classic');
await page.screenshot({ path: `${shots}/pro.png` });
check(await strokeFor(80, 0) === 'SQUARE_CUT', 'a swipe to the right the cut');
await page.locator('#pause').click({ force: true });
await page.waitForTimeout(400);
await page.locator('#camera-close').click();
await page.locator('#resume').click();
await page.waitForTimeout(300);
check((await snap()).camera === 'close' && (await snap()).firstPerson === false, 'Close: low behind him, and he is drawn whole');
await page.screenshot({ path: `${shots}/close.png` });
check(await strokeFor(0, -80) === 'STRAIGHT', 'and under it a swipe up the screen is the straight drive');
await page.locator('#pause').click({ force: true });
await page.waitForTimeout(400);
// The fourth key, scrolled into the row: Classic's picture, turned after the ball (`ball-look-check` follows it).
await page.locator('#camera-dynamic').click();
check(await page.evaluate(() => document.getElementById('camera-dynamic').getAttribute('aria-checked')) === 'true', 'Dynamic is on the row, scrolled to and picked');
await page.locator('#resume').click();
await page.waitForTimeout(300);
check((await snap()).camera === 'dynamic' && (await snap()).firstPerson === false, 'Dynamic: he is drawn whole');
check(await text('side-left') === 'LEG SIDE' && await strokeFor(0, -80) === 'STRAIGHT', 'and the labels and the swipes are the classic way round');
await page.locator('#pause').click({ force: true });
await page.waitForTimeout(400);
await page.locator('#camera-classic').click();
await page.goto(`${base}/?debug=1&seed=222`, { waitUntil: 'load' });
await page.waitForTimeout(800);
check((await snap()).camera === 'classic', 'Classic kept across a reload too');
check((await snap()).firstPerson === false, 'and under Classic he is drawn whole');

console.log('Super10');
await walkOut('mode=super10&cam=broadcast', 'super10');
const map = await page.evaluate(() => document.querySelector('#s10-map svg')?.outerHTML ?? '');
check(map.includes('rotate(180 50 50)'), 'the field map is turned half round');
check(/class="s10-bat" cx="50" cy="50"/.test(map), "with the batter's point at its middle");
await page.screenshot({ path: `${shots}/super10.png` });

check(errors.length === 0, 'nothing in the console', errors.join('\n      '));
await browser.close();
console.log(failed ? `${failed} failed` : 'all passed');
process.exit(failed ? 1 : 0);
