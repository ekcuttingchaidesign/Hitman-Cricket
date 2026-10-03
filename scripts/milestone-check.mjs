/**
 * The moments, in a real browser — a fifty, a hundred, six sixes in a row, and
 * the Test innings' marks after them: 150 with the raised bat, and the double,
 * the triple and four hundred with celebrations of their own. The batter's
 * celebration, the ground going grey round him for the big ones and not for
 * the mild ones, the doodles drawn over it — confetti from the double,
 * fireworks from the triple — and the game carrying on after.
 *
 *   VITE_SHOW_SURVIVE=1 npx vite --port 5201 &
 *   CHROMIUM_PATH=/opt/pw-browsers/chromium node scripts/milestone-check.mjs
 *   node scripts/milestone-check.mjs http://…:4173    # a preview build
 *
 * Getting to a real hundred headless is thirty balls of perfect timing, so the
 * moment is asked for through the debug hook, which runs the same method the
 * ball that gets there does. Which ball that is is `milestoneOf`'s business,
 * and `tests/milestone.test.ts` holds it. Each moment gets an innings of its
 * own: the ball left alone to set it up is as often as not a wicket, and three
 * of those in one innings would end it before the last moment came.
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

/** What each moment should do to the screen. */
const MOMENTS = [
  { kind: 'century', grey: true, fire: true, cheer: 2.8, words: ['CENTURY'] },
  { kind: 'six-sixes', grey: true, fire: true, cheer: 2.8 },
  { kind: 'fifty', grey: false, fire: false, cheer: 2.3, words: ['FIFTY'] },
  { kind: 'raise', grey: false, fire: false, cheer: 2.3, words: [] },
  { kind: 'double', grey: true, fire: true, cheer: 3.1, words: ['DOUBLE'], confetti: true },
  { kind: 'triple', grey: true, fire: true, cheer: 3.3, words: ['TRIPLE'], confetti: true, fireworks: true },
  { kind: 'four', grey: true, fire: true, cheer: 3.5, words: ['FOUR HUNDRED'], confetti: true, fireworks: true },
];

