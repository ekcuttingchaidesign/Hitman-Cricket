/**
 * The moments, in a real browser — a fifty, a hundred, six sixes in a row, and
 * the Test innings' marks after them: 150 with the raised bat, and the double,
 * the triple and four hundred with celebrations of their own. The batter's
 * celebration, the ground going grey round him for the big ones and not for
 * the mild ones, the doodles drawn over it, and the game carrying on after.
 *
 * The Test marks after the hundred each have a look of their own: a sticker
 * slapped on beside him for 150, and for the big three a layer that goes up
 * *behind* him — the neon burst, the wings, the poster that covers the whole
 * picture — with him drawn back over it and outlined (GameScene's `cutout`).
 * For those it holds that the layer goes up under him, that he is cut back
 * out over it with his outline really painted round him, and that both come
 * down again by themselves.
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

/**
 * What each moment should do to the screen. `marked` is the marker pen's
 * moments, judged by their strokes; `look` is the selector the Test marks'
 * own pieces are found by; `under` that a layer goes up behind him and he is
 * cut back out over it with `ring`, a colour of his outline; `cover` that the
 * layer covers the whole picture, the outfield with it.
 */
const MOMENTS = [
  { kind: 'century', grey: true, fire: true, cheer: 2.8, words: ['CENTURY'], marked: true },
  { kind: 'six-sixes', grey: true, fire: true, cheer: 2.8, marked: true },
  { kind: 'fifty', grey: false, fire: false, cheer: 2.3, words: ['FIFTY'], marked: true },
  { kind: 'raise', grey: false, fire: false, cheer: 2.3, look: '.cy-slap', also: '.cy-peek' },
  { kind: 'double', grey: true, fire: false, cheer: 3.1, look: '.cy-slap', under: true, ring: [255, 63, 164] },
  { kind: 'triple', grey: true, fire: false, cheer: 3.3, look: '.cy-slap', also: '.cy-spread', under: true, ring: [63, 169, 245] },
  { kind: 'four', grey: true, fire: false, cheer: 3.5, look: '.cy-slap', also: '.cy-ribbon', under: true, ring: [255, 210, 63], cover: true },
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
    // The crowd's cheer: each one is a clip eight seconds long, started once,
    // and let fall away on an exponential whose time constant is set by the
    // moment (`milestoneCheer` in src/game/crowd.ts). So the clips started are
    // counted, and the falls to silence slower than a second are noted: no
    // fade, groan or murmur in a celebration falls that slowly.
    window.__cheers = [];
    window.__falls = [];
    const start = AudioBufferSourceNode.prototype.start;
    AudioBufferSourceNode.prototype.start = function (...args) {
      if (this.buffer && this.buffer.duration > 7.5 && this.buffer.duration < 8.5) window.__cheers.push(Math.round(this.buffer.duration));
      return start.apply(this, args);
    };
    const toward = AudioParam.prototype.setTargetAtTime;
    AudioParam.prototype.setTargetAtTime = function (target, when, constant) {
      if (target === 0 && constant >= 1) window.__falls.push(Math.round(constant * 100) / 100);
      return toward.call(this, target, when, constant);
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
  const up = await page.evaluate(({ ring, look, also }) => {
    const doodle = document.querySelector('.milestone:not(.milestone-under)');
    const animations = [...document.querySelectorAll('.milestone')].flatMap(m => m.getAnimations({ subtree: true }));
    for (const animation of animations) { animation.pause(); animation.currentTime = 650; }
    // The outline, read off the cut-out's own pixels: how many are its colour.
    const cut = document.querySelector('.stage-cut');
    let ringed = 0;
    if (ring && cut && getComputedStyle(cut).display !== 'none' && cut.width) {
      const { data } = cut.getContext('2d').getImageData(0, 0, cut.width, cut.height);
      for (let i = 0; i < data.length; i += 4) if (data[i + 3] > 200 && Math.abs(data[i] - ring[0]) < 40 && Math.abs(data[i + 1] - ring[1]) < 40 && Math.abs(data[i + 2] - ring[2]) < 40) ringed++;
    }
    return {
      doodle: document.querySelectorAll('.milestone:not(.milestone-under)').length, marks: doodle?.querySelectorAll('.cy-mark').length ?? 0,
      under: document.querySelectorAll('.stage-underlay .milestone-under').length, cut: !!cut && getComputedStyle(cut).display !== 'none', ringed,
      look: look ? document.querySelectorAll(`.milestone ${look}`).length : 0, also: also ? document.querySelectorAll(`.milestone ${also}`).length : 0,
      // The poster's sheet: the first thing in the layer under him.
      sheet: (() => {
        const rect = document.querySelector('.stage-underlay .milestone-under svg rect');
        if (!rect) return null;
        const box = rect.getBoundingClientRect();
        return { width: box.width, height: box.height, fill: rect.getAttribute('fill'), opacity: getComputedStyle(rect.closest('.cy-wipe') ?? rect).opacity };
      })(),
      fire: document.querySelectorAll('.milestone .cy-fire').length, aside: !!document.querySelector('#viewport.milestone-on'),
      drawn: [...document.querySelectorAll('.milestone .cy-paint')].filter(p => parseFloat(getComputedStyle(p).strokeDashoffset) < .5).length,
      words: [...document.querySelectorAll('.milestone text.cy-type, .milestone text.cy-yuvi, .milestone text.cy-ask, .milestone text.cy-word')].map(t => t.textContent),
      // Where YUVI and the question under it are, to hold the one below the other.
      yuvi: document.querySelector('.milestone text.cy-yuvi')?.getBoundingClientRect().toJSON(),
      ask: document.querySelector('.milestone text.cy-ask')?.getBoundingClientRect().toJSON(),
    };
  }, { ring: moment.ring ?? null, look: moment.look ?? null, also: moment.also ?? null });
  check(up.doodle === 1, 'the doodles go up');
  if (moment.marked) {
    check(up.marks >= 8, 'with the marks round him', up.marks);
    check(up.drawn >= 6, 'drawn on by now, not still waiting', up.drawn);
  } else {
    check(up.look >= 1, `with its own look (${moment.look})`, up.look);
    if (moment.also) check(up.also >= 1, `and ${moment.also}`, up.also);
  }
  check(moment.under ? up.under === 1 : up.under === 0, moment.under ? 'a layer goes up behind him' : 'and nothing goes up behind him', up.under);
  check(moment.under ? up.cut : !up.cut, moment.under ? 'and he is drawn back out over it' : 'and he is not cut out', up.cut);
  if (moment.ring) check(up.ringed > 300, `with his outline painted round him (${up.ringed} pixels of it)`, up.ringed);
  check(moment.fire ? up.fire >= 8 : up.fire === 0, moment.fire ? 'and fire up the edges' : 'and no fire up the edges', up.fire);
  check(up.aside, 'and the call for the ball steps aside');
  if (moment.words) {
    check(moment.words.every(w => up.words.includes(w)) && (moment.words.length > 0 || up.words.length === 0),
      moment.words.length ? `saying ${moment.words.join(', ')}` : 'with the number alone and no word under it', JSON.stringify(up.words));
  }
  const { cheers, falls } = await page.evaluate(() => ({ cheers: window.__cheers, falls: window.__falls }));
  // A celebration of `cheer` seconds falls away on a curve of 1 + cheer / 2.
  const fall = Math.round((1 + moment.cheer / 2) * 100) / 100;
  check(cheers.length === 1 && falls.includes(fall), `and the crowd cheers once, falling away on a ${fall}s curve`, JSON.stringify({ cheers, falls }));
  if (moment.kind === 'six-sixes') {
    check(['SIX 6s', 'YUVI', 'is that you?'].every(w => up.words.includes(w)) && up.words.filter(w => w === 'YUVI').length === 1,
      'saying SIX 6s, YUVI once, and is that you?', JSON.stringify(up.words));
    check(up.ask.top > up.yuvi.top + up.yuvi.height * .5, 'with the question under YUVI', JSON.stringify({ yuvi: up.yuvi, ask: up.ask }));
    const inside = r => r.left >= 0 && r.right <= options.viewport.width && r.top >= 0 && r.bottom <= options.viewport.height;
    check(inside(up.yuvi) && inside(up.ask), 'and both of them on the screen', JSON.stringify({ yuvi: up.yuvi, ask: up.ask }));
  }
  const during = await page.screenshot({ path: `test-results/${moment.kind}-${name}.png` });
  if (moment.cover) {
    // Taken from the page at 650ms rather than off the screenshot: in
    // software the screenshot lands seconds later, after the poster is down.
    const { width: w, height: h } = options.viewport, sheet = up.sheet;
    check(!!sheet && sheet.width >= w - 1 && sheet.height >= h - 1 && sheet.fill === '#1b1f4a' && sheet.opacity === '1',
      'the poster covers the whole picture, under him', JSON.stringify(sheet));
  } else {
    const grey = await saturation(page, during, grass);
    check(moment.grey ? grey < before * .45 : grey > before * .8,
      `${moment.grey ? 'the grass goes grey' : 'the grass keeps its colour'} (saturation ${before.toFixed(2)} to ${grey.toFixed(2)})`);
  }
  await page.evaluate(() => { for (const animation of [...document.querySelectorAll('.milestone')].flatMap(m => m.getAnimations({ subtree: true }))) animation.play(); });
  const draws = await page.evaluate(async () => {
    const frames = 20, start = window.__draws;
    await new Promise(done => { let n = 0; const tick = () => (++n >= frames ? done() : requestAnimationFrame(tick)); requestAnimationFrame(tick); });
    return Math.round((window.__draws - start) / frames);
  });
  check(draws <= BUDGET, `in ${draws} draw calls a frame, within ${BUDGET}`);

  // Four hundred's is up for more than three seconds; it is waited out, not timed.
  await page.waitForFunction(() => !document.querySelector('.milestone') && getComputedStyle(document.querySelector('.stage-cut')).display === 'none', null, { timeout: 7000 }).catch(() => {});
  check(await page.locator('.milestone').count() === 0, 'the doodles come down by themselves');
  check(await page.evaluate(() => getComputedStyle(document.querySelector('.stage-cut')).display === 'none'), 'and so does the cut-out of him');
  // The grey runs on the game's clock, which on a loaded machine lags the
  // one the doodles come down on, so it is waited out by asking the game.
  await page.waitForFunction(() => { const s = window.__cricket.snapshot(); return !s.celebrating && s.muted === 0; }, null, { timeout: 30000 }).catch(() => {});
  const after = await saturation(page, await page.screenshot(), grass);
  check(after > before * .8, `and the colour comes back (saturation ${after.toFixed(2)})`);
  let next = await phase();
  for (let i = 0; i < 80 && !['BOWLER_RUNUP', 'BALL_IN_FLIGHT'].includes(next); i++) { await page.waitForTimeout(250); next = await phase(); }
  check(['BOWLER_RUNUP', 'BALL_IN_FLIGHT'].includes(next), 'and the next ball comes on its own', next);
  check(errors.length === 0, 'with nothing in the console', errors.join('\n        '));
  await page.close();
}

await browser.close();
console.log(failures ? `\n${failures} failed` : '\nall passed');
if (failures) process.exitCode = 1;
