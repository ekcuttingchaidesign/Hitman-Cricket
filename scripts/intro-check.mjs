/**
 * The walk-on before the first ball (`src/game/IntroReel.ts`), in a real
 * browser: under `?intro=1` a Blast opens on it, the scoreboard and every key
 * put out of sight between two black bars, the bowler held at his mark; it
 * lands by itself on the game's view and the first ball follows; a tap skips
 * it there at once; and without the switch an innings opens as it always did.
 * It photographs the film at its beats, pinned on its own clock
 * (`__cricket.introAt`), into test-results/intro-*.png.
 *
 *   VITE_SHOW_SURVIVE=1 npx vite --port 5201 &
 *   CHROMIUM_PATH=/opt/pw-browsers/chromium node scripts/intro-check.mjs
 *
 * Waited on what the game says (`walkingOn`, `snapshot().phase`), on a clock
 * wound by hand, never on how slow the machine is.
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

/** A Blast chosen from the picker, on a clock wound by hand, the film pinned at its start if `pin`. */
async function blast(query, pin = false) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    const day = new Date(Date.now() - 172_800_000).toISOString().slice(0, 10);
    try {
      localStorage.setItem('hitman-shots-intro', 'done'); localStorage.setItem('hitman-seen', day);
      localStorage.setItem('hitman-whatsnew', 'player-profiles:9');
    } catch { /* Then the notices stand. */ }
  });
  await page.route('**/api/board**', route => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({ rows: [], cutoff: null, size: 50 }),
  }));
  const advance = ms => page.clock.runFor(Math.max(16, Math.round(ms)));
  const snap = () => page.evaluate(() => window.__cricket.snapshot());
  const walking = () => page.evaluate(() => window.__cricket.walkingOn());
  await page.clock.install();
  await page.goto(`${base}/?debug=1&seed=222${query}`, { waitUntil: 'load' });
  await page.clock.pauseAt(await page.evaluate(() => Date.now()) + 3000);
  await advance(2500);
  await page.waitForTimeout(800);
  await page.locator('#start').click({ force: true, timeout: 15_000 });
  await advance(600);
  if (pin) await page.evaluate(() => window.__cricket.introAt(0));
  await page.locator('#mode-classic').click({ force: true, timeout: 15_000 });
  await advance(100);
  return { page, errors, advance, snap, walking };
}
const hidden = page => page.evaluate(() => {
  const viewport = document.getElementById('viewport');
  const score = [...viewport.children].find(el => el.tagName !== 'CANVAS' && el.offsetParent !== null);
  return { on: viewport.classList.contains('intro-on'), visible: score ? getComputedStyle(score).visibility : 'none' };
});

// ── It plays, holds the ball, and lands by itself ────────────────────────
console.log('lands by itself');
{
  const { page, errors, advance, snap, walking } = await blast('&intro=1');
  check(await walking(), 'a Blast chosen under ?intro=1 opens on the walk-on');
  const cover = await hidden(page);
  check(cover.on && cover.visible === 'hidden', 'the scoreboard and keys are out of sight', JSON.stringify(cover));
  await advance(1500);
  check((await snap()).phase === 'READY', 'the bowler waits at his mark while it plays', (await snap()).phase);
  for (let i = 0; i < 40 && await walking(); i++) await advance(250);
  check(!(await walking()), 'it lands by itself');
  check(!(await hidden(page)).on, 'and puts the scoreboard back');
  let phase = '';
  for (let i = 0; i < 40 && phase !== 'BOWLER_RUNUP' && phase !== 'BALL_IN_FLIGHT'; i++) { await advance(100); phase = (await snap()).phase; }
  check(phase === 'BOWLER_RUNUP' || phase === 'BALL_IN_FLIGHT', 'and the first ball follows', phase);
  check(!errors.length, 'no errors', errors.join('\n'));
  await page.close();
}

// ── A tap skips it ───────────────────────────────────────────────────────
console.log('a tap skips it');
{
  const { page, errors, advance, snap, walking } = await blast('&intro=1');
  await advance(400);
  await page.locator('#viewport canvas').first().tap({ force: true });
  await advance(50);
  check(!(await walking()), 'a tap puts it away at once');
  check((await snap()).phase === 'READY', 'and plays no stroke', (await snap()).phase);
  let phase = 'READY';
  for (let i = 0; i < 30 && phase === 'READY'; i++) { await advance(100); phase = (await snap()).phase; }
  check(phase === 'BOWLER_RUNUP' || phase === 'BALL_IN_FLIGHT', 'the bowler goes without waiting out the film', phase);
  check(!errors.length, 'no errors', errors.join('\n'));
  await page.close();
}

// ── Its beats, photographed ──────────────────────────────────────────────
console.log('its beats');
{
  const { page, errors, advance } = await blast('&intro=1&lights=day', true);
  await page.evaluate(() => window.__cricket.dress('home', 'roar'));
  await page.addStyleTag({ content: '[class*=debug]{display:none!important}' });
  await page.waitForTimeout(1200);
  for (const [name, t] of [['bat', 1300], ['scuff', 3300], ['shoulder', 4400], ['bowler', 5000], ['landing', 6200]]) {
    await page.evaluate(t => window.__cricket.introAt(t), t);
    await advance(40); await page.waitForTimeout(120);
    await page.screenshot({ path: `test-results/intro-${name}.png` });
  }
  console.log('        photographed test-results/intro-{bat,scuff,shoulder,bowler,landing}.png');
  check(!errors.length, 'no errors', errors.join('\n'));
  await page.close();
}

// ── Not asked for, not there ─────────────────────────────────────────────
console.log('without the switch');
{
  const { page, errors, walking, snap, advance } = await blast('');
  check(!(await walking()), 'an innings opens on the game\'s view as it always did');
  let phase = '';
  for (let i = 0; i < 30 && phase !== 'BOWLER_RUNUP' && phase !== 'BALL_IN_FLIGHT'; i++) { await advance(100); phase = (await snap()).phase; }
  check(phase === 'BOWLER_RUNUP' || phase === 'BALL_IN_FLIGHT', 'and the first ball comes as it did', phase);
  check(!errors.length, 'no errors', errors.join('\n'));
  await page.close();
}

await browser.close();
console.log(failures ? `\n${failures} failed` : '\nall passed');
process.exit(failures ? 1 : 0);
