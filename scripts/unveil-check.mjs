/**
 * The covers coming off, in a real browser: the first innings chosen puts the
 * old ground up, a swipe to the left pulls it off, and the innings starts on
 * the new one. The cover's play key and the picker are menus, and go by
 * untouched: the covers are for somebody about to bat.
 *
 *   VITE_SHOW_SURVIVE=1 npx vite --port 5201 &
 *   CHROMIUM_PATH=/opt/pw-browsers/chromium node scripts/unveil-check.mjs
 *   node scripts/unveil-check.mjs http://…:4173    # a preview build
 *
 * The line is dragged by pointer and eased by animation frames, the pictures
 * are chosen by a media query, and the whole of it stands between a player and
 * the innings — so it is walked the way a player walks it: a swipe that gives
 * up halfway and springs back, one that goes through, the key that comes up
 * after, and a second visit that goes straight past. Then the same by keys.
 *
 * The other checks seed `hitman-unveiled` so they start on the far side of the
 * covers. This is the one that does not.
 *
 * Screenshots land in test-results/, for a person to look at: a check can
 * tell the line moved, not that the two grounds line up under it.
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

async function arrive(page) {
  await page.goto(`${base}/?debug=1`, { waitUntil: 'load' });
  await page.waitForTimeout(1500);
  const anyway = page.getByRole('button', { name: /PLAY ANYWAY/i });
  if (await anyway.count()) { await anyway.first().click(); await page.waitForTimeout(800); }
}
const value = page => page.$eval('#unveil-line', node => Number(node.getAttribute('aria-valuenow'))).catch(() => NaN);
const remembered = page => page.evaluate(() => localStorage.getItem('hitman-unveiled'));
const phase = page => page.evaluate(() => window.__cricket?.snapshot().phase ?? '').catch(() => '');
const pickerUp = page => settled(page, () => {
  const node = document.querySelector('#modes');
  return node && !node.classList.contains('hidden');
});
const batting = page => settled(page, () => /READY|BOWLER_RUNUP|BALL_IN_FLIGHT/.test(window.__cricket?.snapshot().phase ?? ''));
const opened = page => page.$eval('.unveil', node => node.classList.contains('is-open')).catch(() => false);
/** Waits for a condition in the page, in real time: the line eases by animation frames. */
const settled = (page, fn, arg) => page.waitForFunction(fn, arg, { timeout: 8000 }).then(() => true).catch(() => false);

