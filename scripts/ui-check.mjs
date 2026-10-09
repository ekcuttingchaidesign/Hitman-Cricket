/**
 * `?ui=1`: UI v1's parts, every one in every state, laid out on one page — the
 * handover's Foundations page in the game's own CSS.
 *
 *   VITE_SHOW_SURVIVE=1 npx vite --port 5201 &
 *   CHROMIUM_PATH=/opt/pw-browsers/chromium node scripts/ui-check.mjs http://127.0.0.1:5201
 *
 * What a unit test cannot see: that the two faces load (Jaro on the keys,
 * Satoshi everywhere else — a missing face falls back to a system font and
 * every measurement is off), that each part comes out at the size its Figma
 * master is drawn at, that every target is a thumb wide, that the medallions'
 * art arrives, and that the page fits a phone with nothing hanging off the
 * side. Then it photographs the page, at a phone's width and in the desktop's
 * column, into test-results/ui/, for holding against the Figma.
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

await mkdir('test-results/ui', { recursive: true });
const browser = await chromium.launch({ executablePath });

// The design's own phone: 402 wide, so one design pixel is one CSS pixel and
// the sizes below are the Figma's numbers exactly.
const page = await browser.newPage({ viewport: { width: 402, height: 874 }, isMobile: true, hasTouch: true });
const errors = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(`${base}/?ui=1`, { waitUntil: 'load' });
await page.waitForSelector('.kg');
await page.evaluate(() => document.fonts.ready);

check(!(await page.locator('canvas').count()), 'is a page, not the game: nothing built behind it');
const fonts = await page.evaluate(() => ({
  jaro: document.fonts.check('22px Jaro'),
  satoshi: document.fonts.check('700 14px Satoshi'),
  key: getComputedStyle(document.querySelector('.k-cta--primary .k-cta-face')).fontFamily,
  label: getComputedStyle(document.querySelector('.k-pill')).fontFamily,
}));
check(fonts.jaro && /^Jaro/.test(fonts.key), 'sets the keys in Jaro', JSON.stringify(fonts));
check(fonts.satoshi && /^Satoshi/.test(fonts.label), 'sets everything else in Satoshi', JSON.stringify(fonts));

const size = selector => page.locator(selector).first().evaluate(el => {
  const r = el.getBoundingClientRect();
  return [Math.round(r.width * 10) / 10, Math.round(r.height * 10) / 10];
});
// [selector, width or null, height], off the masters in Figma.
const MASTERS = [
  ['#kg-play-again', 210, 56, 'PLAY AGAIN'],
  ['.k-cta--mode', 96, 56, 'MODE'],
  ['.k-cta--share', 56, 56, 'Share'],
  ['.k-cta--challenge', 56, 56, 'Challenge'],
  ['.k-cta--play-small', 76, 43, 'Play small'],
  ['.k-cta--secondary', 362, 56, 'HOW TO PLAY'],
  ['.k-cta--share-wide', 362, 56, 'BRAG ABOUT MY STATS'],
  ['.k-icon-button', 44, 44, 'icon button'],
  ['.k-pill', 170, 44, 'dropdown pill'],
  ['.k-tab', 110, 36, 'tab'],
  ['.k-chip', null, 34, 'chip'],
  ['.k-actions', 362, 52, 'player card actions'],
  ['.k-ticket', 362, 69, 'career key ticket'],
  ['.k-pit', 362, 52, 'pit header'],
  ['#kg-badges .k-badge', 96, 96, 'tier badge'],
  ['.k-road', 362, 177, 'Road to Hitman'],
];
for (const [selector, w, h, name] of MASTERS) {
  const [width, height] = await size(selector);
  // A pixel either way for sub-pixel rounding and the faces' own metrics.
  const near = (a, b) => Math.abs(a - b) <= 1.5;
  check((w === null || near(width, w)) && near(height, h), `draws the ${name} at ${w ?? '…'}×${h}`, `${width}×${height}`);
}

// Every target a thumb wide: 44 square, or grown to it past the drawing.
const small = await page.evaluate(() => [...document.querySelectorAll('.kg button')].flatMap(el => {
  const r = el.getBoundingClientRect();
  const after = getComputedStyle(el, '::after');
  const grow = after.content !== 'none' && after.position === 'absolute'
    ? { x: -parseFloat(after.left) - parseFloat(after.right), y: -parseFloat(after.top) - parseFloat(after.bottom) } : { x: 0, y: 0 };
  const w = r.width + Math.max(0, grow.x), h = r.height + Math.max(0, grow.y);
  return w + .5 < 44 || h + .5 < 44 ? [`${el.className} ${Math.round(w)}×${Math.round(h)}`] : [];
}));
check(small.length === 0, 'gives every key a 44 target', small.join(', '));

const art = await page.evaluate(() => Promise.all([...document.querySelectorAll('#kg-badges .k-badge img')].map(img =>
  img.decode().then(() => img.naturalWidth > 0, () => false))));
check(art.length === 7 && art.every(Boolean), 'draws all seven medallions', JSON.stringify(art));

const road = await page.evaluate(() => {
  const roads = [...document.querySelectorAll('.k-road')];
  const fill = roads[1].querySelector('.k-road-fill').getBoundingClientRect();
  const line = roads[1].querySelector('.k-road-line').getBoundingClientRect();
  const you = roads[1].querySelector('.k-road-you span').textContent;
  return { share: fill.width / line.width, you, goals: roads.map(r => r.querySelector('.k-road-goal').textContent) };
});
check(Math.abs(road.share - 154 / 298) < 0.01 && road.you === '2,140', 'fills the road to where 2,140 runs stands', JSON.stringify(road));
check(road.goals[0] === 'Score 350 runs to reach Emerging' && road.goals[2] === 'Hitman. Top of the game.', 'says the next goal over the road', JSON.stringify(road.goals));

const open = page.locator('.k-pill').first();
await open.click();
await page.waitForTimeout(400); // The buttons' own fade.
check(await open.getAttribute('aria-expanded') === 'true', 'opens a pill on a tap');
const pill = await open.evaluate(el => getComputedStyle(el).backgroundColor);
check(pill === 'rgb(245, 239, 230)', 'turns an open pill cream', pill);

const wide = await page.evaluate(() => document.querySelector('.kg').scrollWidth - document.querySelector('.kg').clientWidth);
check(wide <= 0, 'fits a phone with nothing off the side', `${wide}px over`);

await page.screenshot({ path: 'test-results/ui/phone.png', fullPage: false });
const full = await page.evaluate(() => document.querySelector('.kg').scrollHeight);
await page.setViewportSize({ width: 402, height: full });
await page.screenshot({ path: 'test-results/ui/phone-full.png' });

// The desktop's 9:16 column: the same page, measured in the column.
const desk = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await desk.goto(`${base}/?ui=1`, { waitUntil: 'load' });
await desk.waitForSelector('.kg');
await desk.evaluate(() => document.fonts.ready);
const column = await desk.evaluate(() => {
  const app = document.querySelector('#app').getBoundingClientRect();
  const key = document.querySelector('.k-cta--secondary').getBoundingClientRect();
  return { app: app.width, key: key.width, inside: key.left >= app.left && key.right <= app.right };
});
check(column.inside && column.key < column.app, 'lays out inside the desktop column', JSON.stringify(column));
await desk.screenshot({ path: 'test-results/ui/desktop.png' });

check(errors.length === 0, 'raises no errors', errors.join(' | '));
await browser.close();
console.log(failures ? `\n${failures} failed` : '\nall ok — pictures in test-results/ui/');
process.exit(failures ? 1 : 0);
