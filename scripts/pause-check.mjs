/**
 * The pause sheet, in a real browser, reached the way a player reaches it: an
 * innings walked out to and paused. In the Blast and in a Test Marathon, on a
 * phone, it checks the chip names the game in its colour, the line under the
 * title gives the score, the keys each game has and the ones it does not (the
 * lights in the Blast only, the declare key in the Marathon only), and the two
 * sound switches: that each flips the setting the audio holds, that the other
 * is left alone, that the choice is kept across a reload, and that turning the
 * ambience off takes the murmur away once the innings goes on.
 *
 *   VITE_SHOW_SURVIVE=1 npx vite --port 5201 &
 *   CHROMIUM_PATH=/opt/pw-browsers/chromium node scripts/pause-check.mjs
 *
 * Photographs go to test-results/pause/.
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

await mkdir('test-results/pause', { recursive: true });
const browser = await chromium.launch({ executablePath, args: ['--autoplay-policy=no-user-gesture-required'] });

/** Walks out to an innings of `mode` and pauses it. */
async function pauseIn(page, mode) {
  await page.goto(`${base}/?debug=1&seed=222&lights=night${mode === 'marathon' ? '&mode=marathon' : ''}`, { waitUntil: 'load' });
  await page.waitForTimeout(1500);
  const anyway = page.getByRole('button', { name: /PLAY ANYWAY/i });
  if (await anyway.count()) { await anyway.first().click(); await page.waitForTimeout(800); }
  await page.locator('#start').click({ force: true });
  for (let i = 0; i < 40; i++) {
    const card = page.locator(`#mode-${mode}`), done = page.locator('#whatsnew-done');
    if (await card.isVisible().catch(() => false)) {
      await page.waitForTimeout(500);
      await card.click({ force: true }).catch(() => {});
      await page.waitForTimeout(800);
      if (!(await card.isVisible().catch(() => false))) break;
      continue;
    }
    if (await done.isVisible().catch(() => false)) await done.click({ force: true }).catch(() => {});
    if ((await page.evaluate(() => window.__cricket?.snapshot().phase)) === 'READY') break;
    await page.waitForTimeout(500);
  }
  await page.addStyleTag({ content: '[class*=debug]{display:none!important}' });
  for (let i = 0; i < 60; i++) {
    const phase = await page.evaluate(() => window.__cricket.snapshot().phase);
    if (phase === 'READY' || phase === 'BOWLER_RUNUP') break;
    await page.waitForTimeout(250);
  }
  await page.locator('#pause').click({ force: true });
  await page.waitForTimeout(500);
}

const sheet = page => page.evaluate(() => {
  const shown = id => { const el = document.getElementById(id); return !!el && el.offsetParent !== null; };
  const sound = window.__cricket.sound();
  return {
    up: shown('pause-overlay') && window.__cricket.snapshot().phase === 'PAUSED',
    chip: document.getElementById('pause-mode').textContent,
    tone: getComputedStyle(document.getElementById('pause-mode')).backgroundColor,
    state: document.getElementById('pause-state').textContent,
    restart: shown('restart'), modes: shown('change-mode'), declare: shown('declare'), lights: shown('lights-row'),
    crowd: document.getElementById('crowd-switch').getAttribute('aria-checked'),
    ambience: document.getElementById('ambience-switch').getAttribute('aria-checked'),
    crowdOn: sound.crowdOn, ambienceOn: sound.ambienceOn, murmur: sound.murmur,
    // Everything on the sheet within the screen, on a phone, without scrolling.
    fits: document.getElementById('pause-sheet').getBoundingClientRect().bottom <= innerHeight,
  };
});

for (const [mode, name, tone] of [['classic', 'The Blast', 'rgb(8, 123, 255)'], ['marathon', 'Test Marathon', 'rgb(18, 180, 95)']]) {
  console.log(name);
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error' && !/Failed to load resource|ERR_TUNNEL/.test(message.text())) errors.push(message.text()); });
  await page.route('**/api/board**', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ rows: [], cutoff: null, size: 50 }) }));
  // Past the Marathon's rules cards, which marathon-check is the one to look at.
  await page.addInitScript(() => { try { localStorage.setItem('hitman-marathon-intro', '9'); } catch {} });
  await pauseIn(page, mode);
  let seen = await sheet(page);
  check(seen.up, 'the sheet is up');
  check(seen.chip === name, `the chip says ${name}`, seen.chip);
  check(seen.tone === tone, 'in its colour', seen.tone);
  check(/^\d+\/\d+ · \d+\.\d overs$/.test(seen.state), 'the score under the title', seen.state);
  check(seen.restart, 'restart');
  // Reached by its link, the Marathon is locked to itself: no way to another game.
  check(seen.modes === (mode === 'classic'), mode === 'classic' ? 'change mode' : 'no change mode, from a link that names the game');
  check(seen.lights === (mode === 'classic'), mode === 'classic' ? 'the lights, in the Blast' : 'no lights: a Test is played by day');
  check(seen.declare === (mode === 'marathon'), mode === 'marathon' ? 'the declare key' : 'no declare key');
  check(seen.fits, 'all of it on a phone screen');
  check(seen.crowd === 'true' && seen.ambience === 'true' && seen.crowdOn && seen.ambienceOn, 'both sounds on to begin with', JSON.stringify(seen));
  await page.screenshot({ path: `test-results/pause/${mode}.png` });

  await page.locator('#crowd-switch').click();
  seen = await sheet(page);
  check(seen.crowd === 'false' && !seen.crowdOn, 'the crowd switch turns the crowd off', `${seen.crowd} ${seen.crowdOn}`);
  check(seen.ambience === 'true' && seen.ambienceOn, 'and leaves the ambience alone');
  await page.locator('#ambience-switch').click();
  seen = await sheet(page);
  check(seen.ambience === 'false' && !seen.ambienceOn, 'the ambience switch turns it off', `${seen.ambience} ${seen.ambienceOn}`);
  await page.screenshot({ path: `test-results/pause/${mode}-off.png` });
  await page.locator('#resume').click();
  await page.waitForTimeout(1500);
  seen = await sheet(page);
  check(!seen.up, 'resume takes the sheet down');
  check(seen.murmur === 0, 'and no murmur comes back with the innings', seen.murmur);

  // Kept for the next visit.
  await pauseIn(page, mode);
  seen = await sheet(page);
  check(seen.crowd === 'false' && seen.ambience === 'false' && !seen.crowdOn && !seen.ambienceOn, 'both still off after a reload', JSON.stringify(seen));
  await page.locator('#crowd-switch').click();
  await page.locator('#ambience-switch').click();
  seen = await sheet(page);
  check(seen.crowdOn && seen.ambienceOn, 'and on again with a tap each');
  check(errors.length === 0, 'with nothing in the console', errors.join('\n        '));
  await page.close();
}

await browser.close();
console.log(failures ? `\n${failures} failed` : '\nall passed');
process.exit(failures ? 1 : 0);