// One mode each, so both keys on the picker are seen to put the covers up.
for (const [name, options, mode] of [
  ['phone', { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }, 'classic'],
  ['desktop', { viewport: { width: 1280, height: 720 } }, 'survive'],
]) {
  console.log(`${name}, ${mode}`);
  const context = await browser.newContext(options);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    // A returning player who has read the stories, so the covers are the only
    // thing between the picker and the innings.
    const day = new Date(Date.now() - 172_800_000).toISOString().slice(0, 10);
    try {
      localStorage.setItem('hitman-seen', day);
      localStorage.setItem('hitman-whatsnew', 'marathon-launch:9');
    } catch { /* Then the notices stand. */ }
  });
  await page.route('**/api/board**', route => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({ rows: [], cutoff: null, size: 50 }),
  }));

  await arrive(page);
  await page.locator('#start').click({ force: true });
  check(await pickerUp(page), 'the play key goes to the picker');
  check(await page.locator('#unveil-overlay').isHidden(), 'with no covers in front of it');
  await page.locator(`#mode-${mode}`).click({ force: true });
  const up = await settled(page, () => {
    const node = document.querySelector('.unveil');
    return node && !node.classList.contains('is-loading');
  });
  check(up, 'choosing a mode puts the old ground up first');
  check(await phase(page) === 'START', 'with the innings not yet started', await phase(page));
  const pictures = await page.$$eval('.unveil img', nodes => nodes.map(node => ({ src: node.currentSrc, w: node.naturalWidth })));
  check(pictures.length === 2 && pictures.every(one => one.w > 0), 'both pictures drawn', JSON.stringify(pictures));
  const wide = name === 'desktop';
  check(pictures.every(one => one.src.includes(wide ? '-wide' : '-phone')),
    `the ${wide ? 'wide' : 'upright'} pair, for this screen`, pictures.map(one => one.src).join(', '));
  check(await page.getByText('Swipe to pull the covers off').isVisible(), 'asking for a swipe');
  check(!(await page.locator('#unveil-play').isVisible()), 'and no way past but the swipe');
  // The nudge leans the line in and back every couple of seconds, so it is
  // read where it comes to rest rather than wherever the lean happens to be.
  const rest = 16;
  const resting = await settled(page, r => Number(document.querySelector('#unveil-line')?.getAttribute('aria-valuenow')) === r, rest);
  check(resting, 'the line resting in from the right edge, the new ground peeking past it', await value(page));
  check(await remembered(page) === null, 'not yet counted as seen');
  await page.screenshot({ path: `test-results/unveil-${name}-rest.png` });

  const box = await page.locator('.unveil').boundingBox();
  const y = box.y + box.height * 0.55;
  const from = box.x + box.width * 0.8;

  // A swipe that gives up a quarter of the way over.
  await page.mouse.move(from, y);
  await page.mouse.down();
  await page.waitForTimeout(100);
  const touched = await value(page);
  await page.mouse.move(from - box.width * 0.2, y, { steps: 12 });
  await page.waitForTimeout(250);
  const held = await value(page);
  check(Math.abs(held - touched - 20) <= 2, 'the line follows the finger, a fifth of the width for a fifth', `${touched} → ${held}`);
  await page.screenshot({ path: `test-results/unveil-${name}-drag.png` });
  await page.mouse.up();
  const back = await settled(page, r => Number(document.querySelector('#unveil-line')?.getAttribute('aria-valuenow')) <= r + 1, rest);
  check(back && !(await opened(page)), 'let go gently short of half, it springs back', await value(page));
  check(await remembered(page) === null, 'still not counted');

  // And one that goes through.
  await page.waitForTimeout(400);
  await page.mouse.move(from, y);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.3, y, { steps: 14 });
  await page.waitForTimeout(150);
  await page.mouse.up();
  const through = await settled(page, () => document.querySelector('.unveil')?.classList.contains('is-open'));
  check(through, 'past half, the covers come off');
  check(await value(page) === 100, 'all the way', await value(page));
  check(await remembered(page) === 'ground-stadium', 'counted as seen once they are off', await remembered(page));
  const play = page.locator('#unveil-play');
  await page.waitForTimeout(600);
  check(await play.isVisible(), 'a play key comes up');
  check(await page.getByText('Covers off. Play on.').isVisible(), 'saying so');
  await page.screenshot({ path: `test-results/unveil-${name}-open.png` });

  await play.click();
  check(await batting(page), 'and the innings starts on the new ground', await phase(page));
  check(await page.locator('#unveil-overlay').isHidden(), 'with the covers gone');

  // The second visit goes straight through.
  await arrive(page);
  await page.locator('#start').click({ force: true });
  await pickerUp(page);
  await page.locator(`#mode-${mode}`).click({ force: true });
  check(await batting(page) && await page.locator('#unveil-overlay').isHidden(), 'next time, the mode goes straight to the innings', await phase(page));
  check(errors.length === 0, 'with nothing in the console', errors.join('\n        '));
  await context.close();
}

// The keys: Enter on the cover and the picker, then the line takes focus, the
// arrows move it, and Enter takes it all the way and then bats.
{
  console.log('keyboard');
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await context.newPage();
  await page.addInitScript(() => {
    const day = new Date(Date.now() - 172_800_000).toISOString().slice(0, 10);
    try { localStorage.setItem('hitman-seen', day); localStorage.setItem('hitman-whatsnew', 'marathon-launch:9'); } catch { /* */ }
  });
  await page.route('**/api/board**', route => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({ rows: [], cutoff: null, size: 50 }),
  }));
  await arrive(page);
  await page.locator('#start').click({ force: true });
  await pickerUp(page);
  await page.locator('#mode-classic').click({ force: true });
  await settled(page, () => document.activeElement?.id === 'unveil-line');
  check(await page.evaluate(() => document.activeElement?.id) === 'unveil-line', 'the line has focus');
  const before = await value(page);
  await page.keyboard.press('ArrowLeft');
  await page.waitForTimeout(400);
  check(await value(page) > before, 'an arrow moves it', `${before} → ${await value(page)}`);
  await page.keyboard.press('Enter');
  check(await settled(page, () => document.activeElement?.id === 'unveil-play'), 'Enter takes it off and hands focus to play');
  await page.keyboard.press('Enter');
  check(await batting(page), 'and Enter again starts the innings', await phase(page));
  await context.close();
}

await browser.close();
console.log(failures ? `\n${failures} failed` : '\nall passed');
if (failures) process.exitCode = 1;