for (const [name, options] of [
  ['desktop', { viewport: { width: 1280, height: 720 } }],
  ['phone', { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }],
]) for (const moment of MOMENTS) {
  console.log(`${name}: ${moment.kind}`);
  const page = await browser.newPage(options);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error' && !message.text().startsWith('Failed to load resource')) errors.push(message.text()); });
  // Not a returning visitor, unlike the other checks: in a headless browser a
  // returning visitor's page never starts a CSS animation — on the cover as
  // much as here, and before this feature as much as after it — so the doodles
  // would never draw on and the pictures would show a bare field. The
  // private-window notice that a first visit gets is answered below instead.
  await page.addInitScript(() => {
    // The covers have come off already: unveil-check is the one that pulls them.
    try { localStorage.setItem('hitman-unveiled', 'ground-stadium'); } catch { /* Then they stand in the way. */ }
    // How long each crowd clip was scheduled for, from start to stop: the cheer
    // is the one clip three and a half seconds long.
    window.__cheers = [];
    const start = AudioBufferSourceNode.prototype.start, stop = AudioBufferSourceNode.prototype.stop;
    AudioBufferSourceNode.prototype.start = function (when = 0, ...rest) { this.__at = when; return start.call(this, when, ...rest); };
    AudioBufferSourceNode.prototype.stop = function (when = 0) {
      if (this.buffer && this.buffer.duration > 3.3 && this.buffer.duration < 3.7) window.__cheers.push(Math.round((when - this.__at) * 10) / 10);
      return stop.call(this, when);
    };
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
  // Clicks are given fifteen seconds: with the ground drawn in software a
  // forced click can take five to be delivered, and one cut off at three
  // never lands, so every retry was cut off the same way.
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
  await page.evaluate(kind => window.__cricket.milestone(kind), moment.kind);
  await page.waitForTimeout(650);
  // Asked in one go: on a slow machine three round trips can outlast it. The
  // drawing is judged at 650ms on its own clock, set by hand, rather than on
  // the page's: a headless browser rendering the ground in software can hold
  // CSS animations at their first frame for as long as it likes, and a check
  // that waited on that would be timing the machine, not the doodles.
  const up = await page.evaluate(() => {
    const doodle = document.querySelector('.milestone');
    const animations = doodle?.getAnimations({ subtree: true }) ?? [];
    for (const animation of animations) { animation.pause(); animation.currentTime = 650; }
    return {
      doodle: document.querySelectorAll('.milestone').length, marks: document.querySelectorAll('.milestone .cy-mark').length,
      fire: document.querySelectorAll('.milestone .cy-fire').length, aside: !!document.querySelector('#viewport.milestone-on'),
      confetti: document.querySelectorAll('.milestone .cy-confetti').length, fireworks: document.querySelectorAll('.milestone .cy-spark').length,
      drawn: [...document.querySelectorAll('.milestone .cy-paint')].filter(p => parseFloat(getComputedStyle(p).strokeDashoffset) < .5).length,
      words: [...document.querySelectorAll('.milestone text.cy-type, .milestone text.cy-yuvi, .milestone text.cy-ask, .milestone text.cy-word')].map(t => t.textContent),
      // Where YUVI and the question under it are, to hold the one below the other.
      yuvi: document.querySelector('.milestone text.cy-yuvi')?.getBoundingClientRect().toJSON(),
      ask: document.querySelector('.milestone text.cy-ask')?.getBoundingClientRect().toJSON(),
    };
  });
  check(up.doodle === 1, 'the doodles go up');
  check(up.marks >= 8, 'with the marks round him', up.marks);
  check(up.drawn >= 6, 'drawn on by now, not still waiting', up.drawn);
  check(moment.fire ? up.fire >= 8 : up.fire === 0, moment.fire ? 'and fire up the edges' : 'and no fire: it is the mild one', up.fire);
  check(up.aside, 'and the call for the ball steps aside');
  if (moment.words) {
    check(moment.words.every(w => up.words.includes(w)) && (moment.words.length > 0 || up.words.length === 0),
      moment.words.length ? `saying ${moment.words.join(', ')}` : 'with the number alone and no word under it', JSON.stringify(up.words));
  }
  check(moment.confetti ? up.confetti >= 20 : up.confetti === 0, moment.confetti ? 'confetti across the top' : 'and no confetti', up.confetti);
  check(moment.fireworks ? up.fireworks >= 3 : up.fireworks === 0, moment.fireworks ? 'and fireworks over the stands' : 'and no fireworks', up.fireworks);
  const cheers = await page.evaluate(() => window.__cheers);
  check(cheers.length === 1 && cheers[0] === moment.cheer, `and the crowd cheers, dying away over ${moment.cheer}s`, JSON.stringify(cheers));
  if (moment.kind === 'six-sixes') {
    check(['SIX 6s', 'YUVI', 'is that you?'].every(w => up.words.includes(w)) && up.words.filter(w => w === 'YUVI').length === 1,
      'saying SIX 6s, YUVI once, and is that you?', JSON.stringify(up.words));
    check(up.ask.top > up.yuvi.top + up.yuvi.height * .5, 'with the question under YUVI', JSON.stringify({ yuvi: up.yuvi, ask: up.ask }));
    const inside = r => r.left >= 0 && r.right <= options.viewport.width && r.top >= 0 && r.bottom <= options.viewport.height;
    check(inside(up.yuvi) && inside(up.ask), 'and both of them on the screen', JSON.stringify({ yuvi: up.yuvi, ask: up.ask }));
  }
  const during = await page.screenshot({ path: `test-results/${moment.kind}-${name}.png` });
  const grey = await saturation(page, during, grass);
  check(moment.grey ? grey < before * .45 : grey > before * .8,
    `${moment.grey ? 'the grass goes grey' : 'the grass keeps its colour'} (saturation ${before.toFixed(2)} to ${grey.toFixed(2)})`);
  await page.evaluate(() => { for (const animation of document.querySelector('.milestone')?.getAnimations({ subtree: true }) ?? []) animation.play(); });
  const draws = await page.evaluate(async () => {
    const frames = 20, start = window.__draws;
    await new Promise(done => { let n = 0; const tick = () => (++n >= frames ? done() : requestAnimationFrame(tick)); requestAnimationFrame(tick); });
    return Math.round((window.__draws - start) / frames);
  });
  check(draws <= BUDGET, `in ${draws} draw calls a frame, within ${BUDGET}`);

  // Four hundred's is up for more than three seconds; it is waited out, not timed.
  await page.waitForFunction(() => !document.querySelector('.milestone'), null, { timeout: 7000 }).catch(() => {});
  check(await page.locator('.milestone').count() === 0, 'the doodles come down by themselves');
  // The grey runs on the game's clock, which on a loaded machine lags the
  // one the doodles come down on, so it is waited out by asking the game.
  await page.waitForFunction(() => { const s = window.__cricket.snapshot(); return !s.celebrating && s.muted === 0; }, null, { timeout: 8000 }).catch(() => {});
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
